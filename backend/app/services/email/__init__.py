from app.core.config import settings
from app.services.email.base import EmailProvider
from app.services.email.mock import MockEmailProvider
from app.services.email.smtp import SMTPProvider


class EmailService:
    """При EMAIL_SENDING=false всегда логирует письмо (mock), независимо от EMAIL_PROVIDER."""

    def __init__(self):
        real = settings.EMAIL_SENDING and settings.EMAIL_PROVIDER == "smtp"
        self.provider: EmailProvider = SMTPProvider() if real else MockEmailProvider()

    async def send(self, to: str, subject: str, body: str) -> dict:
        return await self.provider.send(to, subject, body)
