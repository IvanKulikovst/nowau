import os
import tempfile

_tmp = tempfile.mkdtemp()
# TEST_DATABASE_URL=postgresql+asyncpg://... — прогон тестов на PostgreSQL (по умолчанию SQLite)
os.environ.update(DATABASE_URL=os.environ.get("TEST_DATABASE_URL", f"sqlite+aiosqlite:///{_tmp}/test.db"), ENVIRONMENT="test", PARSERS_MODE="mock",
                  REDIS_URL="redis://127.0.0.1:1/0", STORAGE_PATH=f"{_tmp}/storage",
                  RATE_LIMITING_ENABLED="false", SECRET_KEY="test-secret-key-0123456789abcdef-xyz")

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture
async def client():
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


@pytest.fixture
async def auth(client):
    r = await client.post("/api/v1/auth/login", json={"email": "admin@local", "password": "admin"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
