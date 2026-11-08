"""Точка входа FastAPI «Профиль кредитора»."""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.v1 import api_router
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.core.middleware.cors import add_cors
from app.core.middleware.errors import register_error_handlers
from app.core.middleware.logging import LoggingMiddleware
from app.core.middleware.rate_limit import RateLimitMiddleware
from app.core.middleware.request_id import RequestIDMiddleware
from app.db.base import Base
from app.db.seed import seed_admin
from app.db.session import SessionLocal, engine

configure_logging()
log = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.ENVIRONMENT in ("local", "test"):
        # Для локального запуска без alembic; в prod схему создаёт `alembic upgrade head`
        import app.db.models  # noqa: F401
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as s:
        await seed_admin(s)
    if settings.PUBLIC_MODE and (settings.SECRET_KEY == "change-me-in-production" or settings.ADMIN_PASSWORD == "admin"):
        log.warning("insecure_public_config", hint="Задайте SECRET_KEY и ADMIN_PASSWORD")
    log.info("startup", environment=settings.ENVIRONMENT, public_mode=settings.PUBLIC_MODE,
             parsers=settings.PARSERS_MODE)
    yield


app = FastAPI(title="Профиль кредитора", version="1.0", lifespan=lifespan)
register_error_handlers(app)
# порядок: последний добавленный выполняется первым
add_cors(app)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(LoggingMiddleware)
app.add_middleware(RequestIDMiddleware)
app.include_router(health_router)
app.include_router(api_router)

if settings.METRICS_ENABLED:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
