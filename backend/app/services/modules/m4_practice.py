"""М4. Анализ судебной практики и признаки аффилированности АУ, требующие проверки."""
from app.services.formulas import clamp

BASE_P_CH = 0.43
MIN_JUDGE_CASES = 10
MIN_AU_CASES = 5


def judge_delta(judge_stats: dict | None, court_avg: float = BASE_P_CH) -> dict:
    """Δ_ch по отклонению доли удовлетворения от средней по суду."""
    if not judge_stats or judge_stats.get("n_cases", 0) < MIN_JUDGE_CASES:
        return {"delta_ch": 0.0, "profile": False,
                "note": "Менее 10 дел: профиль судьи не строится, используется статистика суда"}
    dev = judge_stats["approval_rate"] - court_avg
    if abs(dev) <= 0.05:
        delta = 0.0
    else:
        delta = clamp(0.6 * dev, -0.15, 0.15)
        # при |отклонении| > 15 п.п. модификатор не слабее 0,10
        if abs(dev) > 0.15:
            delta = max(0.10, abs(delta)) * (1 if dev > 0 else -1)
    significant = bool(judge_stats.get("is_significant"))
    if not significant:
        delta *= 0.5
    return {"delta_ch": round(delta, 4), "profile": True, "deviation": round(dev, 4),
            "significant": significant,
            "note": "Статистически значимо" if significant else "Статистически незначимо (ДИ широкий)"}


def au_delta(au_stats: dict | None) -> dict:
    """Модификаторы АУ к p_ch и p_zero."""
    if not au_stats or au_stats.get("n_cases", 0) < MIN_AU_CASES:
        return {"delta_ch": 0.0, "delta_zero": 0.0, "profile": False,
                "note": "Менее 5 дел: профиль АУ не строится"}
    d_ch = d_zero = 0.0
    notes = []
    if au_stats.get("filed_on_your_deal"):
        d_ch += 0.10
        notes.append("АУ подал заявление по вашей сделке (+0,10 к p_ch)")
    else:
        similar = au_stats.get("filed_similar", 0)
        if similar:
            d_ch += min(0.20, 0.03 * similar)
            notes.append(f"АУ подавал по аналогичным сделкам ×{similar} (+{min(0.20, 0.03 * similar):.2f})")
    if au_stats.get("passive_on_suspicious"):
        d_zero += 0.10
        notes.append("АУ не подал по явно подозрительной сделке (+0,10 к p_zero)")
    if au_stats.get("losses_recovered"):
        d_zero += 0.10
        notes.append("С АУ взысканы убытки (+0,10 к p_zero)")
    if au_stats.get("rau_top20"):
        d_zero -= 0.05
        notes.append("Верхние 20% рейтинга РАУ (−0,05 к p_zero)")
    return {"delta_ch": round(d_ch, 4), "delta_zero": round(d_zero, 4), "profile": True,
            "note": "; ".join(notes) or "Особых сигналов нет"}


def m4_practice(judge_stats: dict | None, au_stats: dict | None, court_avg: float = BASE_P_CH) -> dict:
    j = judge_delta(judge_stats, court_avg)
    a = au_delta(au_stats)
    return {"delta_ch": j["delta_ch"], "delta_au_ch": a["delta_ch"], "delta_au_zero": a["delta_zero"],
            "judge": j, "au": a}


AU_FLAG_POINTS = {
    "removed": 50, "disqualified": 60, "disqualification_filed": 30, "applicant_affiliated": 40,
    "former_representative": 40, "sro_match": 20, "anomalous_passivity": 30,
    "sro_complaint_upheld": 20, "losses_recovered": 20,
}
AU_FLAG_LABELS = {
    "removed": "АУ отстранён в деле", "disqualified": "АУ дисквалифицирован",
    "disqualification_filed": "Подано заявление о дисквалификации",
    "applicant_affiliated": "Заявитель аффилирован с должником",
    "former_representative": "Бывший представитель или доверенное лицо",
    "sro_match": "Совпадение по СРО", "anomalous_passivity": "Аномальная пассивность",
    "sro_complaint_upheld": "Жалоба в СРО признана обоснованной", "losses_recovered": "Взысканы убытки",
}


def au_independence_score(signals: dict) -> dict:
    """Модуль независимости АУ (макс. 100, >60 — флаг). Терминология: «признаки, требующие проверки»."""
    items = [{"flag": k, "label": AU_FLAG_LABELS[k], "points": p}
             for k, p in AU_FLAG_POINTS.items() if signals.get(k)]
    score = min(100, sum(i["points"] for i in items))
    return {"score": score, "critical": score > 60, "items": items}
