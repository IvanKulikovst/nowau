from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings


def add_cors(app):
    origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    if settings.PUBLIC_MODE:
        origins.append(f"{'https' if settings.SSL_ENABLED else 'http'}://{settings.DOMAIN}")
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])
