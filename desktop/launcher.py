"""Автономный запуск «Профиля кредитора»: собственное окно (pywebview), без консоли, Docker, Postgres и Redis.

SQLite, файлы и лог (creditor.log) — в %LOCALAPPDATA%\\CreditorProfile (Windows) или ~/.creditor-profile.
Режимы:  по умолчанию — окно приложения; CP_HEADLESS=1 — только сервер (для CI/отладки);
если нативное окно недоступно (нет WebView2/GUI) — открывается браузер.
"""
import multiprocessing
import os
import socket
import sys
import threading
import time
import urllib.request
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


def redirect_streams(d: Path) -> None:
    """В оконной сборке (console=False) sys.stdout/stderr == None — пишем в лог-файл."""
    if sys.stdout is None or sys.stderr is None or getattr(sys, "frozen", False):
        log = open(d / "creditor.log", "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = log


def wait_ready(url: str, timeout: float = 60) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url + "/ready", timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:  # noqa: BLE001
            time.sleep(0.4)
    return False


def show_error(msg: str) -> None:
    try:
        if os.name == "nt":
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, msg, "Профиль кредитора", 0x10)
    except Exception:  # noqa: BLE001
        pass


def main() -> None:
    d = data_dir()
    redirect_streams(d)
    port = free_port(int(os.environ.get("CP_PORT", "8765")))
    dist = resource("frontend_dist") if getattr(sys, "frozen", False) else resource("frontend/dist")
    os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{(d / 'creditor.db').as_posix()}")
    os.environ.setdefault("STORAGE_PATH", str(d / "storage"))
    os.environ.setdefault("ENVIRONMENT", "local")
    os.environ.setdefault("PARSERS_MODE", "mock")
    os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:1/0")   # Redis нет → кэш и лимиты в памяти
    os.environ.setdefault("CORS_ORIGINS", f"http://127.0.0.1:{port}")
    os.environ["FRONTEND_DIST"] = str(dist)
    key = d / "secret.key"          # SECRET_KEY генерируется один раз и хранится рядом с БД
    if not key.exists():
        import secrets
        key.write_text(secrets.token_urlsafe(48))
    os.environ.setdefault("SECRET_KEY", key.read_text().strip())

    import uvicorn
    from app.main import app

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", log_config=None))
    url = f"http://127.0.0.1:{port}"
    print(f"Профиль кредитора: {url}  (данные: {d})", flush=True)

    if os.environ.get("CP_HEADLESS") == "1":
        server.run()
        return

    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    if not wait_ready(url):
        show_error(f"Сервер не запустился. Подробности: {d / 'creditor.log'}")
        server.should_exit = True
        return
    try:
        import webview
        webview.create_window("Профиль кредитора", url, width=1280, height=860, min_size=(420, 600))
        webview.start()                      # блокирует до закрытия окна
    except Exception as e:  # noqa: BLE001 — нет WebView2/GUI-бэкенда: запасной вариант — браузер
        print(f"Нативное окно недоступно ({e!r}), открываю браузер", flush=True)
        webbrowser.open(url)
        show_error("Нативное окно недоступно (нужен Microsoft Edge WebView2). Приложение открыто в браузере; "
                   "чтобы остановить его, завершите ProfilKreditora.exe в диспетчере задач.")
        while t.is_alive():
            time.sleep(1)
        return
    server.should_exit = True                # окно закрыто → останавливаем сервер
    t.join(timeout=5)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
