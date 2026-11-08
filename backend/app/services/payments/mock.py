import uuid

from app.core.logging import get_logger
from app.services.payments.base import PaymentProvider

log = get_logger("payments.mock")


class MockPaymentProvider(PaymentProvider):
    """Только логирует вызов; списание не выполняется."""

    async def create_payment(self, user_id, amount, plan) -> dict:
        pid = f"mock-{uuid.uuid4().hex[:12]}"
        log.info("mock_payment_create", user_id=user_id, amount=amount, plan=plan, payment_id=pid)
        return {"payment_id": pid, "status": "mock_succeeded", "confirmation_url": None}

    async def check_status(self, payment_id) -> str:
        log.info("mock_payment_status", payment_id=payment_id)
        return "mock_succeeded"

    async def handle_webhook(self, payload) -> dict:
        log.info("mock_payment_webhook", payload=str(payload)[:200])
        return {"handled": True}
