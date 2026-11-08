# Профиль кредитора

Веб-приложение для кредиторов в процедурах банкротства: по ИНН должника или номеру дела считает вероятностный прогноз выплаты, риски оспаривания и субординации, состояние конкурсной массы и выдаёт **решения** (что делать, почему, сколько стоит), а не сырые вероятности.

Реализация — по документам `ТЕХНИЧЕСКОЕ ЗАДАНИЕ v1.0` и `ТЕОРИЯ МЕТОДИКИ «ПРОФИЛЬ КРЕДИТОРА»`.
Сервис носит информационно-аналитический характер, не является юридической услугой.

## Быстрый старт (версия 1.0, localhost)

```bash
docker compose up --build
```

| Что | Адрес |
|---|---|
| Приложение | http://localhost:5173 |
| API / Swagger | http://localhost:8000/docs |
| Health / Ready / Metrics | http://localhost:8000/health · `/ready` · `/metrics` |
| Единая точка входа (опц.) | `docker compose --profile proxy up` → http://localhost:8080 |

Вход: **admin@local / admin**. `.env` не обязателен; для настройки — `cp .env.example .env`.

> По умолчанию `PARSERS_MODE=mock`: приложение работает на **демонстрационных данных**, детерминированно зависящих от ИНН (интерфейс помечает такой расчёт). Попробуйте `7701234567`, `7702234567`; ИНН, оканчивающийся на `000` → режим Р1 (банкротства нет), на `00` → Р2.
> Для реальных источников задайте `PARSERS_MODE=live` (см. «Ограничения»).

### Запуск без Docker

```bash
# backend (SQLite, без Redis — кэш и rate-limit работают в памяти)
cd backend && pip install -r requirements-dev.txt
DATABASE_URL=sqlite+aiosqlite:///./dev.db ENVIRONMENT=local uvicorn app.main:app --reload
# frontend
cd frontend && npm install && npm run dev        # http://localhost:5173, проксирует /api на :8000
```

## Установщик для Windows (.exe)

Автономная версия без Docker, Postgres и Redis: один `.exe` открывается **в собственном окне** (pywebview / Edge WebView2), без консоли; SQLite и лог `creditor.log` — в `%LOCALAPPDATA%\CreditorProfile`. Вход `admin@local` / `admin`. Закрытие окна останавливает сервер. Если WebView2 нет — запасной вариант: браузер. Для отладки `CP_HEADLESS=1` запускает только сервер.

Сборка: GitHub → Actions → **Windows installer** → Run workflow; готовый `ProfilKreditora-Setup-1.0.0.exe` — в Artifacts. Либо вручную на Windows: `npm run build` во `frontend`, затем `pip install -r desktop/requirements-desktop.txt` и `pyinstaller desktop/creditor.spec` и `iscc desktop/installer.iss`.
Режим данных в автономной версии — демо (`PARSERS_MODE=mock`) + ручной ввод. OCR сканов требует отдельной установки Tesseract; Playwright (live-КАД) в exe не входит.

## Тесты

```bash
cd backend && python -m pytest --cov=app                         # 93 теста, SQLite
TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/creditor_test python -m pytest   # на PostgreSQL
cd frontend && npm run build && npm run preview &                # E2E: нужен запущенный backend на :8000
cd frontend && npx playwright test --trace off                   # при необходимости PW_CHROMIUM=/путь/к/chromium
```

## Устройство

```
backend/app/services/formulas.py        Ф1–Ф6 (чистые функции)
backend/app/services/modules/           М0 фильтр Бевзенко · М1 очередь · М2.1 субординация · М2.2 оспаривание
                                        М3 экономика · М4 практика судьи/АУ + балл независимости АУ · М5 расчёт
backend/app/services/calculator.py      оркестратор: режим → модули → сценарии (Ф5/Ф6) → приоритеты П0–П5 → стоимость действий
backend/app/services/mode_detector.py   режимы Р0–Р6;  level_detector.py — уровни полноты 0–5 по модулям
backend/app/services/parsers/           ЕФРСБ (httpx), КАД (Playwright), retry + circuit breaker, mock-данные
backend/app/services/document_processor.py   PDF / DOCX / OCR → факты → ручное подтверждение
backend/app/db/models/                  31 таблица, 8 слоёв;  backend/alembic/ — миграции
frontend/src/pages/                     Главная, Вход, Регистрация, Сводка, Детали, Аудит, Реестр, Документы, Профиль, Тарифы, /terms /privacy /offer
```

Три уровня погружения: **Сводка** (`/analysis/:id`) → **Детали** (сценарии, профиль АУ, стоимость, чек-лист) → **Аудит** (формулы, ДИ, источники, экспорт JSON/PDF).

## Feature flags

Версия 2.0 отличается от 1.0 **только** значениями ENV (полный список с комментариями — `.env.example`):

| Флаг | v1.0 | v2.0 |
|---|---|---|
| `PUBLIC_MODE` | false | true |
| `BILLING_ENABLED` | false | true |
| `PUBLIC_SIGNUP` | false | true |
| `EMAIL_SENDING` | false | true |
| `SSL_ENABLED` | false | true |

При `BILLING_ENABLED=false` всем присваивается `tier="admin"`, `/pricing` показывает «Оплата скоро»; при `PUBLIC_SIGNUP=false` `/auth/register` → 403 «Регистрация временно недоступна»; при `EMAIL_SENDING=false` письма только логируются.

## Переход на версию 2.0

1. Домен и VPS, Docker + docker compose.
2. `cp .env.example .env`, задать: `PUBLIC_MODE=true BILLING_ENABLED=true PUBLIC_SIGNUP=true EMAIL_SENDING=true SSL_ENABLED=true DOMAIN=…`, `ENVIRONMENT=prod`, сильные `SECRET_KEY`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `PARSERS_MODE=live`.
3. Получить сертификат certbot (команда — в шапке `nginx/nginx.prod.conf`), положить `fullchain.pem` и `privkey.pem` в `nginx/ssl/`.
4. `./scripts/deploy.sh` (проверяет `.env`, поднимает `docker-compose.prod.yml`, применяет миграции).
5. Войти как `admin@local`, сменить пароль (Профиль → Смена пароля).
6. Реализовать `services/payments/yookassa.py` (интерфейс готов), `PAYMENT_PROVIDER=yookassa`, `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`.
7. Реализовать `services/email/smtp.py`, `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`.
8. Проверить `/health`, `/docs`, `/pricing`.

Резервные копии: `scripts/backup.sh`, `scripts/restore.sh`; в prod-compose работает сервис `backup` (ежедневно, хранение 14 дней).

## Ручной ввод данных дела

Реальные ЕФРСБ/КАД из среды разработки недоступны (хосты закрыты), поэтому ручной ввод — полноценный путь: на главной «Ввести данные дела вручную» (или поле `manual` в `POST /api/v1/analyze`): дата заявления, активы, расходы, Σ3, статистика судьи, залог. Эти данные перекрывают данные парсеров, сохраняются в запросе (не теряются при смене режима и подтверждении фактов) и помечаются в сводке как «введено вручную».

## Допущения расчёта (где ТЗ неоднозначно)

- «Сумма требования» в форме — **неоплаченный остаток**; уже полученное исполнение указывается отдельно (окна оспаривания М2.2). Выплата считается в общей сумме `остаток + полученное`.
- Оспаривание: `X` возвращается в массу, требование восстанавливается как реестровое: `R_3(S+X, M3+X, Σ3+X)`. Пример главы 14 методики считает этот шаг иначе (внутренне непоследовательно), поэтому цифры не совпадают с ним буквально.
- Если реестр неизвестен: `Σ3 = 10 × требование`; если неизвестно имущество — отраслевой `p_zero` (43% юрлица / 94% граждане). Оба допущения выводятся в «Допущениях расчёта».
- Диапазон: ±20% от прогноза, при данных уровня 0–1 — ±50% (аналог «40–60% → 25–75%»).
- Вероятность успеха защиты сделки для оценки «прироста» принята 50% (`DEFENSE_SUCCESS` в `calculator.py`); действие рекомендуется, если прирост > издержек и ≥ 500 тыс. ₽.
- Модификатор судьи: `0,6 × отклонение`, ограничение ±0,15, при >15 п.п. — не слабее ±0,10, при незначимой выборке ×0,5.

## Ограничения и что не проверено

- **`PARSERS_MODE=live` не проверялся против реальных сайтов.** Эндпоинты ЕФРСБ взяты из ТЗ как есть (публичного API с такими путями может не существовать — понадобится ключ/договор), селекторы КАД Арбитр — ориентировочные и зависят от вёрстки сайта (у КАД есть антибот-защита). При сбое API отдаёт `status: "partial"` + `manual_input_required` и использует кэш. Судебная статистика (судья, АУ) в live-режиме **не собирается** — модуль М4 тогда работает без профилей (честно сообщая об этом).
- Docker-образы в среде разработки не собирались (нет Docker-демона): проверены лишь синтаксис compose-файлов (`docker compose config`) и скрипты (`bash -n`). Backend проверен на SQLite и PostgreSQL 16, миграция Alembic — на PostgreSQL 16.
- Критерий «расчёт совпадает с Excel на 10 делах (<5%)» не проверен: эталонных файлов нет. Формулы Ф1–Ф6 покрыты юнит-тестами, включая числа из методики (`D(10,100,120)=8,33`, `R_sec` и т. д.).
- Критерий «ИНН → профиль < 30 с» выполнен только для mock-режима.
- Извлечение фактов из документов — regex-эвристики; OCR требует `tesseract-ocr-rus` (есть в Docker-образе backend). Факты всегда подтверждаются вручную.
- Celery настроен в режиме `ALWAYS_EAGER`; фоновые задачи (`tasks/`) — каркас, автообновление по триггерам (глава 11 методики) не реализовано: есть только правила (`is_critical`, мёртвая зона, `delta_new`).
- Калибровка модели (глава 8, Brier/ECE) не реализована — ТЗ v1.0 её не требует.
- Миграция `0001_initial` строит схему из метаданных моделей; дальнейшие изменения — обычными `alembic revision --autogenerate`.
