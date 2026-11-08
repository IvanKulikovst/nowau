"""Лимит по IP (100 запросов/мин). Redis; при его отсутствии — счётчик в памяти."""
import time

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core import cache
from app.core.config import settings

_local: dict[str, tuple[int, int]] = {}
EXEMPT = ("/health", "/ready", "/metrics")


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if not settings.RATE_LIMITING_ENABLED or request.url.path in EXEMPT:
            return await call_next(request)
        ip = request.client.host if request.client else "unknown"
        window = int(time.time() // 60)
        count = await self._incr(f"rl:{ip}:{window}")
        if count > settings.RATE_LIMIT_PER_MINUTE:
            return JSONResponse({"error": "Слишком много запросов",
                                 "request_id": getattr(request.state, "request_id", None)},
                                status_code=429, headers={"Retry-After": "60"})
        return await call_next(request)

    async def _incr(self, key: str) -> int:
        c = cache._client()
        if c is not None:
            try:
                n = await c.incr(key)
                if n == 1:
                    await c.expire(key, 61)
                return int(n)
            except Exception:
                pass
        window = int(key.rsplit(":", 1)[1])
        base = key.rsplit(":", 1)[0]
        for k in [k for k, (w, _) in _local.items() if w != window]:
            _local.pop(k, None)
        w, n = _local.get(base, (window, 0))
        _local[base] = (window, n + 1)
        return n + 1
