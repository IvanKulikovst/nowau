"""Кэш: Redis, при недоступности — in-memory (локальный запуск без Redis не падает)."""
import json
import time

from app.core.config import settings

_mem: dict[str, tuple[float, str]] = {}
_redis = None
_redis_failed = False


def _client():
    global _redis, _redis_failed
    if _redis_failed:
        return None
    if _redis is None:
        try:
            import redis.asyncio as aioredis
            _redis = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=1, socket_timeout=1)
        except Exception:
            _redis_failed = True
            return None
    return _redis


async def cache_get(key: str):
    c = _client()
    if c is not None:
        try:
            v = await c.get(key)
            return json.loads(v) if v else None
        except Exception:
            pass
    item = _mem.get(key)
    if item and item[0] > time.time():
        return json.loads(item[1])
    return None


async def cache_set(key: str, value, ttl: int) -> None:
    raw = json.dumps(value, default=str)
    c = _client()
    if c is not None:
        try:
            await c.set(key, raw, ex=ttl)
            return
        except Exception:
            pass
    _mem[key] = (time.time() + ttl, raw)


async def redis_ping() -> bool:
    c = _client()
    if c is None:
        return False
    try:
        return bool(await c.ping())
    except Exception:
        return False
