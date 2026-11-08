from app.services.payments.base import PaymentProvider


class YooKassaProvider(PaymentProvider):
    """Заглушка. Реализовать при переходе на версию 2.0 (YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY)."""

    async def create_payment(self, user_id, amount, plan) -> dict:
        raise NotImplementedError("Реализовать при переходе на версию 2.0")

    async def check_status(self, payment_id) -> str:
        raise NotImplementedError("Реализовать при переходе на версию 2.0")

    async def handle_webhook(self, payload) -> dict:
        raise NotImplementedError("Реализовать при переходе на версию 2.0")
