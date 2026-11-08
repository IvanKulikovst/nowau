"""М0. Фильтр конструкций (тест Бевзенко): устоит ли обеспечение в банкротстве."""

PASSES = ["pledge", "surety", "guarantee", "escrow", "title"]
FAILS = ["penalty", "deposit"]


def m0_filter(construction_type: str) -> dict:
    if construction_type in PASSES:
        return {"passes": True, "queue": "third_or_secured"}
    if construction_type in FAILS:
        return {"passes": False, "queue": "third"}
    return {"passes": True, "queue": "third"}
