"""HTTP helpers with an on-disk cache.

Training and verification must be reproducible: every network response used by
the pipeline is cached on disk, so a second training run works offline and
reproduces identical numbers.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from .config import CACHE_DIR

USER_AGENT = "mausam-sense-research/1.0 (hackathon prototype; contact: local)"
MAX_ATTEMPTS = 6
RETRY_SLEEP_S = 1.5
RATE_LIMIT_SLEEP_S = 15.0  # Open-Meteo returns HTTP 429 on bursts


class FetchError(RuntimeError):
    """Raised when a remote source cannot be reached after retries."""


# Global politeness throttle: never burst the free public APIs.
_MIN_INTERVAL_S = 0.5
_LAST_REQUEST_AT = [0.0]


def _politeness_wait() -> None:
    now = time.monotonic()
    wait = _LAST_REQUEST_AT[0] + _MIN_INTERVAL_S - now
    if wait > 0:
        time.sleep(wait)
    _LAST_REQUEST_AT[0] = time.monotonic()


def _cache_path(kind: str, key: str) -> Path:
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in key)[:80]
    folder = CACHE_DIR / kind
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{safe}-{digest}.json"


def fetch_json(
    url: str,
    *,
    kind: str,
    cache_key: str | None = None,
    refresh: bool = False,
    timeout: int = 60,
) -> Any:
    """GET ``url`` as JSON with disk caching and bounded retries.

    Parameters
    ----------
    kind:
        Cache sub-folder (e.g. ``"obs"``, ``"prevruns"``, ``"forecast"``).
    cache_key:
        Human-readable cache file stem; defaults to a hash of the URL.
    refresh:
        Ignore any cached body and refetch.
    """
    key = cache_key or url
    path = _cache_path(kind, key)
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding="utf-8"))

    last_error: Exception | None = None
    for attempt in range(MAX_ATTEMPTS):
        _politeness_wait()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read()
            payload = json.loads(body.decode("utf-8"))
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(payload), encoding="utf-8")
            tmp.replace(path)
            return payload
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if isinstance(exc, urllib.error.HTTPError):
                if exc.code == 429:
                    # Rate limited: back off generously before retrying.
                    time.sleep(RATE_LIMIT_SLEEP_S * (attempt + 1))
                    continue
                if exc.code < 500:
                    break  # definitive client error — retrying will not help
            time.sleep(RETRY_SLEEP_S * (attempt + 1))
        except OSError as exc:  # network-level failures
            last_error = exc
            time.sleep(RETRY_SLEEP_S * (attempt + 1))
    raise FetchError(f"Could not fetch {url}: {last_error}")


def fetch_text(url: str, *, kind: str, cache_key: str | None = None, refresh: bool = False) -> str:
    """GET ``url`` as raw text (optionally gzipped) with disk caching."""
    key = cache_key or url
    path = _cache_path(kind, key)
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8")

    last_error: Exception | None = None
    for attempt in range(MAX_ATTEMPTS):
        _politeness_wait()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read()
                encoding = (resp.headers.get("Content-Encoding") or "").lower()
            if url.endswith(".gz") or encoding == "gzip":
                raw = gzip.decompress(raw)
            text = raw.decode("utf-8", errors="replace")
            path.write_text(text, encoding="utf-8")
            return text
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if isinstance(exc, urllib.error.HTTPError):
                if exc.code == 429:
                    time.sleep(RATE_LIMIT_SLEEP_S * (attempt + 1))
                    continue
                if exc.code < 500:
                    break
            time.sleep(RETRY_SLEEP_S * (attempt + 1))
        except OSError as exc:
            last_error = exc
            time.sleep(RETRY_SLEEP_S * (attempt + 1))
    raise FetchError(f"Could not fetch {url}: {last_error}")


def urlencode(params: dict[str, str | int | float]) -> str:
    return urllib.parse.urlencode(params)
