from celery import Celery

from app.core.config import settings

celery = Celery("creditor", broker=settings.REDIS_URL, backend=settings.REDIS_URL)
celery.conf.task_always_eager = settings.CELERY_TASK_ALWAYS_EAGER
