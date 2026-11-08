"""Автоматическое определение режима Р0–Р6 по данным КАД/ЕФРСБ."""
from app.services.parsers import fetch_case_bundle


def mode_from_bundle(bundle: dict) -> dict:
    if not bundle.get("found"):
        if bundle.get("crisis_signs"):
            return {"mode": "P2", "reason": "Признаки кризиса, дело не возбуждено"}
        return {"mode": "P1", "reason": "Сделка заключена, банкротства нет"}
    types = {m.get("type") for m in bundle.get("messages", [])}
    if not bundle.get("messages") and not bundle.get("debtor", {}).get("name"):
        return {"mode": "P3", "reason": "Заявление подано, данные ЕФРСБ ещё не опубликованы"}
    if "trading_started" in types:
        return {"mode": "P6", "reason": "Торги начались"}
    if "registry_closed" in types:
        return {"mode": "P5", "reason": "Реестр закрыт"}
    if {"judge_appointed", "au_appointed"} <= types:
        return {"mode": "P4", "reason": "Судья и АУ известны"}
    return {"mode": "P3", "reason": "Дело возбуждено, судья не определён"}


async def detect_mode(inn: str | None = None, case_number: str | None = None) -> dict:
    bundle = await fetch_case_bundle(inn=inn, case_number=case_number)
    return {**mode_from_bundle(bundle), "status": bundle.get("status"), "warnings": bundle.get("warnings", [])}
