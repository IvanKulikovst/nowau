from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import Unauthorized
from app.core.security import decode_token, hash_api_key
from app.db.models import ApiKey, AuditLog, User
from app.db.session import get_db


async def get_current_user(request: Request, authorization: str | None = Header(default=None),
                           x_api_key: str | None = Header(default=None),
                           db: AsyncSession = Depends(get_db)) -> User:
    user = None
    if x_api_key:
        res = await db.execute(select(ApiKey).where(ApiKey.key_hash == hash_api_key(x_api_key),
                                                    ApiKey.revoked_at.is_(None)))
        key = res.scalar_one_or_none()
        if key:
            user = await db.get(User, key.user_id)
    elif authorization and authorization.lower().startswith("bearer "):
        try:
            payload = decode_token(authorization[7:])
            if payload.get("kind") == "access":
                user = await db.get(User, int(payload["sub"]))
        except Exception:  # noqa: BLE001
            user = None
    if user is None:
        raise Unauthorized("Требуется авторизация")
    if not settings.BILLING_ENABLED:
        user.tier = "admin"
    request.state.user_id = user.id
    return user


async def audit(db: AsyncSession, request: Request, user: User, action: str, obj_type: str | None = None,
                obj_id: int | None = None) -> None:
    db.add(AuditLog(user_id=user.id, action=action, object_type=obj_type, object_id=obj_id,
                    ip_address=request.client.host if request.client else None))
    await db.commit()
