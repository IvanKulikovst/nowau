"""М1. Очередь: базовый «потолок» требования."""
from datetime import date


def m1_queue(claim_date: date | None, filing_date: date | None, construction_type: str,
             is_credit_contract: bool, is_affiliated: bool) -> dict:
    if claim_date and filing_date and claim_date > filing_date:
        return {"queue": "current", "alpha": None}
    if construction_type == "pledge":
        return {"queue": "secured", "alpha": 0.8 if is_credit_contract else 0.7}
    if is_affiliated:
        return {"queue": "third_subordinated", "alpha": None}
    return {"queue": "third", "alpha": None}
