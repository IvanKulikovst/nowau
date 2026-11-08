"""Детерминированные демо-данные (PARSERS_MODE=mock): результат зависит от ИНН / номера дела.

ИНН, оканчивающийся на 00 — дело не возбуждено (…000 → Р1, иначе Р2); иначе стадия определяется остатком от деления.
Данные НЕ реальные: интерфейс помечает такой расчёт как демонстрационный.
"""
import hashlib
from datetime import date, timedelta

JUDGES = [("Иванова А.А.", 45, 0.70, True), ("Сидоров В.Н.", 18, 0.38, False),
          ("Кузнецова М.П.", 8, 0.55, False), ("Орлов Д.С.", 62, 0.30, True)]
AUS = [("Петров П.П.", "СРО «Лидер»", 2, True), ("Смирнов К.Л.", "СРО «Альянс»", 0, False),
       ("Новиков Е.В.", "СРО «Лидер»", 1, False)]
STAGES = ["P3", "P4", "P4", "P5", "P6"]


def _seed(s: str) -> int:
    return int(hashlib.sha256(s.encode()).hexdigest(), 16)


def case_bundle(inn: str | None = None, case_number: str | None = None, today: date | None = None) -> dict:
    today = today or date.today()
    key = inn or case_number or "0"
    h = _seed(key)
    if inn and inn.endswith("00"):
        # ...000 — сделка без признаков кризиса (Р1); прочие ...00 — признаки кризиса, дело не возбуждено (Р2)
        return {"source": "mock", "found": False, "crisis_signs": not inn.endswith("000")}
    stage = STAGES[h % len(STAGES)]
    j = JUDGES[(h >> 3) % len(JUDGES)]
    a = AUS[(h >> 5) % len(AUS)]
    filing = today - timedelta(days=60 + (h >> 7) % 300)
    assets = float(50_000_000 + (h >> 9) % 200_000_000)
    sigma3 = assets * (0.6 + ((h >> 11) % 100) / 100)
    year = filing.year
    messages = [{"type": "case_opened", "date": filing.isoformat()}]
    if stage != "P3":
        messages += [{"type": "judge_appointed", "date": (filing + timedelta(days=5)).isoformat()},
                     {"type": "au_appointed", "date": (filing + timedelta(days=30)).isoformat()}]
    if stage in ("P5", "P6"):
        messages.append({"type": "registry_closed", "date": (filing + timedelta(days=120)).isoformat()})
    if stage == "P6":
        messages.append({"type": "trading_started", "date": (filing + timedelta(days=200)).isoformat()})
    return {
        "source": "mock", "found": True,
        "case_number": case_number or f"А40-{10000 + h % 89999}/{year}",
        "court": "Арбитражный суд города Москвы", "region": "Москва",
        "filing_date": filing.isoformat(), "stage": stage, "messages": messages,
        "debtor": {"inn": inn, "name": f"ООО «Демо-должник {str(h)[:4]}»", "type": "legal",
                   "industry": "trade", "total_assets": assets, "current_expenses": assets * 0.07,
                   "first_priority": 0.0, "second_priority": assets * 0.01},
        "judge": {"name": j[0], "n_cases": j[1], "approval_rate": j[2], "is_significant": j[3]},
        "court_avg": 0.43,
        "au": {"name": a[0], "sro": a[1], "n_cases": 20, "filed_similar": a[2],
               "filed_on_your_deal": False, "rau_top20": a[3], "losses_recovered": 0},
        "au_signals": {},
        "registry": {"sigma3": sigma3, "sigma_sub": sigma3 * 0.05},
        "collateral": [{"C": assets * 0.3, "L": 0.6, "type": "equipment"}] if h % 3 == 0 else [],
    }
