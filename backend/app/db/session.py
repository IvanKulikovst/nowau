from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# В тестах новый event loop на каждый тест — пул соединений не переиспользуем
_kw = {"poolclass": NullPool} if settings.ENVIRONMENT == "test" else {"pool_pre_ping": True}
engine = create_async_engine(settings.DATABASE_URL, **_kw)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with SessionLocal() as session:
        yield session
