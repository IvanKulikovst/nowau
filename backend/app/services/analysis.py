"""Пайплайн анализа: источники → расчёт → сохранение профиля, сценариев, приоритетов, аудита."""
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.exceptions import NotFound
from app.db.models import (AU, Calculation, Case, Claim, Court, Creditor, CreditorProfile, Debtor, Document,
                           ExtractedFact, Judge, Mass, Priority, Scenario)
from app.services.analytics import track
from app.services.calculator import CalcInput, calculate
from app.services.document_processor import levels_from_documents
from app.services.mode_detector import mode_from_bundle
from app.services.parsers import fetch_case_bundle

DEMO_AMOUNT = 10_000_000.0

DISCLAIMERS = {
    "general": "Сервис носит информационно-аналитический характер. Не является юридической услугой. "
               "Прогнозы вероятностны и не предсказывают исход конкретного дела. Не заменяет консультацию юриста.",
    "practice": "Построен на опубликованных судебных актах. Не является оценкой личности судьи "
                "или рекомендацией воздействия на суд.",
    "au": "Баллы отражают публичные факты и являются аналитической гипотезой, а не утверждением о нарушении. "
          "Решение об отстранении принимает только суд.",
    "pd": "Обрабатываются только общедоступные персональные данные (ст. 8 152-ФЗ). "
          "Вы вправе потребовать уточнения или удаления (ст. 14).",
    "fee": "Размер и очерёдность исполнительского сбора зависят от статуса основного долга. "
           "Расчёт носит ориентировочный характер.",
    "criminal": "Система выявляет публичные признаки рисков, но не квалифицирует действия как преступление. "
                "Рекомендуется консультация профильного юриста.",
    "ads": "Сервис соблюдает требования ст. 28.1 Закона «О рекламе». Материалы содержат обязательные "
           "указания о негативных последствиях банкротства.",
}


def _d(v) -> date | None:
    if not v:
        return None
    if isinstance(v, date):
        return v
    for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(str(v), fmt).date()
        except ValueError:
            continue
    return None


async def _get_or_create(session, model, defaults=None, **filters):
    res = await session.execute(select(model).filter_by(**filters))
    obj = res.scalars().first()
    if obj is None:
        obj = model(**filters, **(defaults or {}))
        session.add(obj)
        await session.flush()
    return obj


def build_input(bundle: dict, claim: dict, mode: str, doc_flags: dict, facts_confirmed: bool) -> tuple[CalcInput, list[str]]:
    notes: list[str] = []
    debtor = bundle.get("debtor") or {}
    filing = _d(bundle.get("filing_date"))
    if filing is None:
        filing = date.today()
        notes.append("Дата принятия заявления неизвестна: для оценки окон оспаривания принята сегодняшняя дата.")
    amount = claim.get("amount")
    if not amount:
        amount = DEMO_AMOUNT
        notes.append(f"Сумма требования не указана: использовано демонстрационное значение {DEMO_AMOUNT:,.0f} ₽.".replace(",", " "))
    judge = bundle.get("judge")
    au = bundle.get("au")
    registry = bundle.get("registry") or {}
    inp = CalcInput(
        mode=mode, amount=float(amount), construction_type=claim.get("construction_type") or "supply",
        is_credit_contract=bool(claim.get("is_credit_contract")),
        claim_date=_d(claim.get("claim_date")), filing_date=filing,
        execution_date=_d(claim.get("execution_date")),
        executed_amount=float(claim.get("executed_amount") or 0),
        status=claim.get("status") or "independent", crisis=bool(claim.get("crisis")),
        rescue_form=bool(claim.get("rescue_form")), unusual_conditions=bool(claim.get("unusual_conditions")),
        exceptions=claim.get("exceptions") or {}, beneficial_interest=bool(claim.get("beneficial_interest")),
        only_covenants=bool(claim.get("only_covenants")),
        is_equivalent=claim.get("is_equivalent", True) is not False,
        has_harm_intent=bool(claim.get("has_harm_intent")), is_gratuitous=bool(claim.get("is_gratuitous")),
        is_interested=bool(claim.get("is_interested")),
        debtor_type=debtor.get("type") or "legal", industry=debtor.get("industry"),
        total_assets=debtor.get("total_assets") if "total_assets" in debtor else None,
        current_expenses=float(debtor.get("current_expenses") or 0),
        first_priority=float(debtor.get("first_priority") or 0),
        second_priority=float(debtor.get("second_priority") or 0),
        collateral=[{"C": c["C"], "L": c["L"]} for c in bundle.get("collateral", [])],
        sigma3=registry.get("sigma3"), sigma_sub=float(registry.get("sigma_sub") or 0),
        judge_stats=judge, court_avg=bundle.get("court_avg", 0.43), au_stats=au,
        au_signals=bundle.get("au_signals") or {}, data_flags=doc_flags, facts_confirmed=facts_confirmed,
    )
    # сделка, по которой есть исполнение, но не указана сумма — берём сумму исполнения
    if inp.execution_date and not inp.executed_amount:
        notes.append("Дата исполнения указана без суммы исполнения: окно оспаривания оценено, сумма принята 0.")
    return inp, notes


def apply_manual(bundle: dict, manual: dict) -> dict:
    """Ручной ввод данных дела перекрывает данные источников (для partial/live и для точной настройки)."""
    if not manual:
        return bundle
    b = dict(bundle)
    b["found"] = True if any(manual.get(k) is not None for k in
                             ("filing_date", "total_assets", "sigma3", "judge", "au")) else b.get("found")
    deb = dict(b.get("debtor") or {})
    for k in ("total_assets", "current_expenses", "first_priority", "second_priority", "industry", "type"):
        if manual.get(k) is not None:
            deb[k] = manual[k]
    b["debtor"] = deb
    reg = dict(b.get("registry") or {})
    for k in ("sigma3", "sigma_sub"):
        if manual.get(k) is not None:
            reg[k] = manual[k]
    b["registry"] = reg
    for k in ("filing_date", "judge", "au", "au_signals", "court_avg", "case_number"):
        if manual.get(k) is not None:
            b[k] = manual[k]
    if manual.get("collateral") is not None:
        b["collateral"] = manual["collateral"]
    b.setdefault("messages", [])
    b["status"] = "ok"
    b["manual_input_required"] = False
    b["source"] = "manual" if b.get("source") != "mock" else "mock+manual"
    b["warnings"] = [w for w in b.get("warnings", []) if "mock" not in w] + \
        ["Часть данных введена вручную и не проверена системой."]
    return b


async def run_analysis(session, user, *, inn=None, case_number=None, claim: dict | None = None,
                       manual: dict | None = None,
                       mode_override: str | None = None, base_profile: CreditorProfile | None = None) -> CreditorProfile:
    claim = claim or {}
    manual = manual or {}
    bundle = apply_manual(await fetch_case_bundle(inn=inn, case_number=case_number), manual)
    auto = mode_from_bundle(bundle)
    mode = mode_override or auto["mode"]

    # --- документы: подтверждённые факты поднимают уровни ---
    doc_flags, facts_confirmed = {}, True
    claim_id_existing = base_profile.claim_id if base_profile else None
    if claim_id_existing:
        docs = (await session.execute(select(Document).where(Document.claim_id == claim_id_existing))).scalars().all()
        if docs:
            confirmed = True
            for d in docs:
                facts = (await session.execute(select(ExtractedFact).where(ExtractedFact.document_id == d.id))).scalars().all()
                if facts and not all(f.confirmed for f in facts):
                    confirmed = False
            facts_confirmed = confirmed
            doc_flags = levels_from_documents({d.document_type for d in docs}, confirmed)

    inp, notes = build_input(bundle, claim, mode, doc_flags, facts_confirmed)
    result = calculate(inp)
    result["assumptions"] = notes + result["assumptions"]
    result["warnings"] = list(bundle.get("warnings", [])) + result["warnings"]
    result["auto_mode"] = auto
    result["mode_manual"] = bool(mode_override)
    result["bundle_source"] = bundle.get("source")
    result["status"] = bundle.get("status", "ok")
    result["manual_input_required"] = bool(bundle.get("manual_input_required"))
    result["case"] = {"number": bundle.get("case_number") or case_number, "court": bundle.get("court"),
                      "filing_date": bundle.get("filing_date"), "debtor": (bundle.get("debtor") or {}).get("name"),
                      "inn": inn}
    result["judge"] = ({"name": bundle["judge"].get("name"), **bundle["judge"]} if bundle.get("judge") else None)
    result["au"] = ({"name": bundle["au"].get("name"), "sro": bundle["au"].get("sro"), **bundle["au"]}
                    if bundle.get("au") else None)
    result["registry_rows"] = build_registry_view(result, bundle)
    result["checklist"], result["calendar"] = _checklist_calendar(result, bundle)
    result["_request"] = {"inn": inn, "case_number": case_number, "claim": claim, "manual": manual}

    # --- сохранение ---
    case_id = None
    if bundle.get("found"):
        court = await _get_or_create(session, Court, name=bundle.get("court") or "Не указан",
                                     defaults={"region": bundle.get("region")})
        jid = aid = None
        if bundle.get("judge"):
            jid = (await _get_or_create(session, Judge, full_name=bundle["judge"]["name"], court_id=court.id)).id
        if bundle.get("au"):
            aid = (await _get_or_create(session, AU, full_name=bundle["au"]["name"],
                                        defaults={"sro": bundle["au"].get("sro")})).id
        deb = bundle.get("debtor") or {}
        debtor = await _get_or_create(session, Debtor, inn=inn or deb.get("inn"),
                                      defaults={"name": deb.get("name"), "type": deb.get("type"),
                                                "industry": deb.get("industry"),
                                                "total_assets": deb.get("total_assets")})
        cn = bundle.get("case_number") or f"manual-{inn}"
        case = await _get_or_create(session, Case, case_number=cn,
                                    defaults={"court_id": court.id, "judge_id": jid, "au_id": aid,
                                              "debtor_id": debtor.id, "filing_date": _d(bundle.get("filing_date"))})
        case.current_stage = mode
        case_id = case.id
    if base_profile and base_profile.claim_id:
        claim_row = await session.get(Claim, base_profile.claim_id)
    else:
        creditor = await _get_or_create(session, Creditor, inn=f"user-{user.id}", defaults={"name": user.email})
        claim_row = Claim(case_id=case_id, creditor_id=creditor.id, amount=Decimal(str(inp.amount)),
                          claim_date=inp.claim_date, construction_type=inp.construction_type,
                          is_credit_contract=inp.is_credit_contract, status=result["queue"],
                          execution_date=inp.execution_date)
        session.add(claim_row)
        await session.flush()

    result["claim_id"], result["case_id"] = claim_row.id, case_id or claim_row.case_id
    version = (base_profile.version + 1) if base_profile else 1
    profile = CreditorProfile(
        claim_id=claim_row.id, user_id=user.id, p_sub=result["p_sub"], p_ch=result["p_ch"], p_zero=result["p_zero"],
        delta_practice=result["m4"]["delta_ch"], delta_au=result["m4"]["delta_au_ch"],
        expected_amount=result["expected_amount"], expected_pct=result["expected_pct"],
        range_low=result["range_low"], range_high=result["range_high"], confidence=result["confidence"],
        mode=mode, information_levels=result["information_levels"],
        flags={"low_data": result["confidence"] == "low", "au_critical": result["au_index"]["critical"],
               "mode_manual": result["mode_manual"]},
        report=result, version=version)
    session.add(profile)
    await session.flush()
    for s in result["scenarios"]:
        session.add(Scenario(profile_id=profile.id, name=s["name"], probability=s["probability"],
                             payout_rub=s["payout_rub"], payout_pct=s["payout_pct"], description=s["title"]))
        session.add(Calculation(claim_id=claim_row.id, mode=mode, scenario=s["name"], formula=result["formula"],
                                result_rub=s["payout_rub"], result_pct=s["payout_pct"],
                                inputs={"p_sub": result["p_sub"], "p_ch": result["p_ch"], "p_zero": result["p_zero"]},
                                version=version))
    pr = result["priorities"]
    session.add(Priority(profile_id=profile.id, priority_1=(pr[0] if pr else None)[:100] if pr else None,
                         priority_2=pr[1][:100] if len(pr) > 1 else None,
                         deferred="; ".join(pr[2:])[:200] if len(pr) > 2 else None, trigger="analysis"))
    if case_id:
        session.add(Mass(case_id=case_id, total_assets=result["audit"]["M0"], net_mass=result["audit"]["M"],
                         p_zero=result["p_zero"], version=version))
    await track(session, "analysis_run", case_id, "api", {"mode": mode, "profile_id": profile.id})
    await session.commit()
    return profile


def build_registry_view(result: dict, bundle: dict) -> list[dict]:
    """Таблица сравнения с другими кредиторами (Р5–Р6). Остальные строки — оценка по Σ3 (демо)."""
    if result["mode"] not in ("P5", "P6"):
        return []
    sigma3 = result["audit"]["sigma3"]
    S = result["claim_amount"]
    rest = max(0.0, sigma3 - S)
    shares = [0.4, 0.3, 0.2, 0.1]
    rows = [{"name": "Вы", "amount": S, "share": round(S / sigma3, 4) if sigma3 else 0, "p_ch": result["p_ch"],
             "challenge_candidate": False, "own": True}]
    for i, sh in enumerate(shares):
        amt = rest * sh
        pch = round(0.30 + 0.15 * i, 2)
        share = amt / sigma3 if sigma3 else 0
        rows.append({"name": f"Кредитор {i + 1}", "amount": round(amt, 2), "share": round(share, 4), "p_ch": pch,
                     "challenge_candidate": pch > 0.5 and (S / sigma3 if sigma3 else 0) > 0.10, "own": False})
    return rows


def _checklist_calendar(result: dict, bundle: dict):
    checklist = ["Документы, подтверждающие основание требования (договор, акты, накладные)"]
    if result["p_ch"] >= 0.3:
        checklist += ["Платёжные документы по полученному исполнению", "Переписка о цели и условиях сделки",
                      "Доказательства встречного предоставления", "Подтверждение рыночности условий"]
    if result["p_sub"] >= 0.2:
        checklist += ["Документы о независимости от должника", "Обоснование исключений (п. 2.3 методики)"]
    if result["queue"] == "secured":
        checklist.append("Договор залога, оценка, регистрация в реестре уведомлений")
    cal = []
    msgs = {m["type"]: _d(m.get("date")) for m in bundle.get("messages", []) if m.get("date")}
    if msgs.get("au_appointed"):
        cal.append({"date": (msgs["au_appointed"] + timedelta(days=30)).isoformat(),
                    "title": "Срок включения в реестр (30 дней) — ориентир"})
    if msgs.get("registry_closed"):
        cal.append({"date": (msgs["registry_closed"] + timedelta(days=10)).isoformat(),
                    "title": "Срок обжалования (10 дней) — ориентир"})
    if not cal:
        cal.append({"date": None, "title": "Следите за публикациями в ЕФРСБ: окно 15–30 дней"})
    return checklist, cal


async def get_profile(session, profile_id: int, user) -> CreditorProfile:
    p = await session.get(CreditorProfile, profile_id)
    if p is None or (p.user_id != user.id and user.role != "admin"):
        raise NotFound("Анализ не найден")
    return p


def summary_view(p: CreditorProfile) -> dict:
    r = p.report or {}
    top = next((a for a in r.get("actions", []) if a["key"] != "registry"), None) or (r.get("actions") or [None])[0]
    return {
        "id": p.id, "version": p.version, "mode": p.mode, "case": r.get("case"),
        "claim_id": r.get("claim_id") or p.claim_id, "case_id": r.get("case_id"),
        "claim_amount": r.get("claim_amount"), "executed_amount": r.get("executed_amount"),
        "expected_amount": r.get("expected_amount"), "expected_pct": r.get("expected_pct"),
        "range_low_pct": r.get("range_low_pct"), "range_high_pct": r.get("range_high_pct"),
        "range_low": r.get("range_low"), "range_high": r.get("range_high"),
        "confidence": r.get("confidence"), "probabilistic_label": r.get("probabilistic_label"),
        "risks": r.get("risks"), "queue": r.get("queue"),
        "recommendation": ({"title": top["title"], "reason": top["reason"]} if top else None),
        "assumptions": r.get("assumptions", []), "warnings": r.get("warnings", []),
        "status": r.get("status"), "manual_input_required": r.get("manual_input_required", False),
        "mode_manual": r.get("mode_manual", False), "auto_mode": r.get("auto_mode"),
        "demo_data": r.get("bundle_source") == "mock",
        "manual_data": "manual" in (r.get("bundle_source") or ""),
        "disclaimers": {"general": DISCLAIMERS["general"], "ads": DISCLAIMERS["ads"]},
    }


def details_view(p: CreditorProfile) -> dict:
    r = p.report or {}
    return {
        "id": p.id, "scenarios": r.get("scenarios"), "actions": r.get("actions"), "priorities": r.get("priorities"),
        "au": r.get("au"), "au_index": r.get("au_index"), "judge": r.get("judge"),
        "checklist": r.get("checklist"), "calendar": r.get("calendar"), "information_levels": r.get("information_levels"),
        "m4": r.get("m4"),
        "disclaimers": {k: DISCLAIMERS[k] for k in ("general", "practice", "au", "fee", "criminal")},
    }


def audit_view(p: CreditorProfile) -> dict:
    r = p.report or {}
    j = (r.get("m4") or {}).get("judge", {})
    return {
        "id": p.id, "version": p.version, "formula": r.get("formula"), "method": r.get("method"),
        "formulas": (r.get("audit") or {}).get("formulas"), "audit": r.get("audit"),
        "modules": {k: r.get(k) for k in ("m0", "m1", "m2_1", "m2_2", "m3", "m4")},
        "probabilities": {"p_sub": r.get("p_sub"), "p_ch": r.get("p_ch"), "p_zero": r.get("p_zero"),
                          "delta_practice": float(p.delta_practice or 0), "delta_au": float(p.delta_au or 0)},
        "judge": r.get("judge"), "judge_delta": j, "au": r.get("au"), "au_index": r.get("au_index"),
        "information_levels": r.get("information_levels"), "assumptions": r.get("assumptions"),
        "sources": [{"title": "КАД Арбитр", "url": "https://kad.arbitr.ru"},
                    {"title": "ЕФРСБ", "url": "https://fedresurs.ru"}],
        "disclaimers": {k: DISCLAIMERS[k] for k in ("general", "practice", "au", "pd", "fee", "criminal")},
    }
