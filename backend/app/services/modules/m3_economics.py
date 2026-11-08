"""М3. Экономика: чистая конкурсная масса, ликвидный залог, вероятность нулевой массы."""


def executive_fee(base: float, is_citizen: bool = False) -> float:
    """Исполнительский сбор с 09.01.2026: 12%, минимум 2 000 ₽ (граждане) / 20 000 ₽ (организации)."""
    if base <= 0:
        return 0.0
    return max(0.12 * base, 2000.0 if is_citizen else 20000.0)


def estimate_p_zero(industry: str | None, mass: float, collateral: float,
                    debtor_type: str = "legal") -> float:
    if collateral > 0 and mass > 0:
        return 0.20
    if mass > 0:
        return 0.50
    return 0.85


def m3_economics(M0: float, T: float, Q1: float, Q2: float, S_sbor: float,
                 collateral_list: list[dict], industry: str | None = None,
                 debtor_type: str = "legal") -> dict:
    M = max(0.0, M0 - T - Q1 - Q2 - S_sbor)
    total_collateral = sum(c["C"] * c["L"] for c in collateral_list)
    p_zero = estimate_p_zero(industry, M, total_collateral, debtor_type)
    return {"M": M, "total_collateral_net": total_collateral, "p_zero": p_zero}
