"""FastAPI service configuration — everything comes from environment variables."""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _split(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


# CORS: in production set CORS_ORIGINS to your Vercel deployment origin, e.g.
# "https://mausam-sense.vercel.app".
CORS_ORIGINS = _split(os.environ.get("CORS_ORIGINS", "*"))

# Optional official IMD integration (https://api.imd.gov.in). Without a key the
# API reports IMD data as unavailable with a precise reason — nothing is faked.
IMD_API_KEY = os.environ.get("IMD_API_KEY", "").strip()
IMD_DISTRICT_ID = os.environ.get("IMD_DISTRICT_ID", "").strip()
IMD_BASE_URL = os.environ.get("IMD_BASE_URL", "https://api.imd.gov.in/api/v1").rstrip("/")

# SQLite file storing recent prediction requests (single-process service).
HISTORY_DB_PATH = Path(
    os.environ.get("MAUSAM_HISTORY_DB", BACKEND_DIR / "data" / "history.sqlite3")
)
HISTORY_MAX_ROWS = int(os.environ.get("MAUSAM_HISTORY_MAX_ROWS", "500"))

API_PREFIX = "/api/v1"
SERVICE_NAME = "mausam-sense-ml"
SERVICE_VERSION = "1.0.0"
