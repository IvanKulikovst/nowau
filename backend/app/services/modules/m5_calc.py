"""М5. Итоговый расчёт по режиму: вероятностный (Р0–Р2), сценарный (Р3–Р4), точный (Р5–Р6)."""
from app.services.formulas import D, E_R, E_R_final, R_3, R_sec, R_sub, discount_factor

# Отраслевые ориентиры для вероятностного режима (доли от суммы требования)
R_BASE_BY_TYPE = {"secured": 0.40, "third": 0.06, "third_subordinated": 0.06, "current": 0.90}
P_CH_INDUSTRY = 0.43
P_SUB_INDUSTRY = 0.10
P_ZERO_INDUSTRY = 0.43
AVG_PROCEDURE_DAYS = 1265
DISCOUNT_RATE = 0.16


def m5_probabilistic(queue: str) -> float:
    """E[R] в долях требования по отраслевым ориентирам (Р0–Р2):
    (1−p_sub_отр)(1−p_ch_отр)·R_base_тип·(1−p_zero_отр)."""
    r_base = R_BASE_BY_TYPE.get(queue, 0.06)
    return (1 - P_SUB_INDUSTRY) * (1 - P_CH_INDUSTRY) * r_base * (1 - P_ZERO_INDUSTRY)


def base_payout(queue: str, S: float, M: float, M3: float, Sigma3: float,
                C_net: float, alpha: float | None) -> float:
    """Выплата в базовом сценарии по очереди требования."""
    if queue == "current":
        return min(S, M)
    if queue == "secured":
        return R_sec(S, C_net, alpha or 0.7, M3, Sigma3)
    return R_3(S, M3, Sigma3)


def exact_discounted(payout: float, years: float | None = None, rate: float = DISCOUNT_RATE) -> float:
    t = years if years is not None else AVG_PROCEDURE_DAYS / 365
    return payout * discount_factor(rate, t)
