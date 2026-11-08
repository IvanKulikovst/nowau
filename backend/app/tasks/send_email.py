from app.tasks.celery_app import celery


@celery.task(name="send_email")
def send_email(to: str, subject: str, body: str) -> dict:
    import asyncio
    from app.services.email import EmailService
    return asyncio.run(EmailService().send(to, subject, body))
