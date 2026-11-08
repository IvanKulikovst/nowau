from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.exceptions import AppError
from app.core.security import hash_password, verify_password
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "role": user.role, "tier": user.tier,
            "free_calculations_left": user.free_calculations_left,
            "flags": {"billing_enabled": settings.BILLING_ENABLED, "public_signup": settings.PUBLIC_SIGNUP,
                      "public_mode": settings.PUBLIC_MODE, "show_cookie_banner": settings.SHOW_COOKIE_BANNER,
                      "parsers_mode": settings.PARSERS_MODE}}


@router.get("/me/subscription")
async def subscription(user: User = Depends(get_current_user)):
    if not settings.BILLING_ENABLED:
        return {"status": "disabled", "tier": "admin", "message": "Оплата скоро"}
    return {"status": "none", "tier": user.tier,
            "until": user.subscription_until.isoformat() if user.subscription_until else None}


class PasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6)


@router.post("/me/password")
async def change_password(body: PasswordIn, user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    if not user.password_hash or not verify_password(body.old_password, user.password_hash):
        raise AppError("Неверный текущий пароль", 400)
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"changed": True}
