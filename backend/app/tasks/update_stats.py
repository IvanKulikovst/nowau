"""Обновление статистики судьи: Δ_нов = β·((удовл_судья+новый)/(всего_судья+1) − (удовл_суд+новый)/(всего_суд+1))."""
from app.tasks.celery_app import celery


def delta_new(j_ok: int, j_all: int, c_ok: int, c_all: int, new: int, beta: float = 0.6) -> float:
    if j_all < 10:
        return 0.0   # < 10 дел — не обновляется
    d = beta * ((j_ok + new) / (j_all + 1) - (c_ok + new) / (c_all + 1))
    weight = 1.0 if j_all > 30 else (j_all - 10) / 20      # 10–30 дел: вес растёт
    return d * weight


@celery.task(name="update_stats")
def update_stats(judge_id: int) -> dict:
    return {"judge_id": judge_id, "status": "queued"}
