from app.services.email.base import EmailProvider


class SMTPProvider(EmailProvider):
    """Заглушка. Реализовать при переходе на версию 2.0 (SMTP_HOST, SMTP_USER, SMTP_PASSWORD)."""

    async def send(self, to: str, subject: str, body: str) -> dict:
        raise NotImplementedError("Реализовать при переходе на версию 2.0")
