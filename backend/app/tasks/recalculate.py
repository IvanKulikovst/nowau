"""Пересчёт профилей. Правило мёртвой зоны: изменение p < 0,05–0,10 не пересчитывает приоритеты."""
from app.tasks.celery_app import celery


def dead_zone(n_cases: int) -> float:
    return 0.10 if n_cases < 30 else 0.05


def is_critical(old: float, new: float) -> bool:
    """Критическое изменение > 0,15 либо пересечение порога (0,70 / 0,75 / 0,80)."""
    if abs(new - old) > 0.15:
        return True
    return any((old - t) * (new - t) < 0 for t in (0.70, 0.75, 0.80))


@celery.task(name="recalculate")
def recalculate(profile_id: int) -> dict:
    return {"profile_id": profile_id, "status": "queued"}
