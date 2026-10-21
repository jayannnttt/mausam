"""Prediction history store (SQLite, single-process service)."""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any

from ..config import HISTORY_DB_PATH, HISTORY_MAX_ROWS

_lock = threading.Lock()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    location_name TEXT,
    days INTEGER NOT NULL,
    local_date TEXT,
    payload TEXT NOT NULL
);
"""


def _connect() -> sqlite3.Connection:
    HISTORY_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(HISTORY_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _lock, _connect() as conn:
        conn.executescript(_SCHEMA)


def record_prediction(payload: dict[str, Any]) -> int:
    """Store one prediction request; prune to the configured maximum."""
    loc = payload.get("location") or {}
    with _lock, _connect() as conn:
        cur = conn.execute(
            "INSERT INTO predictions (created_at, latitude, longitude, location_name, days, "
            "local_date, payload) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                payload.get("issued_at") or datetime.now(timezone.utc).isoformat(),
                float(loc.get("latitude") or 0.0),
                float(loc.get("longitude") or 0.0),
                loc.get("name"),
                int(payload.get("horizon_days") or 0),
                payload.get("local_date"),
                json.dumps(payload),
            ),
        )
        conn.execute(
            "DELETE FROM predictions WHERE id NOT IN "
            "(SELECT id FROM predictions ORDER BY id DESC LIMIT ?)",
            (HISTORY_MAX_ROWS,),
        )
        return int(cur.lastrowid or 0)


def recent_predictions(limit: int = 50) -> list[dict[str, Any]]:
    limit = max(1, min(limit, HISTORY_MAX_ROWS))
    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT id, created_at, latitude, longitude, location_name, days, local_date, payload "
            "FROM predictions ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        out.append(
            {
                "id": row["id"],
                "created_at": row["created_at"],
                "latitude": row["latitude"],
                "longitude": row["longitude"],
                "location_name": row["location_name"],
                "days": row["days"],
                "local_date": row["local_date"],
                "payload": json.loads(row["payload"]),
            }
        )
    return out


def history_stats() -> dict[str, Any]:
    with _lock, _connect() as conn:
        count = conn.execute("SELECT COUNT(*) AS n FROM predictions").fetchone()["n"]
    return {"stored_predictions": int(count), "max_rows": HISTORY_MAX_ROWS}
