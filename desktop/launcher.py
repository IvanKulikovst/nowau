"""Автономный запуск «Профиля кредитора» (Windows .exe / любая ОС): без Docker, Postgres и Redis.

SQLite и файлы хранятся в %LOCALAPPDATA%\\CreditorProfile (Windows) или ~/.creditor-profile.
Запускает сервер на свободном порту (по умолчанию 8765) и открывает браузер.
"""
import multiprocessing
import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path


def data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA")
    d = Path(base) / "CreditorProfile" if base else Path.home() / ".creditor-profile"
    d.mkdir(parents=True, exist_ok=True)
    return d


def resource(rel: str) -> Path:
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    return root / rel


def free_port(preferred: int) -> int:
    for p in (preferred, 0):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", p))
                return s.getsockname()[1]
            except OSError:
                continue
    raise RuntimeError("Нет свободного порта")


def main() -> None:
    d = data_dir()
    port = free_port(int(os.environ.get("CP_PORT", "8765")))
    dist = resource("frontend_dist") if getattr(sys, "frozen", False) else resource("frontend/dist")
    os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{(d / 'creditor.db').as_posix()}")
    os.environ.setdefault("STORAGE_PATH", str(d / "storage"))
    os.environ.setdefault("ENVIRONMENT", "local")
    os.environ.setdefault("PARSERS_MODE", "mock")
    os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:1/0")   # Redis нет → кэш и лимиты в памяти
    os.environ.setdefault("CORS_ORIGINS", f"http://127.0.0.1:{port}")
    os.environ["FRONTEND_DIST"] = str(dist)
    # SECRET_KEY генерируется один раз и хранится рядом с БД
    key = d / "secret.key"
    if not key.exists():
        import secrets
        key.write_text(secrets.token_urlsafe(48))
    os.environ.setdefault("SECRET_KEY", key.read_text().strip())

    import uvicorn
    from app.main import app

    url = f"http://127.0.0.1:{port}"
    threading.Thread(target=lambda: (time.sleep(2.0), webbrowser.open(url)), daemon=True).start()
    print(f"Профиль кредитора: {url}  (данные: {d})\nВход: admin@local / admin. Закройте это окно, чтобы остановить сервер.")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
