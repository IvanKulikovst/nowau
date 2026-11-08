"""Оркестратор расчёта «Профиль кредитора»: М0 → М1 → М2.1 → М2.2 → М3 → М4 → М5 → решения."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.services.formulas import D, E_R, E_R_final, R_3, R_sec, R_sub, clamp
from app.services.level_detector import detect_levels
from app.services.modules.m0_filter import m0_filter
from app.services.modules.m1_queue import m1_queue
from app.services.modules.m2_1_subordination import m2_1_subordination
from app.services.modules.m2_2_challenging import m2_2_challenging
from app.services.modules.m3_economics import executive_fee, m3_economics
from app.services.modules.m4_practice import au_independence_score, m4_practice
from app.services.modules.m5_calc import (
    P_CH_INDUSTRY, P_SUB_INDUSTRY, P_ZERO_INDUSTRY, base_payout, exact_discounted, m5_probabilistic,
)

DEFENSE_SUCCESS = 0.5          # допущение о вероятности успешной защиты сделки
MIN_ECONOMIC_GAIN = 500_000.0  # порог экономической целесообразности (раздел 18 ТЗ)
DEFAULT_SIGMA3_FACTOR = 10.0   # если реестр неизвестен: Σ3 ≈ 10 × требование (консервативно)

ACTION_COSTS = {
    "file_claim":       {"title": "Подача заявления",  "fee": 6000, "months": "1–3", "lawyers": (50_000, 150_000)},
    "registry":         {"title": "Включение в реестр", "fee": 0,    "months": "1–2", "lawyers": (30_000, 80_000)},
    "defend_deal":      {"title": "Защита сделки от оспаривания", "fee": 6000, "months": "3–6", "lawyers": (100_000, 300_000)},
    "objection":        {"title": "Возражения",         "fee": 0,    "months": "1–2", "lawyers": (50_000, 100_000)},
    "appeal":           {"title": "Обжалование",        "fee": 3000, "months": "1–2", "lawyers": (50_000, 100_000)},
    "remove_au":        {"title": "Отстранение АУ",     "fee": 0,    "months": "1–2", "lawyers": (50_000, 100_000)},
    "fight_subordination": {"title": "Защита от субординации", "fee": 0, "months": "2–4", "lawyers": (100_000, 250_000)},
}


@dataclass
class CalcInput:
    mode: str = "P4"
    # требование
    amount: float = 0.0
    construction_type: str = "supply"
    is_credit_contract: bool = False
    claim_date: date | None = None
    filing_date: date | None = None
    execution_date: date | None = None
    executed_amount: float = 0.0
    status: str = "independent"  # independent | affiliated | kdl
    crisis: bool = False
    rescue_form: bool = False
    unusual_conditions: bool = False
    exceptions: dict = field(default_factory=dict)
    beneficial_interest: bool = False
    only_covenants: bool = False
    is_equivalent: bool = True
    has_harm_intent: bool = False
    is_gratuitous: bool = False
    is_interested: bool = False
    # должник
    debtor_type: str = "legal"
    industry: str | None = None
    total_assets: float | None = None
    current_expenses: float = 0.0
    first_priority: float = 0.0
    second_priority: float = 0.0
    executive_fee: float | None = None
    collateral: list[dict] = field(default_factory=list)   # [{"C":..., "L":...}]
    sigma3: float | None = None
    sigma_sub: float = 0.0
    subsidiary_expected: float = 0.0
    # судья / АУ
    judge_stats: dict | None = None
    court_avg: float = 0.43
    au_stats: dict | None = None
    au_signals: dict = field(default_factory=dict)
    # предыдущий уровень данных
    data_flags: dict = field(default_factory=dict)
    facts_confirmed: bool = True


def _r(x: float) -> float:
    return round(float(x), 2)


def _level_label(p: float, hi: float, mid: float) -> str:
    return "высокий" if p >= hi else "средний" if p >= mid else "низкий"


def calculate(inp: CalcInput) -> dict:
    S = float(inp.amount)
    X = float(inp.executed_amount)
    warnings: list[str] = []
    assumptions: list[str] = []

    # --- М0 / М1 ---
    m0 = m0_filter(inp.construction_type)
    affiliated = inp.status in ("affiliated", "kdl")
    m1 = m1_queue(inp.claim_date, inp.filing_date, inp.construction_type, inp.is_credit_contract, affiliated)
    queue = m1["queue"]
    if not m0["passes"]:
        queue = "third"

    # --- М3 (экономика) ---
    assets_known = inp.total_assets is not None
    M0 = float(inp.total_assets or 0.0)
    fee = inp.executive_fee if inp.executive_fee is not None else 0.0
    m3 = m3_economics(M0, inp.current_expenses, inp.first_priority, inp.second_priority, fee,
                      inp.collateral, inp.industry, inp.debtor_type)
    M, C_net, p_zero_base = m3["M"], m3["total_collateral_net"], m3["p_zero"]
    if not assets_known:
        p_zero_base = P_ZERO_INDUSTRY if inp.debtor_type == "legal" else 0.94
        assumptions.append("Данные об имуществе должника отсутствуют: применён отраслевой p_zero.")
    alpha = m1["alpha"] or 0.7
    G_total = min(S, alpha * C_net) if queue == "secured" else 0.0
    M3 = max(0.0, M - (alpha * C_net if C_net else 0.0))
    if inp.sigma3 is None:
        sigma3 = S * DEFAULT_SIGMA3_FACTOR
        assumptions.append("Реестр неизвестен: Σ3 оценена как 10 × требование (консервативно).")
    else:
        sigma3 = float(inp.sigma3)
    sigma3 = max(sigma3, S)
    sigma_sub = max(inp.sigma_sub, S)
    if inp.subsidiary_expected:
        M3 += inp.subsidiary_expected

    # --- М2.1 / М2.2 ---
    ex = inp.exceptions
    m21 = m2_1_subordination(
        inp.status, inp.unusual_conditions, inp.crisis, inp.rescue_form,
        ex.get("surety_before_crisis", False), ex.get("non_voluntary", False),
        ex.get("market_practice", False), ex.get("majority_consent", False),
        inp.beneficial_interest, inp.only_covenants)
    m22 = m2_2_challenging(inp.execution_date, inp.filing_date, inp.is_equivalent, inp.has_harm_intent,
                           inp.is_gratuitous, inp.is_interested, X, M0)
    if not inp.facts_confirmed:
        assumptions.append("Факты из документов не подтверждены: применены консервативные допущения.")
        m22["p_ch"] = max(m22["p_ch"], 0.0 if m22["p_ch"] == 0 else m22["p_ch"] + 0.05)

    # --- М4 ---
    m4 = m4_practice(inp.judge_stats, inp.au_stats, inp.court_avg)
    p_sub = clamp(m21["p_sub"])
    p_ch = clamp(m22["p_ch"] + m4["delta_ch"] + m4["delta_au_ch"]) if m22["p_ch"] > 0 else 0.0
    p_zero = clamp(p_zero_base + m4["delta_au_zero"])

    au_idx = au_independence_score(inp.au_signals)
    if au_idx["critical"]:
        p_zero = max(p_zero, 0.85)

    # --- уровни данных / режим ---
    levels = detect_levels(inp.mode, {
        "has_assets": assets_known, "has_registry": inp.sigma3 is not None,
        "has_collateral": bool(inp.collateral), "has_judge_profile": m4["judge"]["profile"],
        "has_au_profile": m4["au"]["profile"], "has_execution": inp.execution_date is not None,
        "facts_confirmed": inp.facts_confirmed, **inp.data_flags})
    low_data = min(levels["M3"], levels["M2.1"], levels["M2.2"]) <= 1

    # --- М5: сценарии ---
    total_claim = S + X  # исходная сумма вместе с уже полученным
    r_base_v = base_payout(queue, S, M, M3, sigma3, C_net, alpha)
    base_total = r_base_v + X                                   # деньги на руках сохранены
    # оспаривание: X возвращается в массу, требование восстанавливается как реестровое
    ch_total = R_3(S + X, M3 + X, sigma3 + X) if X > 0 else R_3(S, M3, sigma3)
    sub_total = R_sub(S, M3, sigma3, sigma_sub) + X
    sub_after_ch = R_sub(S + X, M3 + X, sigma3 + X, sigma_sub + X) if X > 0 else R_sub(S, M3, sigma3, sigma_sub)

    method = "probabilistic" if inp.mode in ("P0", "P1", "P2") else \
             "scenario" if inp.mode in ("P3", "P4") else "exact"

    if method == "probabilistic":
        frac = m5_probabilistic(queue)
        expected = frac * total_claim
        formula = "E[R] = (1−p_sub)(1−p_ch)·R_base·(1−p_zero)"
    else:
        e_r = E_R(p_sub, p_ch, base_total, ch_total, sub_total, sub_after_ch)
        expected = E_R_final(e_r, p_zero)
        formula = "Ф5 + Ф6"
        if method == "exact":
            expected = exact_discounted(expected)
            formula += " + дисконтирование"
    if au_idx["critical"]:
        expected = min(expected, 0.05 * total_claim)
    expected = min(expected, total_claim)

    spread = 0.5 if low_data else 0.2
    range_low, range_high = max(0.0, expected * (1 - spread)), min(total_claim, expected * (1 + spread))
    pct = expected / total_claim if total_claim else 0.0

    scenarios = _scenarios(p_sub, p_ch, p_zero, base_total, ch_total, sub_total, sub_after_ch, total_claim)
    risks = _risks(p_sub, p_ch, p_zero, M3, C_net)
    actions, priorities = _decide(inp, queue, p_sub, p_ch, p_zero, expected, base_total, ch_total, au_idx, X)
    confidence = "low" if low_data else ("medium" if method == "scenario" else "high")

    return {
        "mode": inp.mode, "method": method, "formula": formula,
        "queue": queue, "m0": m0, "m1": m1, "m2_1": m21, "m2_2": m22, "m3": {**m3, "M3": M3}, "m4": m4,
        "p_sub": _r(p_sub), "p_ch": _r(p_ch), "p_zero": _r(p_zero),
        "claim_amount": _r(S), "executed_amount": _r(X), "total_claim": _r(total_claim),
        "expected_amount": _r(expected), "expected_pct": round(pct, 4),
        "range_low": _r(range_low), "range_high": _r(range_high),
        "range_low_pct": round(range_low / total_claim, 4) if total_claim else 0,
        "range_high_pct": round(range_high / total_claim, 4) if total_claim else 0,
        "confidence": confidence, "probabilistic_label": "Вероятностный прогноз",
        "information_levels": levels, "scenarios": scenarios, "risks": risks,
        "au_index": au_idx, "actions": actions, "priorities": priorities,
        "assumptions": assumptions, "warnings": warnings,
        "audit": {
            "M": _r(M), "M0": _r(M0), "C_net": _r(C_net), "M3": _r(M3), "sigma3": _r(sigma3),
            "sigma_sub": _r(sigma_sub), "G": _r(G_total), "alpha": alpha if queue == "secured" else None,
            "R_base": _r(base_total), "R_challenged": _r(ch_total), "R_sub": _r(sub_total),
            "R_sub_after_ch": _r(sub_after_ch),
            "formulas": _formula_lines(S, X, M0, inp, M, C_net, alpha, queue, M3, sigma3, base_total,
                                       p_sub, p_ch, p_zero, expected),
        },
    }


def _scenarios(p_sub, p_ch, p_zero, base, ch, sub, sub_ch, total):
    k = 1 - p_zero
    raw = [
        ("base", "Без оспаривания и субординации", (1 - p_sub) * (1 - p_ch) * k, base),
        ("challenged", "Оспаривание сделки", p_ch * (1 - p_sub) * k, ch),
        ("subordinated", "Субординация", p_sub * (1 - p_ch) * k, sub),
        ("subordinated_after_ch", "Оспаривание и субординация", p_sub * p_ch * k, sub_ch),
        ("zero", "Нулевая масса", p_zero, 0.0),
    ]
    return [{"name": n, "title": t, "probability": round(p, 4), "payout_rub": _r(v),
             "payout_pct": round(v / total, 4) if total else 0.0} for n, t, p, v in raw]


def _risks(p_sub, p_ch, p_zero, M3, C_net):
    def light(p, hi, mid):
        return "red" if p >= hi else "yellow" if p >= mid else "green"
    return [
        {"key": "challenging", "title": "Оспаривание (статистическая частота по аналогичным делам)",
         "p": _r(p_ch), "light": light(p_ch, 0.5, 0.3), "label": _level_label(p_ch, 0.5, 0.3)},
        {"key": "subordination", "title": "Субординация", "p": _r(p_sub),
         "light": light(p_sub, 0.5, 0.2), "label": _level_label(p_sub, 0.5, 0.2)},
        {"key": "mass", "title": "Конкурсная масса", "p": _r(p_zero),
         "light": light(p_zero, 0.6, 0.4),
         "label": "есть активы" if p_zero < 0.4 else "масса под вопросом" if p_zero < 0.6 else "масса вероятно пуста"},
    ]


def _cost(key: str) -> dict:
    c = ACTION_COSTS[key]
    lo, hi = c["lawyers"]
    return {"key": key, "title": c["title"], "fee_rub": c["fee"], "months": c["months"],
            "lawyers_rub": [lo, hi], "total_mid_rub": c["fee"] + (lo + hi) / 2}


def _decide(inp, queue, p_sub, p_ch, p_zero, expected, base_total, ch_total, au_idx, X):
    actions: list[dict] = []
    priorities: list[str] = []

    def add(key, why, gain=None, rank=50):
        cost = _cost(key)
        worth = True if gain is None else gain > cost["total_mid_rub"] and gain >= MIN_ECONOMIC_GAIN
        actions.append({**cost, "reason": why, "expected_gain_rub": None if gain is None else _r(gain),
                        "economically_justified": worth, "rank": rank})

    # П0: дедлайн всегда первый
    add("registry", "П0: включение в реестр — первое действие; пропуск 30-дневного срока необратим.", rank=0)
    priorities.append("П0 Дедлайн: включение в реестр")

    fight_sub = p_sub > 0.75
    if fight_sub:
        add("fight_subordination", f"П1: p_sub = {p_sub:.2f} > 0,75 — 99% субординированных требований не погашаются.",
            gain=max(base_total, 0) * 0.5, rank=10)
        priorities.append("П1 Борьба с субординацией")
    loss = max(0.0, base_total - ch_total)
    low_pay = p_zero > 0.80 and expected < MIN_ECONOMIC_GAIN
    if p_ch > 0.70 and not fight_sub and not low_pay:
        add("defend_deal", f"П2: p_ch = {p_ch:.2f} > 0,70 — приоритетная защита сделки; рассмотреть мировое соглашение.",
            gain=loss * DEFENSE_SUCCESS, rank=20)
        priorities.append("П2 Защита сделки")
    elif 0.5 <= p_ch <= 0.70 and X > 0 and not low_pay:
        add("defend_deal", f"Активная защита: p_ch = {p_ch:.2f}. Собрать доказательства встречного предоставления и рыночности условий.",
            gain=loss * DEFENSE_SUCCESS, rank=30)
        priorities.append("Активная защита сделки")
    elif 0.3 <= p_ch < 0.5 and X > 0:
        priorities.append("Пассивная защита сделки (хранить документы)")
    if au_idx["critical"]:
        add("remove_au", "П5: сумма баллов АУ > 60 — признаки аффилированности, требующие судебной проверки; "
            "ходатайство об отстранении (решение принимает суд).", rank=15)
        priorities.append("П5 Ходатайство об отстранении АУ")
    if low_pay:
        priorities.append("П3 Только включение в реестр (p_zero > 0,80, выплата < 500 тыс. ₽)")
    if p_zero > 0.80:
        priorities.append("Рассмотреть отказ от активных действий")
    actions.sort(key=lambda a: a["rank"])
    return actions, priorities


def _formula_lines(S, X, M0, inp, M, C_net, alpha, queue, M3, sigma3, base_total, p_sub, p_ch, p_zero, expected):
    f = lambda v: f"{v:,.0f}".replace(",", " ")
    lines = [
        f"M = max(0, {f(M0)} − {f(inp.current_expenses)} − {f(inp.first_priority)} − {f(inp.second_priority)} − {f(inp.executive_fee or 0)}) = {f(M)} ₽",
        f"C_net = Σ(C·L) = {f(C_net)} ₽",
    ]
    if queue == "secured":
        lines.append(f"G = α·C_net = {alpha}·{f(C_net)} = {f(min(S, alpha * C_net))} ₽ (Ф2)")
    lines += [
        f"M3 = {f(M3)} ₽, Σ3 = {f(sigma3)} ₽",
        f"Ф1: D({f(S)}, {f(M3)}, {f(sigma3)}) = {f(D(S, M3, sigma3))} ₽",
        f"p_sub = {p_sub:.2f}, p_ch = {p_ch:.2f}, p_zero = {p_zero:.2f}",
        f"Ф5/Ф6: E[R] = {f(expected)} ₽",
    ]
    return lines
