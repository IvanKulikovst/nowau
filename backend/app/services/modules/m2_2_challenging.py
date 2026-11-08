"""М2.2. Оспаривание (ст. 61.2, 61.3 Закона о банкротстве)."""
from datetime import date


def m2_2_challenging(execution_date: date | None, filing_date: date | None,
                     is_equivalent: bool = True, has_harm_intent: bool = False,
                     is_gratuitous: bool = False, is_interested: bool = False,
                     amount: float = 0.0, total_assets: float = 0.0) -> dict:
    if execution_date is None or filing_date is None:
        return {"p_ch": 0.0, "reason": "Нет исполнения", "window": None}
    months = (filing_date - execution_date).days / 30
    if total_assets > 0 and amount <= 0.01 * total_assets:
        return {"p_ch": 0.05, "reason": "Обычная хозяйственная деятельность (≤1% активов)",
                "window": "ordinary"}
    if months < 0:
        return {"p_ch": 0.0, "reason": "Исполнение после принятия заявления (текущий платёж)",
                "window": None}
    if months <= 1:
        return {"p_ch": 0.70, "reason": "Окно 1 месяц (предпочтение предполагается, ст. 61.3)",
                "window": "1m"}
    if months <= 6:
        return {"p_ch": 0.50, "reason": "Окно 6 месяцев (нужно доказать осведомлённость)",
                "window": "6m"}
    if months <= 12 and not is_equivalent:
        return {"p_ch": 0.60, "reason": "Неравноценность в пределах 1 года (ст. 61.2)", "window": "1y"}
    if months <= 36 and (has_harm_intent or is_gratuitous or is_interested):
        return {"p_ch": 0.40, "reason": "Признаки вреда в пределах 3 лет (ст. 61.2)", "window": "3y"}
    return {"p_ch": 0.05, "reason": "Вне окон оспаривания", "window": None}
