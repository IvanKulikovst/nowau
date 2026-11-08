"""Слой 2. Дела."""
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_col


class Debtor(Base):
    __tablename__ = "debtors"
    id: Mapped[int] = mapped_column(primary_key=True)
    inn: Mapped[str | None] = mapped_column(String(12), index=True)
    ogrn: Mapped[str | None] = mapped_column(String(15))
    type: Mapped[str | None] = mapped_column(String(20))
    name: Mapped[str | None] = mapped_column(String(500))
    industry: Mapped[str | None] = mapped_column(String(100))
    region: Mapped[str | None] = mapped_column(String(100))
    total_assets: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    current_expenses: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    first_priority: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    second_priority: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    executive_fee: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    has_property: Mapped[bool | None] = mapped_column(Boolean)
    created_at = created_col()


class Case(Base):
    __tablename__ = "cases"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_number: Mapped[str] = mapped_column(String(50), unique=True)
    court_id: Mapped[int | None] = mapped_column(ForeignKey("courts.id"))
    judge_id: Mapped[int | None] = mapped_column(ForeignKey("judges.id"))
    au_id: Mapped[int | None] = mapped_column(ForeignKey("au.id"))
    debtor_id: Mapped[int | None] = mapped_column(ForeignKey("debtors.id"))
    filing_date: Mapped[date | None] = mapped_column(Date)
    procedure_start_date: Mapped[date | None] = mapped_column(Date)
    current_stage: Mapped[str | None] = mapped_column(String(10))
    status: Mapped[str | None] = mapped_column(String(50))
    created_at = created_col()
    updated_at = created_col()


class Collateral(Base):
    __tablename__ = "collateral"
    id: Mapped[int] = mapped_column(primary_key=True)
    debtor_id: Mapped[int | None] = mapped_column(ForeignKey("debtors.id"))
    asset_type: Mapped[str | None] = mapped_column(String(100))
    market_value: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    liquidity: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    pledgee: Mapped[str | None] = mapped_column(String(255))
    registered: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at = created_col()
