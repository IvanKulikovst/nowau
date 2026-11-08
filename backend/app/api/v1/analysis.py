from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import audit, get_current_user
from app.core.exceptions import AppError
from app.db.models import User
from app.db.session import get_db
from app.services import analysis as svc

router = APIRouter(tags=["analysis"])

MODES = Literal["P0", "P1", "P2", "P3", "P4", "P5", "P6"]


class ClaimIn(BaseModel):
    amount: float | None = Field(default=None, gt=0, description="Сумма требования, ₽")
    construction_type: str = "supply"
    is_credit_contract: bool = False
    claim_date: date | None = None
    execution_date: date | None = None
    executed_amount: float = Field(default=0, ge=0)
    status: Literal["independent", "affiliated", "kdl"] = "independent"
    crisis: bool = False
    rescue_form: bool = False
    unusual_conditions: bool = False
    exceptions: dict[str, bool] = {}
    beneficial_interest: bool = False
    only_covenants: bool = False
    is_equivalent: bool = True
    has_harm_intent: bool = False
    is_gratuitous: bool = False
    is_interested: bool = False


class JudgeIn(BaseModel):
    name: str = "Судья (ввод вручную)"
    n_cases: int = Field(ge=0)
    approval_rate: float = Field(ge=0, le=1)
    is_significant: bool = False


class AUIn(BaseModel):
    name: str = "АУ (ввод вручную)"
    sro: str | None = None
    n_cases: int = Field(ge=0)
    filed_on_your_deal: bool = False
    filed_similar: int = Field(default=0, ge=0)
    passive_on_suspicious: bool = False
    losses_recovered: bool = False
    rau_top20: bool = False


class CollateralIn(BaseModel):
    C: float = Field(gt=0, description="Рыночная стоимость")
    L: float = Field(gt=0, le=1, description="Ликвидность 0…1")


class ManualIn(BaseModel):
    """Данные дела, введённые вручную (перекрывают данные парсеров)."""
    filing_date: date | None = None
    total_assets: float | None = Field(default=None, ge=0)
    current_expenses: float | None = Field(default=None, ge=0)
    first_priority: float | None = Field(default=None, ge=0)
    second_priority: float | None = Field(default=None, ge=0)
    sigma3: float | None = Field(default=None, gt=0, description="Сумма требований третьей очереди")
    sigma_sub: float | None = Field(default=None, ge=0)
    court_avg: float | None = Field(default=None, ge=0, le=1)
    judge: JudgeIn | None = None
    au: AUIn | None = None
    au_signals: dict[str, bool] | None = None
    collateral: list[CollateralIn] | None = None


class AnalyzeIn(BaseModel):
    inn: str | None = Field(default=None, pattern=r"^(\d{10}|\d{12})$")
    case_number: str | None = Field(default=None, max_length=50)
    claim: ClaimIn | None = None
    manual: ManualIn | None = None
    mode: MODES | None = None

    @model_validator(mode="after")
    def need_one(self):
        if not self.inn and not self.case_number:
            raise ValueError("Укажите ИНН или номер дела")
        return self


@router.post("/analyze")
async def analyze(body: AnalyzeIn, request: Request, db: AsyncSession = Depends(get_db),
                  user: User = Depends(get_current_user)):
    claim = body.claim.model_dump(mode="json") if body.claim else {}
    p = await svc.run_analysis(db, user, inn=body.inn, case_number=body.case_number, claim=claim,
                               manual=body.manual.model_dump(mode="json", exclude_none=True) if body.manual else None,
                               mode_override=body.mode)
    await audit(db, request, user, "analyze", "creditor_profile", p.id)
    return svc.summary_view(p)


@router.get("/analysis/{profile_id}")
async def get_analysis(profile_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return svc.summary_view(await svc.get_profile(db, profile_id, user))


@router.get("/analysis/{profile_id}/details")
async def get_details(profile_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return svc.details_view(await svc.get_profile(db, profile_id, user))


@router.get("/analysis/{profile_id}/audit")
async def get_audit(profile_id: int, request: Request, db: AsyncSession = Depends(get_db),
                    user: User = Depends(get_current_user)):
    p = await svc.get_profile(db, profile_id, user)
    await audit(db, request, user, "view_audit", "creditor_profile", p.id)
    return svc.audit_view(p)


@router.get("/analysis/{profile_id}/registry")
async def get_registry(profile_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    p = await svc.get_profile(db, profile_id, user)
    r = p.report or {}
    return {"id": p.id, "mode": p.mode, "available": p.mode in ("P5", "P6"), "rows": r.get("registry_rows", []),
            "note": None if p.mode in ("P5", "P6") else "Сравнение с реестром доступно с режима Р5 (реестр закрыт).",
            "demo_data": r.get("bundle_source") == "mock"}


@router.get("/analyses")
async def list_analyses(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from sqlalchemy import select
    from app.db.models import CreditorProfile
    rows = (await db.execute(select(CreditorProfile).where(CreditorProfile.user_id == user.id)
                             .order_by(CreditorProfile.id.desc()).limit(50))).scalars().all()
    return [{"id": p.id, "mode": p.mode, "case": (p.report or {}).get("case"),
             "expected_amount": (p.report or {}).get("expected_amount"),
             "expected_pct": (p.report or {}).get("expected_pct"),
             "calculated_at": p.calculated_at.isoformat() if p.calculated_at else None} for p in rows]
