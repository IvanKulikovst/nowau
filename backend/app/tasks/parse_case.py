"""Фоновый разбор дела: обновляет данные источников."""
from app.services.parsers import fetch_case_bundle
from app.tasks.celery_app import celery


@celery.task(name="parse_case")
def parse_case(inn: str | None = None, case_number: str | None = None) -> dict:
    import asyncio
    b = asyncio.run(fetch_case_bundle(inn=inn, case_number=case_number))
    return {"found": b.get("found"), "status": b.get("status")}
