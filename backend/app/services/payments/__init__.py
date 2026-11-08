from app.core.config import settings
from app.services.payments.base import PaymentProvider
from app.services.payments.mock import MockPaymentProvider
from app.services.payments.yookassa import YooKassaProvider


def get_payment_provider() -> PaymentProvider:
    return YooKassaProvider() if settings.PAYMENT_PROVIDER == "yookassa" else MockPaymentProvider()
