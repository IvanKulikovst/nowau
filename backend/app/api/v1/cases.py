from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.exceptions import NotFound
from app.db.models import Case, Claim, CreditorProfile, User
from app.db.session import get_db
from app.services import analysis as svc
from app.services.mode_detector import detect_mode

router = APIRouter(prefix="/cases", tags=["cases"])


class SetModeIn(BaseModel):
    mode: Literal["P0", "P1", "P2", "P3", "P4", "P5", "P6"]


async def _latest_profile(db, case_id: int, user: User) -> CreditorProfile:
    q = (select(CreditorProfile).join(Claim, Claim.id == CreditorProfile.claim_id)
         .where(Claim.case_id == case_id, CreditorProfile.user_id == user.id)
         .order_by(CreditorProfile.id.desc()).limit(1))
    p = (await db.execute(q)).scalar_one_or_none()
    if p is None:
        raise NotFound("Анализ по делу не найден")
    return p


@router.get("/detect-mode")
async def detect(inn: str | None = Query(default=None), case_number: str | None = Query(default=None),
                 user: User = Depends(get_current_user)):
    return await detect_mode(inn=inn, case_number=case_number)


@router.post("/{case_id}/set-mode")
async def set_mode(case_id: int, body: SetModeIn, db: AsyncSession = Depends(get_db),
                   user: User = Depends(get_current_user)):
    base = await _latest_profile(db, case_id, user)
    req = (base.report or {}).get("_request", {})
    new = await svc.run_analysis(db, user, inn=req.get("inn"), case_number=req.get("case_number"),
                                 claim=req.get("claim"), mode_override=body.mode, base_profile=base)
    return {**svc.summary_view(new), "warning": "Вы выбрали режим вручную. Автоматический расчёт может "
            "отличаться. Убедитесь, что данные актуальны."}


@router.get("/{case_id}/levels")
async def levels(case_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    p = await _latest_profile(db, case_id, user)
    return {"case_id": case_id, "mode": p.mode, "levels": p.information_levels}
