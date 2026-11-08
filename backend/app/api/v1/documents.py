from datetime import datetime

from fastapi import APIRouter, Depends, File, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import audit, get_current_user
from app.core.config import settings
from app.core.exceptions import AppError, NotFound
from app.db.models import Claim, CreditorProfile, Document, ExtractedFact, User
from app.db.session import get_db
from app.services import analysis as svc
from app.services import document_processor as dp

router = APIRouter(tags=["documents"])
claims_router = APIRouter(prefix="/claims", tags=["documents"])
docs_router = APIRouter(prefix="/documents", tags=["documents"])


class ConfirmIn(BaseModel):
    fact_ids: list[int] | None = None   # None — подтвердить все факты документа


async def _own_claim(db, claim_id: int, user: User) -> Claim:
    claim = await db.get(Claim, claim_id)
    if claim is None:
        raise NotFound("Требование не найдено")
    q = select(CreditorProfile.id).where(CreditorProfile.claim_id == claim_id, CreditorProfile.user_id == user.id)
    if user.role != "admin" and (await db.execute(q)).first() is None:
        raise NotFound("Требование не найдено")
    return claim


@claims_router.post("/{claim_id}/documents")
async def upload(claim_id: int, request: Request, file: UploadFile = File(...),
                 db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await _own_claim(db, claim_id, user)
    mime = file.content_type or ""
    if mime not in dp.ALLOWED:
        raise AppError("Поддерживаются PDF, DOCX, JPG, PNG", 415)
    data = await file.read()
    if len(data) > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise AppError(f"Файл больше {settings.MAX_FILE_SIZE_MB} МБ", 413)
    path = dp.storage_path(settings.STORAGE_PATH, claim_id, file.filename or "file" + dp.ALLOWED[mime])
    path.write_bytes(data)
    doc = Document(claim_id=claim_id, document_type="other", file_path=str(path), file_size=len(data),
                   mime_type=mime, processing_status="processing")
    db.add(doc)
    await db.flush()
    try:
        text = dp.extract_text(str(path), mime)
        doc.document_type = dp.classify(text)
        facts = dp.extract_facts(text, doc.document_type)
        for f in facts:
            db.add(ExtractedFact(document_id=doc.id, field_name=f["field"], field_value=f["value"],
                                 confidence=f["confidence"], confirmed=False))
        doc.processing_status = "processed" if text.strip() else "no_text"
    except Exception as e:  # noqa: BLE001
        doc.processing_status = "failed"
        facts = []
    await db.commit()
    await audit(db, request, user, "upload_document", "document", doc.id)
    return {"id": doc.id, "status": doc.processing_status, "document_type": doc.document_type,
            "facts": [{"field": f["field"], "value": f["value"], "confidence": f["confidence"]} for f in facts],
            "needs_confirmation": bool(facts)}


@claims_router.get("/{claim_id}/documents")
async def list_documents(claim_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await _own_claim(db, claim_id, user)
    docs = (await db.execute(select(Document).where(Document.claim_id == claim_id).order_by(Document.id))).scalars().all()
    return [{"id": d.id, "document_type": d.document_type, "mime_type": d.mime_type, "file_size": d.file_size,
             "status": d.processing_status, "created_at": d.created_at.isoformat() if d.created_at else None}
            for d in docs]


@docs_router.get("/{doc_id}/status")
async def status(doc_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    doc = await db.get(Document, doc_id)
    if doc is None:
        raise NotFound("Документ не найден")
    await _own_claim(db, doc.claim_id, user)
    facts = (await db.execute(select(ExtractedFact).where(ExtractedFact.document_id == doc_id))).scalars().all()
    return {"id": doc.id, "status": doc.processing_status, "document_type": doc.document_type,
            "facts": [{"id": f.id, "field": f.field_name, "value": f.field_value,
                       "confidence": float(f.confidence or 0), "confirmed": f.confirmed,
                       "label": "подтверждено" if f.confirmed else "требует проверки"} for f in facts]}


@docs_router.post("/{doc_id}/confirm-facts")
async def confirm(doc_id: int, body: ConfirmIn, db: AsyncSession = Depends(get_db),
                  user: User = Depends(get_current_user)):
    doc = await db.get(Document, doc_id)
    if doc is None:
        raise NotFound("Документ не найден")
    await _own_claim(db, doc.claim_id, user)
    facts = (await db.execute(select(ExtractedFact).where(ExtractedFact.document_id == doc_id))).scalars().all()
    for f in facts:
        if body.fact_ids is None or f.id in body.fact_ids:
            f.confirmed = True
    await db.commit()
    # пересчёт профиля с учётом подтверждённых фактов
    base = (await db.execute(select(CreditorProfile).where(CreditorProfile.claim_id == doc.claim_id)
                             .order_by(CreditorProfile.id.desc()).limit(1))).scalar_one_or_none()
    new_id = None
    if base:
        req = (base.report or {}).get("_request", {})
        mode = base.mode if (base.report or {}).get("mode_manual") else None
        new = await svc.run_analysis(db, user, inn=req.get("inn"), case_number=req.get("case_number"),
                                     claim=req.get("claim"), manual=req.get("manual"), mode_override=mode, base_profile=base)
        new_id = new.id
    return {"confirmed": sum(f.confirmed for f in facts), "total": len(facts), "analysis_id": new_id}
