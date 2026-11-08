"""Универсальные формулы Ф1–Ф6 (раздел 6.8 ТЗ, глава 5 методики).

Все функции чистые (без БД и IO) и работают с float.
"""


def D(S: float, P: float, Sigma: float) -> float:
    """Ф1. Пропорциональное распределение: min(S, P·S/Σ)."""
    if Sigma <= 0 or S <= 0 or P <= 0:
        return 0.0
    return min(S, P * S / Sigma)


def R_sec(S: float, C_net: float, alpha: float, M3: float, Sigma3: float) -> float:
    """Ф2. Залоговый кредитор: G + D(S − G, M3, Σ3), где G = α·C_net (G не больше S)."""
    G = min(S, alpha * C_net)
    return G + D(S - G, M3, Sigma3)


def R_3(S: float, M3: float, Sigma3: float) -> float:
    """Ф3. Незалоговый кредитор третьей очереди."""
    return D(S, M3, Sigma3)


def R_sub(S: float, M3: float, Sigma3: float, Sigma_sub: float) -> float:
    """Ф4. Субординированный: получает только остаток после независимых кредиторов."""
    remaining = max(0.0, M3 - Sigma3)
    return D(S, remaining, Sigma_sub)


def E_R(p_sub: float, p_ch: float, R_base: float, R_3_: float, R_sub_: float,
        R_sub_after_ch: float = 0.0) -> float:
    """Ф5. Сценарное взвешивание (четыре исхода)."""
    return (
        (1 - p_sub) * (1 - p_ch) * R_base
        + p_ch * (1 - p_sub) * R_3_
        + p_sub * (1 - p_ch) * R_sub_
        + p_sub * p_ch * R_sub_after_ch
    )


def E_R_final(e_r: float, p_zero: float) -> float:
    """Ф6. Поправка на нулевую массу."""
    return (1 - p_zero) * e_r


def discount_factor(rate: float, years: float) -> float:
    """D_t = 1/(1+r)^t — дисконтирование выплаты (средняя процедура ≈ 1265 дней)."""
    return 1.0 / ((1 + rate) ** years)


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))
