import pytest

from app.core import cache
from app.core.config import settings
from app.services.email import EmailService
from app.services.parsers import fetch_case_bundle
from app.services.parsers import mock as mockdata
from app.services.parsers.resilience import SourceUnavailable, kad_breaker, with_retry
from app.services.payments import get_payment_provider
from app.services.payments.yookassa import YooKassaProvider


async def test_mock_payment_and_yookassa_stub():
    p = get_payment_provider()
    r = await p.create_payment(1, 100, "pro")
    assert r["status"] == "mock_succeeded" and await p.check_status(r["payment_id"]) == "mock_succeeded"
    assert (await p.handle_webhook({"x": 1}))["handled"]
    with pytest.raises(NotImplementedError):
        await YooKassaProvider().create_payment(1, 1, "x")


async def test_email_is_logged_not_sent():
    r = await EmailService().send("a@b.ru", "s", "body")
    assert r == {"sent": False, "logged": True}


async def test_email_stays_mock_when_sending_disabled(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "smtp")
    assert (await EmailService().send("a@b.ru", "s", "b"))["sent"] is False


def test_mock_bundle_deterministic():
    assert mockdata.case_bundle("7701234567") == mockdata.case_bundle("7701234567")
    assert mockdata.case_bundle("7701234567") != mockdata.case_bundle("7702234567")
    assert mockdata.case_bundle("7701234000")["found"] is False


async def test_bundle_mock_has_demo_warning():
    b = await fetch_case_bundle(inn="7701234567")
    assert b["status"] == "ok" and "демонстрационные" in b["warnings"][0]


async def test_live_mode_degrades_to_partial(monkeypatch):
    monkeypatch.setattr(settings, "PARSERS_MODE", "live")
    monkeypatch.setattr(settings, "EFRSB_API_URL", "http://127.0.0.1:1")
    from app.services.parsers import kad

    async def boom(**kw):
        raise SourceUnavailable("kad down")
    monkeypatch.setattr(kad, "search_cases", boom)
    monkeypatch.setattr("app.services.parsers.resilience.asyncio.sleep", lambda s: _noop())
    b = await fetch_case_bundle(inn="7701234567")
    assert b["status"] == "partial" and b["manual_input_required"] and len(b["warnings"]) == 2


async def _noop():
    return None


async def test_retry_and_breaker(monkeypatch):
    monkeypatch.setattr("app.services.parsers.resilience.asyncio.sleep", lambda s: _noop())
    calls = {"n": 0}

    async def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise RuntimeError("x")
        return "ok"
    kad_breaker.close()
    assert await with_retry(flaky, kad_breaker) == "ok" and calls["n"] == 3

    async def bad():
        raise RuntimeError("down")
    kad_breaker.close()
    for _ in range(2):
        with pytest.raises(SourceUnavailable):
            await with_retry(bad, kad_breaker)
    with pytest.raises(SourceUnavailable, match="breaker"):     # открыт после 3 ошибок подряд
        await with_retry(bad, kad_breaker)
    kad_breaker.close()


async def test_cache_memory_fallback():
    await cache.cache_set("k1", {"a": 1}, 60)
    assert await cache.cache_get("k1") == {"a": 1}
    assert await cache.cache_get("missing") is None
    assert await cache.redis_ping() is False


async def test_rate_limit(client, auth, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMITING_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_PER_MINUTE", 3)
    codes = [(await client.get("/api/v1/users/me", headers=auth)).status_code for _ in range(5)]
    assert 429 in codes and codes[0] == 200
    assert (await client.get("/health")).status_code == 200      # health не лимитируется


async def test_register_works_when_public_signup(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_SIGNUP", True)
    r = await client.post("/api/v1/auth/register", json={"email": "new@x.ru", "password": "secret1"})
    assert r.status_code == 200 and "access_token" in r.json()
    assert (await client.post("/api/v1/auth/register", json={"email": "new@x.ru", "password": "s"})).status_code == 403


async def test_request_id_header(client):
    r = await client.get("/health", headers={"X-Request-ID": "abc123"})
    assert r.headers["x-request-id"] == "abc123"
