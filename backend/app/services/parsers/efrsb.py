"""ЕФРСБ (httpx): карточка должника и сообщения. Кэш: карточка 7 суток, сообщения 24 ч."""
from typing import Optional

import httpx

from app.core.cache import cache_get, cache_set
from app.core.config import settings
from app.services.parsers.resilience import efrsb_breaker, with_retry


def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.EFRSB_API_KEY}"} if settings.EFRSB_API_KEY else {}


async def get_bankrupt(inn: str) -> Optional[dict]:
    key = f"efrsb:bankrupt:{inn}"
    if (c := await cache_get(key)) is not None:
        return c or None

    async def call():
        async with httpx.AsyncClient(timeout=30, headers=_headers()) as client:
            r = await client.get(f"{settings.EFRSB_API_URL}/bankrupts", params={"inn": inn})
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()

    data = await with_retry(call, efrsb_breaker)
    await cache_set(key, data or {}, 7 * 86400)
    return data


async def get_messages(bankrupt_guid: str, page: int = 1) -> list:
    key = f"efrsb:messages:{bankrupt_guid}:{page}"
    if (c := await cache_get(key)) is not None:
        return c

    async def call():
        async with httpx.AsyncClient(timeout=30, headers=_headers()) as client:
            r = await client.get(f"{settings.EFRSB_API_URL}/bankruptcy-messages",
                                 params={"bankruptGuid": bankrupt_guid, "page": page, "limit": 1000})
            r.raise_for_status()
            return r.json().get("items", [])

    items = await with_retry(call, efrsb_breaker)
    await cache_set(key, items, 86400)
    return items


async def get_arbitr_manager(guid: str) -> Optional[dict]:
    async def call():
        async with httpx.AsyncClient(timeout=30, headers=_headers()) as client:
            r = await client.get(f"{settings.EFRSB_API_URL}/arbitr-managers", params={"guid": guid})
            r.raise_for_status()
            return r.json()
    return await with_retry(call, efrsb_breaker)
