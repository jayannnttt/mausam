"""FastAPI application entry point.

Run from ``backend/``:

    uvicorn app.main:app --reload --port 8000

The service loads **pre-trained artifacts** at startup. It never trains models
during a request — training is an offline step (``python -m ml.train``).
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router
from .config import API_PREFIX, CORS_ORIGINS, SERVICE_NAME, SERVICE_VERSION
from .services import store


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.init_db()
    try:
        from ml import inference as I

        if I.bundle_available():
            I.load_bundle()  # preload artifacts once, not per request
    except Exception as exc:  # pragma: no cover - reported via /health
        print(f"[startup] model preload failed: {exc}")
    yield


app = FastAPI(
    title="Mausam Sense ML API",
    description=(
        "Rainfall prediction and forecast verification service for Mausam Sense "
        "(SIH 2026 — problem statement SIH26076, Mausam)."
    ),
    version=SERVICE_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "api": API_PREFIX,
        "endpoints": [
            f"{API_PREFIX}/health",
            f"{API_PREFIX}/sources",
            f"{API_PREFIX}/locations",
            f"{API_PREFIX}/predict",
            f"{API_PREFIX}/metrics",
            f"{API_PREFIX}/verification",
            f"{API_PREFIX}/history",
        ],
        "docs": "/docs",
        "time": datetime.now(timezone.utc).isoformat(),
    }
