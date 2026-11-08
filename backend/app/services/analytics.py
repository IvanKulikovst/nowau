"""Внутренняя аналитика: запись в таблицу events."""
from app.core.config import settings
from app.db.models import Event


async def track(session, event_type: str, case_id: int | None = None, source: str = "app",
                payload: dict | None = None) -> None:
    if not settings.ANALYTICS_ENABLED:
        return
    session.add(Event(case_id=case_id, event_type=event_type, source=source, payload=payload or {}))
