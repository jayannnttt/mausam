"""Vercel Serverless Function entry point for FastAPI backend."""

import os
import sys
from pathlib import Path

# Paths
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"

# Ensure backend directory is in sys.path
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Serverless environment overrides (Vercel has read-only filesystem except /tmp)
TMP_DIR = Path("/tmp/mausam_data")
try:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    pass

os.environ.setdefault("MAUSAM_DATA_DIR", str(TMP_DIR))
os.environ.setdefault("MAUSAM_ARTIFACTS_DIR", str(BACKEND_DIR / "artifacts"))
os.environ.setdefault("MAUSAM_HISTORY_DB", str(TMP_DIR / "history.sqlite3"))

# Import FastAPI app from backend/app/main.py
from app.main import app
