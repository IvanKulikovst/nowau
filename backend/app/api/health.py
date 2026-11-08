import httpx
from fastapi import APIRouter, Response
from sqlalchemy import text

from app.core.cache import redis_ping
from app.core.config import settings
from app.db.session import engine

router = APIRouter(tags=["health"])


async def _check_db() -> bool:
    try:
        async with engine.connect() as c:
            await c.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        return False


async def _check_url(url: str) -> str:
    if settings.PARSERS_MODE == "mock":
        return "mock"
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(url)
        return "ok" if r.status_code < 500 else "down"
    except Exception:  # noqa: BLE001
        return "down"


@router.get("/health")
async def health():
    db, redis = await _check_db(), await redis_ping()
    return {"status": "ok" if db else "degraded", "db": "ok" if db else "down",
            "redis": "ok" if redis else "unavailable (in-memory fallback)",
            "efrsb": await _check_url(settings.EFRSB_API_URL), "kad": await _check_url(settings.KAD_BASE_URL),
            "version": "1.0", "public_mode": settings.PUBLIC_MODE}


@router.get("/ready")
async def ready(response: Response):
    if await _check_db():
        return {"ready": True}
    response.status_code = 503
    return {"ready": False}
