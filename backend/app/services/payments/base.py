from abc import ABC, abstractmethod


class PaymentProvider(ABC):
    @abstractmethod
    async def create_payment(self, user_id, amount, plan) -> dict: ...

    @abstractmethod
    async def check_status(self, payment_id) -> str: ...

    @abstractmethod
    async def handle_webhook(self, payload) -> dict: ...
