"""Конфигурация и feature flags. Версия 2.0 отличается от 1.0 только значениями ENV."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Режим
    PUBLIC_MODE: bool = False
    ENVIRONMENT: str = "local"

    # Доступ
    PUBLIC_SIGNUP: bool = False
    BILLING_ENABLED: bool = False
    EMAIL_SENDING: bool = False

    # Функции
    ANALYTICS_ENABLED: bool = True
    METRICS_ENABLED: bool = True
    RATE_LIMITING_ENABLED: bool = True
    CIRCUIT_BREAKER_ENABLED: bool = True
    SHOW_COOKIE_BANNER: bool = False

    # Внешние сервисы
    PARSERS_MODE: str = "mock"          # mock | live — mock не ходит во внешние сети
    EFRSB_API_URL: str = "https://fedresurs.ru/api/v1"
    EFRSB_API_KEY: str = ""
    KAD_BASE_URL: str = "https://kad.arbitr.ru"
    PAYMENT_PROVIDER: str = "mock"
    EMAIL_PROVIDER: str = "mock"

    # База данных
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/creditor"
    REDIS_URL: str = "redis://redis:6379/0"

    # Файлы
    STORAGE_TYPE: str = "local"
    STORAGE_PATH: str = "/app/storage"
    MAX_FILE_SIZE_MB: int = 20

    # Безопасность
    ADMIN_PASSWORD: str = "admin"      # пароль admin@local при первом создании; в v2.0 задать свой
    SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440
    CORS_ORIGINS: str = "http://localhost:5173"
    RATE_LIMIT_PER_MINUTE: int = 100

    # Публичный доступ (версия 2.0)
    DOMAIN: str = "localhost"
    SSL_ENABLED: bool = False

    # Автономная сборка (desktop): каталог со сборкой фронтенда, раздаётся самим backend
    FRONTEND_DIST: str = ""
    # Вход без пароля для локальной однопользовательской программы (включает только desktop-лаунчер)
    LOCAL_AUTOLOGIN: bool = False

    # Celery
    CELERY_TASK_ALWAYS_EAGER: bool = True


settings = Settings()
