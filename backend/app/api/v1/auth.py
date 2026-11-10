from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.exceptions import Forbidden, Unauthorized
from app.core.security import create_token, decode_token, hash_password, verify_password
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    email: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


def _tokens(user_id: int) -> dict:
    return {"access_token": create_token(user_id), "refresh_token": create_token(user_id, "refresh", 60 * 24 * 14),
            "token_type": "bearer"}


@router.post("/login")
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise Unauthorized("Неверный email или пароль")
    return _tokens(user.id)


@router.post("/register")
async def register(body: RegisterIn, db: AsyncSession = Depends(get_db)):
    if not settings.PUBLIC_SIGNUP:
        raise Forbidden("Регистрация временно недоступна")
    if (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none():
        raise Forbidden("Пользователь уже существует")
    user = User(email=body.email, password_hash=hash_password(body.password), role="user", tier="free")
    db.add(user)
    await db.commit()
    return _tokens(user.id)


@router.post("/refresh")
async def refresh(body: RefreshIn, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token)
        assert payload.get("kind") == "refresh"
        user = await db.get(User, int(payload["sub"]))
    except Exception:  # noqa: BLE001
        raise Unauthorized("Недействительный токен")
    if user is None:
        raise Unauthorized("Недействительный токен")
    return _tokens(user.id)


@router.post("/local")
async def local_login(request: Request, db: AsyncSession = Depends(get_db)):
    """Вход без пароля: только при LOCAL_AUTOLOGIN=true, не в публичном режиме и только с этого же компьютера."""
    host = request.client.host if request.client else ""
    if not settings.LOCAL_AUTOLOGIN or settings.PUBLIC_MODE or host not in ("127.0.0.1", "::1"):
        raise Forbidden("Автовход недоступен")
    user = (await db.execute(select(User).where(User.email == "admin@local"))).scalar_one_or_none()
    if user is None:
        raise Unauthorized("Пользователь не найден")
    return _tokens(user.id)
