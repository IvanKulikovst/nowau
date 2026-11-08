import secrets
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.exceptions import NotFound
from app.core.security import hash_api_key
from app.db.models import ApiKey, User
from app.db.session import get_db

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


class KeyIn(BaseModel):
    name: str = "default"


@router.post("")
async def create(body: KeyIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    raw = "cp_" + secrets.token_urlsafe(32)
    k = ApiKey(user_id=user.id, key_hash=hash_api_key(raw), name=body.name)
    db.add(k)
    await db.commit()
    return {"id": k.id, "name": k.name, "key": raw, "note": "Ключ показывается один раз"}


@router.get("")
async def list_keys(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(ApiKey).where(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None)))).scalars().all()
    return [{"id": k.id, "name": k.name, "created_at": k.created_at.isoformat() if k.created_at else None,
             "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None} for k in rows]


@router.delete("/{key_id}")
async def revoke(key_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    k = await db.get(ApiKey, key_id)
    if not k or k.user_id != user.id:
        raise NotFound("Ключ не найден")
    k.revoked_at = datetime.utcnow()
    await db.commit()
    return {"revoked": True}
