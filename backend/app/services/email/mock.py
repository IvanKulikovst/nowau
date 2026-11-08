from app.core.logging import get_logger
from app.services.email.base import EmailProvider

log = get_logger("email.mock")


class MockEmailProvider(EmailProvider):
    """Логирует письмо, отправка не выполняется."""

    async def send(self, to: str, subject: str, body: str) -> dict:
        log.info("mock_email", to=to, subject=subject, body_len=len(body))
        return {"sent": False, "logged": True}
