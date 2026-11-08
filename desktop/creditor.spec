# PyInstaller: pyinstaller desktop/creditor.spec  (запускать из корня проекта, после `npm run build` во frontend)
from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = [("../frontend/dist", "frontend_dist")]
hidden = collect_submodules("app") + collect_submodules("uvicorn") + ["aiosqlite", "sqlalchemy.dialects.sqlite",
                                                                       "sqlalchemy.ext.asyncio", "greenlet"]
binaries = []
for pkg in ("pdfplumber", "pdfminer", "docx", "pytesseract", "prometheus_fastapi_instrumentator", "structlog"):
    try:
        d, b, h = collect_all(pkg)
        datas += d; binaries += b; hidden += h
    except Exception:
        pass

a = Analysis(["launcher.py"], pathex=["../backend", "."], datas=datas, binaries=binaries, hiddenimports=hidden,
             excludes=["playwright", "celery", "asyncpg", "tkinter", "pytest"])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name="ProfilKreditora", console=True,
          icon="../frontend/public/icons/icon.ico" if __import__("os").path.exists("../frontend/public/icons/icon.ico") else None)
