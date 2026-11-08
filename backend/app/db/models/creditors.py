"""Слой 3. Кредиторы."""
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, created_col


class Creditor(Base):
    __tablename__ = "creditors"
    id: Mapped[int] = mapped_column(primary_key=True)
    inn: Mapped[str | None] = mapped_column(String(12))
    name: Mapped[str | None] = mapped_column(String(500))
    connection_type: Mapped[str | None] = mapped_column(String(30))
    created_at = created_col()


class Claim(Base):
    __tablename__ = "claims"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id"))
    creditor_id: Mapped[int | None] = mapped_column(ForeignKey("creditors.id"))
    amount: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    claim_date: Mapped[date | None] = mapped_column(Date)
    construction_type: Mapped[str | None] = mapped_column(String(50))
    is_credit_contract: Mapped[bool] = mapped_column(Boolean, default=False)
    collateral_id: Mapped[int | None] = mapped_column(ForeignKey("collateral.id"))
    status: Mapped[str | None] = mapped_column(String(50))
    execution_date: Mapped[date | None] = mapped_column(Date)
    created_at = created_col()


class ClaimDocument(Base):
    __tablename__ = "claim_documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[int | None] = mapped_column(ForeignKey("claims.id"))
    document_type: Mapped[str | None] = mapped_column(String(50))
    file_path: Mapped[str | None] = mapped_column(String(500))
    extracted_data: Mapped[dict | None] = mapped_column(JSONType)
    processing_status: Mapped[str | None] = mapped_column(String(30))
    created_at = created_col()
