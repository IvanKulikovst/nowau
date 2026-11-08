#!/bin/bash
# Деплой версии 2.0. Запуск из корня проекта: ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Нет .env — скопируйте .env.example и заполните (см. README, «Переход на версию 2.0»)"; exit 1; }
set -a; . ./.env; set +a
[ "${SECRET_KEY:-change-me-in-production}" != "change-me-in-production" ] || { echo "Задайте SECRET_KEY в .env"; exit 1; }
[ "${ADMIN_PASSWORD:-admin}" != "admin" ] || { echo "Задайте ADMIN_PASSWORD в .env"; exit 1; }
[ -n "${POSTGRES_PASSWORD:-}" ] && [ "$POSTGRES_PASSWORD" != "postgres" ] || { echo "Задайте POSTGRES_PASSWORD в .env"; exit 1; }
[ -f nginx/ssl/fullchain.pem ] && [ -f nginx/ssl/privkey.pem ] || { echo "Нет SSL-сертификатов в nginx/ssl/ (fullchain.pem, privkey.pem) — см. nginx/nginx.prod.conf"; exit 1; }

COMPOSE="docker compose -f docker-compose.prod.yml"
$COMPOSE down
$COMPOSE up -d --build
# Миграции выполняются при старте backend (CMD: alembic upgrade head); повторно — на всякий случай
$COMPOSE exec -T backend alembic upgrade head
echo "Готово. Проверь https://${DOMAIN}/health"
