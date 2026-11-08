"""Повторные попытки с exponential backoff и circuit breaker (pybreaker)."""
import asyncio

import pybreaker

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("parsers")

efrsb_breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=60, name="efrsb")
kad_breaker = pybreaker.CircuitBreaker(fail_max=3, reset_timeout=60, name="kad")


class SourceUnavailable(Exception):
    pass


async def with_retry(fn, breaker: pybreaker.CircuitBreaker, attempts: int = 3, base_delay: float = 1.0):
    """Вызывает async-функцию: 3 попытки, задержки 1, 2, 4 с; при открытом breaker — SourceUnavailable."""
    if settings.CIRCUIT_BREAKER_ENABLED and breaker.current_state == pybreaker.STATE_OPEN:
        raise SourceUnavailable(f"{breaker.name}: circuit breaker открыт")
    last = None
    for i in range(attempts):
        try:
            result = await fn()
            if settings.CIRCUIT_BREAKER_ENABLED:
                breaker.call(lambda: None)  # фиксируем успех
            return result
        except Exception as e:  # noqa: BLE001
            last = e
            if settings.CIRCUIT_BREAKER_ENABLED:
                try:
                    breaker.call(_raise, e)
                except Exception:  # noqa: BLE001
                    pass
            log.warning("source_retry", source=breaker.name, attempt=i + 1, error=repr(e))
            if i < attempts - 1:
                await asyncio.sleep(base_delay * (2 ** i))
    raise SourceUnavailable(f"{breaker.name}: {last!r}")


def _raise(e):
    raise e
