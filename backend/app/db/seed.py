"""Начальные данные v1.0: администратор admin@local / admin."""
from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.models import User


async def seed_admin(session) -> User:
    res = await session.execute(select(User).where(User.email == "admin@local"))
    user = res.scalar_one_or_none()
    if user is None:
        user = User(email="admin@local", password_hash=hash_password(settings.ADMIN_PASSWORD), role="admin",
                    tier="admin", free_calculations_left=9999)
        session.add(user)
        await session.commit()
    return user
