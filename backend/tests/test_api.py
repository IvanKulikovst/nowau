import io

from app.core.logging import mask


async def test_health_ready_metrics(client):
    r = await client.get("/health")
    assert r.status_code == 200 and r.json()["db"] == "ok"
    assert (await client.get("/ready")).json() == {"ready": True}
    assert (await client.get("/metrics")).status_code == 200


async def test_auth_required(client):
    r = await client.get("/api/v1/users/me")
    assert r.status_code == 401 and "request_id" in r.json()


async def test_login_wrong_password(client):
    r = await client.post("/api/v1/auth/login", json={"email": "admin@local", "password": "nope"})
    assert r.status_code == 401


async def test_register_disabled(client):
    r = await client.post("/api/v1/auth/register", json={"email": "a@b.ru", "password": "x"})
    assert r.status_code == 403 and "Регистрация временно недоступна" in r.json()["error"]


async def test_refresh_and_me(client):
    t = (await client.post("/api/v1/auth/login", json={"email": "admin@local", "password": "admin"})).json()
    new = (await client.post("/api/v1/auth/refresh", json={"refresh_token": t["refresh_token"]})).json()
    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {new['access_token']}"})
    assert me.json()["tier"] == "admin" and me.json()["flags"]["billing_enabled"] is False
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": t["access_token"]})).status_code == 401


async def test_subscription_stub(client, auth):
    r = await client.get("/api/v1/users/me/subscription", headers=auth)
    assert r.json()["message"] == "Оплата скоро"


async def test_analyze_validation(client, auth):
    assert (await client.post("/api/v1/analyze", json={}, headers=auth)).status_code == 422
    assert (await client.post("/api/v1/analyze", json={"inn": "123"}, headers=auth)).status_code == 422


async def test_full_cycle(client, auth):
    body = {"inn": "7701234567", "claim": {"amount": 10_000_000, "executed_amount": 2_000_000,
                                           "execution_date": "2026-09-01", "claim_date": "2025-06-01"}}
    r = await client.post("/api/v1/analyze", json=body, headers=auth)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["demo_data"] is True and s["mode"] in {"P3", "P4", "P5", "P6"}
    assert 0 <= s["expected_pct"] <= 1 and len(s["risks"]) == 3
    assert s["recommendation"] and "Сервис носит информационно-аналитический характер" in s["disclaimers"]["general"]
    pid = s["id"]
    assert (await client.get(f"/api/v1/analysis/{pid}", headers=auth)).json()["id"] == pid
    d = (await client.get(f"/api/v1/analysis/{pid}/details", headers=auth)).json()
    assert d["scenarios"] and d["checklist"] and "au" in d["disclaimers"]
    a = (await client.get(f"/api/v1/analysis/{pid}/audit", headers=auth)).json()
    assert a["formulas"] and a["probabilities"]["p_ch"] is not None and "practice" in a["disclaimers"]
    reg = (await client.get(f"/api/v1/analysis/{pid}/registry", headers=auth)).json()
    assert reg["available"] == (s["mode"] in ("P5", "P6"))
    lv = (await client.get(f"/api/v1/cases/{s['case_id']}/levels", headers=auth)).json()
    assert set(lv["levels"]) == {"M0", "M1", "M2.1", "M2.2", "M3", "M4", "M5"}
    assert any(x["id"] == pid for x in (await client.get("/api/v1/analyses", headers=auth)).json())


async def test_no_case_gives_p1(client, auth):
    assert (await client.post("/api/v1/analyze", json={"inn": "7701234500"}, headers=auth)).json()["mode"] == "P2"
    r = await client.post("/api/v1/analyze", json={"inn": "7701234000"}, headers=auth)
    s = r.json()
    assert s["mode"] == "P1" and s["confidence"] == "low"
    assert any("демонстрационное" in a for a in s["assumptions"])


async def test_detect_mode_and_set_mode(client, auth):
    d = (await client.get("/api/v1/cases/detect-mode", params={"inn": "7701234567"}, headers=auth)).json()
    assert d["mode"].startswith("P")
    s = (await client.post("/api/v1/analyze", json={"inn": "7701234567"}, headers=auth)).json()
    r = await client.post(f"/api/v1/cases/{s['case_id']}/set-mode", json={"mode": "P6"}, headers=auth)
    assert r.status_code == 200 and r.json()["mode"] == "P6" and "вручную" in r.json()["warning"]
    assert r.json()["mode_manual"] is True


async def test_other_user_cannot_read(client, auth):
    s = (await client.post("/api/v1/analyze", json={"inn": "7701234567"}, headers=auth)).json()
    assert (await client.get("/api/v1/analysis/999999", headers=auth)).status_code == 404
    assert (await client.get(f"/api/v1/analysis/{s['id']}")).status_code == 401


async def test_api_keys_and_webhooks(client, auth):
    k = (await client.post("/api/v1/api-keys", json={"name": "t"}, headers=auth)).json()
    me = await client.get("/api/v1/users/me", headers={"X-API-Key": k["key"]})
    assert me.status_code == 200
    assert (await client.delete(f"/api/v1/api-keys/{k['id']}", headers=auth)).json()["revoked"]
    assert (await client.get("/api/v1/users/me", headers={"X-API-Key": k["key"]})).status_code == 401
    h = (await client.post("/api/v1/webhooks", json={"url": "https://example.com/h"}, headers=auth)).json()
    assert len((await client.get("/api/v1/webhooks", headers=auth)).json()) >= 1
    assert (await client.delete(f"/api/v1/webhooks/{h['id']}", headers=auth)).json()["deleted"]


async def test_documents_flow_raises_levels(client, auth):
    import docx
    s = (await client.post("/api/v1/analyze", json={"inn": "7701234567", "claim": {
        "amount": 5_000_000, "executed_amount": 1_000_000, "execution_date": "2026-09-01"}}, headers=auth)).json()
    before = s["id"]
    mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    def make(*lines):
        buf = io.BytesIO()
        d = docx.Document()
        for ln in lines:
            d.add_paragraph(ln)
        d.save(buf)
        return buf.getvalue()

    contract = make("Договор поставки от 01.02.2025. Покупатель ИНН 7701234567. Поставщик отгрузил товар.")
    payment = make("Платёжное поручение. Оплачено 15.08.2026 на сумму 1 000 000 руб.")
    ids = []
    for name, data in (("dogovor.docx", contract), ("pp.docx", payment)):
        r = await client.post(f"/api/v1/claims/{s['claim_id']}/documents", headers=auth,
                              files={"file": (name, data, mime)})
        assert r.status_code == 200 and r.json()["needs_confirmation"], r.text
        ids.append(r.json()["id"])
    st = (await client.get(f"/api/v1/documents/{ids[0]}/status", headers=auth)).json()
    assert st["facts"] and all(f["label"] == "требует проверки" for f in st["facts"])
    # пока подтверждён только один документ — уровень M2.2 не растёт до 5
    c1 = (await client.post(f"/api/v1/documents/{ids[0]}/confirm-facts", json={}, headers=auth)).json()
    mid = (await client.get(f"/api/v1/analysis/{c1['analysis_id']}/audit", headers=auth)).json()
    assert mid["information_levels"]["M2.2"] < 5
    c2 = (await client.post(f"/api/v1/documents/{ids[1]}/confirm-facts", json={}, headers=auth)).json()
    assert c2["confirmed"] == c2["total"] and c2["analysis_id"] != before
    new = (await client.get(f"/api/v1/analysis/{c2['analysis_id']}/audit", headers=auth)).json()
    assert new["information_levels"]["M2.2"] == 5
    assert len((await client.get(f"/api/v1/claims/{s['claim_id']}/documents", headers=auth)).json()) == 2


async def test_upload_rejects_bad_type(client, auth):
    s = (await client.post("/api/v1/analyze", json={"inn": "7701234567"}, headers=auth)).json()
    r = await client.post(f"/api/v1/claims/{s['claim_id']}/documents", headers=auth,
                          files={"file": ("x.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 415


def test_pii_masking():
    assert mask("user admin@local") == "user a***@local"
    assert mask("inn 7701234567") == "inn 7701****67"
    assert mask("mail ivan@example.com") == "mail i***@example.com"


async def test_change_password(client, auth):
    bad = await client.post("/api/v1/users/me/password", json={"old_password": "x", "new_password": "abcdef"}, headers=auth)
    assert bad.status_code == 400
    ok = await client.post("/api/v1/users/me/password", json={"old_password": "admin", "new_password": "abcdef"}, headers=auth)
    assert ok.json()["changed"]
    assert (await client.post("/api/v1/auth/login", json={"email": "admin@local", "password": "abcdef"})).status_code == 200
    # вернуть исходный пароль для остальных тестов
    from sqlalchemy import select
    from app.core.security import hash_password
    from app.db.models import User
    from app.db.session import SessionLocal
    async with SessionLocal() as db:
        u = (await db.execute(select(User).where(User.email == "admin@local"))).scalar_one()
        u.password_hash = hash_password("admin")
        await db.commit()


async def test_manual_input_overrides_and_fills_gaps(client, auth):
    body = {"inn": "7701234000", "manual": {
        "filing_date": "2026-06-01", "total_assets": 150e6, "current_expenses": 10e6, "sigma3": 120e6,
        "judge": {"n_cases": 45, "approval_rate": 0.70, "is_significant": True},
        "au": {"n_cases": 10, "filed_on_your_deal": True},
        "collateral": [{"C": 100e6, "L": 0.9}]},
        "claim": {"amount": 8e6, "executed_amount": 2e6, "execution_date": "2026-04-01"}, "mode": "P4"}
    r = await client.post("/api/v1/analyze", json=body, headers=auth)
    s = r.json()
    assert r.status_code == 200 and s["manual_data"] is True and s["status"] == "ok"
    a = (await client.get(f"/api/v1/analysis/{s['id']}/audit", headers=auth)).json()
    assert a["audit"]["M0"] == 150e6 and a["audit"]["sigma3"] == 120e6
    assert a["probabilities"]["p_ch"] == 0.75        # окно 6 мес. 0,50 + судья 0,15 + АУ 0,10, потолок 1
    # set-mode не теряет ручные данные
    cid = s["case_id"]
    r2 = await client.post(f"/api/v1/cases/{cid}/set-mode", json={"mode": "P5"}, headers=auth)
    a2 = (await client.get(f"/api/v1/analysis/{r2.json()['id']}/audit", headers=auth)).json()
    assert a2["audit"]["M0"] == 150e6


async def test_manual_input_validation(client, auth):
    r = await client.post("/api/v1/analyze", json={"inn": "7701234567", "manual": {"judge": {"n_cases": 5, "approval_rate": 2}}}, headers=auth)
    assert r.status_code == 422


async def test_local_autologin_flag(client, monkeypatch):
    from app.core.config import settings
    assert (await client.post("/api/v1/auth/local")).status_code == 403          # по умолчанию выключено
    monkeypatch.setattr(settings, "LOCAL_AUTOLOGIN", True)
    r = await client.post("/api/v1/auth/local")
    assert r.status_code == 200
    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.json()["email"].startswith("admin")
    monkeypatch.setattr(settings, "PUBLIC_MODE", True)                             # в публичном режиме запрещено всегда
    assert (await client.post("/api/v1/auth/local")).status_code == 403
