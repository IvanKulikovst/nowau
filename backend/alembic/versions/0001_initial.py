"""Начальная схема: все 8 слоёв таблиц (31 таблица) + администратор.

Схема строится из метаданных моделей на момент выпуска v1.0. Все последующие изменения —
обычными миграциями `alembic revision --autogenerate`.

Revision ID: 0001
Revises:
"""
from alembic import op

import app.db.models  # noqa: F401
from app.db.base import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
