"""Слой 5. Прогнозы."""
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, created_col


class CreditorProfile(Base):
    __tablename__ = "creditor_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[int | None] = mapped_column(ForeignKey("claims.id"))
    user_id: Mapped[int | None] = mapped_column(Integer, index=True)
    p_sub: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    p_ch: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    p_zero: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    delta_practice: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    delta_au: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    expected_amount: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    expected_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    range_low: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    range_high: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    confidence: Mapped[str | None] = mapped_column(String(20))
    mode: Mapped[str | None] = mapped_column(String(10))
    information_levels: Mapped[dict | None] = mapped_column(JSONType)
    flags: Mapped[dict | None] = mapped_column(JSONType)
    report: Mapped[dict | None] = mapped_column(JSONType)   # полный отчёт расчёта (для details/audit)
    version: Mapped[int] = mapped_column(Integer, default=1)
    calculated_at = created_col()


class Scenario(Base):
    __tablename__ = "scenarios"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("creditor_profiles.id"))
    name: Mapped[str | None] = mapped_column(String(30))
    probability: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    payout_rub: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    payout_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    description: Mapped[str | None] = mapped_column(Text)


class Priority(Base):
    __tablename__ = "priority"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("creditor_profiles.id"))
    priority_1: Mapped[str | None] = mapped_column(String(100))
    priority_2: Mapped[str | None] = mapped_column(String(100))
    deferred: Mapped[str | None] = mapped_column(String(200))
    trigger: Mapped[str | None] = mapped_column(String(100))
    updated_at = created_col()
