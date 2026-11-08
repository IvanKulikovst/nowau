import secrets

from fastapi import APIRouter, Depends
from pydantic import BaseModel, HttpUrl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.exceptions import NotFound
from app.db.models import User, WebhookSubscription
from app.db.session import get_db

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


class HookIn(BaseModel):
    url: HttpUrl
    events: list[str] = ["analysis.updated"]


@router.post("")
async def create(body: HookIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    h = WebhookSubscription(user_id=user.id, url=str(body.url), events=body.events, secret=secrets.token_hex(16))
    db.add(h)
    await db.commit()
    return {"id": h.id, "url": h.url, "events": h.events, "secret": h.secret}


@router.get("")
async def list_hooks(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(WebhookSubscription).where(WebhookSubscription.user_id == user.id))).scalars().all()
    return [{"id": h.id, "url": h.url, "events": h.events} for h in rows]


@router.delete("/{hook_id}")
async def delete(hook_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    h = await db.get(WebhookSubscription, hook_id)
    if not h or h.user_id != user.id:
        raise NotFound("Webhook не найден")
    await db.delete(h)
    await db.commit()
    return {"deleted": True}
