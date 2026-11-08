"""Слой 1. Справочники."""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_col


class Court(Base):
    __tablename__ = "courts"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    region: Mapped[str | None] = mapped_column(String(100))
    created_at = created_col()


class Judge(Base):
    __tablename__ = "judges"
    id: Mapped[int] = mapped_column(primary_key=True)
    court_id: Mapped[int | None] = mapped_column(ForeignKey("courts.id"))
    full_name: Mapped[str] = mapped_column(String(255))
    created_at = created_col()


class JudgeStats(Base):
    __tablename__ = "judge_stats"
    id: Mapped[int] = mapped_column(primary_key=True)
    judge_id: Mapped[int] = mapped_column(ForeignKey("judges.id"))
    category: Mapped[str | None] = mapped_column(String(50))
    n_cases: Mapped[int] = mapped_column(Integer, default=0)
    approval_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    style: Mapped[str | None] = mapped_column(String(20))
    avg_duration_days: Mapped[int | None] = mapped_column(Integer)
    confidence_interval: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    is_significant: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at = created_col()


class AU(Base):
    __tablename__ = "au"
    id: Mapped[int] = mapped_column(primary_key=True)
    inn: Mapped[str | None] = mapped_column(String(12), unique=True)
    full_name: Mapped[str | None] = mapped_column(String(255))
    sro: Mapped[str | None] = mapped_column(String(255))
    rating_rau: Mapped[int | None] = mapped_column(Integer)
    created_at = created_col()


class AUProfile(Base):
    __tablename__ = "au_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    au_id: Mapped[int] = mapped_column(ForeignKey("au.id"))
    n_cases: Mapped[int] = mapped_column(Integer, default=0)
    challenging_activity: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    challenging_success: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    losses_recovered: Mapped[int] = mapped_column(Integer, default=0)
    avg_discount: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at = created_col()


class DisqualifiedAU(Base):
    __tablename__ = "disqualified_au"
    id: Mapped[int] = mapped_column(primary_key=True)
    inn: Mapped[str | None] = mapped_column(String(12))
    full_name: Mapped[str | None] = mapped_column(String(255))
    disqualification_date: Mapped[date | None] = mapped_column(Date)
    reason: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(String(255))


class Legislation(Base):
    __tablename__ = "legislation"
    id: Mapped[int] = mapped_column(primary_key=True)
    act_name: Mapped[str | None] = mapped_column(String(500))
    act_date: Mapped[date | None] = mapped_column(Date)
    category: Mapped[str | None] = mapped_column(String(50))
    url: Mapped[str | None] = mapped_column(Text)
