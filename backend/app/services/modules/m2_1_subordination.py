"""М2.1. Субординация (Пленум ВС РФ № 41 от 23.12.2025)."""


def m2_1_subordination(status: str, unusual_conditions: bool = False, crisis: bool = False,
                       rescue_form: bool = False, exception_surety_before_crisis: bool = False,
                       exception_non_voluntary: bool = False, exception_market_practice: bool = False,
                       exception_majority_consent: bool = False, beneficial_interest: bool = False,
                       only_covenants: bool = False) -> dict:
    if exception_surety_before_crisis:
        return {"p_sub": 0.05, "reason": "Поручительство до кризиса"}
    if exception_non_voluntary:
        return {"p_sub": 0.05, "reason": "Недобровольный кредитор"}
    if exception_market_practice:
        return {"p_sub": 0.10, "reason": "Обычная рыночная практика"}
    if exception_majority_consent:
        return {"p_sub": 0.10, "reason": "Согласие мажоритарных кредиторов"}
    if only_covenants and not beneficial_interest:
        return {"p_sub": 0.15, "reason": "Только контроль возврата, бенефициарного интереса нет"}
    if status in ("kdl", "affiliated") and crisis and rescue_form:
        if unusual_conditions:
            return {"p_sub": 0.85, "reason": "Три элемента + необычные условия"}
        return {"p_sub": 0.70, "reason": "Три элемента"}
    if status in ("kdl", "affiliated") and crisis:
        return {"p_sub": 0.50, "reason": "Статус + кризис"}
    return {"p_sub": 0.10, "reason": "Нет оснований"}
