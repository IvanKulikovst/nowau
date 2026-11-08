"""Слой 4. Реестр и расчёты."""
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, created_col


class Registry(Base):
    __tablename__ = "registry"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id"))
    claim_id: Mapped[int | None] = mapped_column(ForeignKey("claims.id"))
    included_amount: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    queue: Mapped[int | None] = mapped_column(Integer)
    is_subordinated: Mapped[bool] = mapped_column(Boolean, default=False)
    inclusion_date: Mapped[date | None] = mapped_column(Date)


class Mass(Base):
    __tablename__ = "mass"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id"))
    total_assets: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    current_expenses: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    first_priority: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    second_priority: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    pledge_deductions: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    executive_fee: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    net_mass: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    p_zero: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    version: Mapped[int] = mapped_column(Integer, default=1)
    calculated_at = created_col()


class Calculation(Base):
    __tablename__ = "calculations"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[int | None] = mapped_column(ForeignKey("claims.id"))
    mode: Mapped[str | None] = mapped_column(String(20))
    scenario: Mapped[str | None] = mapped_column(String(30))
    formula: Mapped[str | None] = mapped_column(String(60))
    result_rub: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    result_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    inputs: Mapped[dict | None] = mapped_column(JSONType)
    version: Mapped[int] = mapped_column(Integer, default=1)
    calculated_at = created_col()
