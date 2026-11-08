"""Уровни полноты данных (0–5) по каждому модулю."""

MODE_BASE_LEVEL = {"P0": 0, "P1": 1, "P2": 1, "P3": 2, "P4": 3, "P5": 4, "P6": 5}


def detect_levels(mode: str, data: dict) -> dict:
    base = MODE_BASE_LEVEL.get(mode, 0)
    m3 = base if data.get("has_assets") else min(base, 1)
    if data.get("has_assets") and data.get("has_collateral") and base >= 4:
        m3 = 5
    m1 = max(base, 4 if data.get("has_registry") else base)
    m21 = 2 if base >= 2 else 1
    if data.get("facts_confirmed") and data.get("has_affiliation_docs"):
        m21 = 4
    m22 = 1 if not data.get("has_execution") else max(2, min(base, 3))
    if data.get("has_execution") and data.get("facts_confirmed") and data.get("has_payment_docs"):
        m22 = 5
    m4 = 0
    if data.get("has_judge_profile"):
        m4 = 3
    if data.get("has_au_profile"):
        m4 = max(m4, 4)
    m5 = min(5, max(base, 1)) if data.get("has_registry") or base >= 3 else min(base, 2)
    return {"M0": 5, "M1": min(5, m1), "M2.1": m21, "M2.2": m22, "M3": m3, "M4": m4, "M5": m5}
