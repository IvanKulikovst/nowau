#!/bin/bash
# Резервная копия БД в backups/creditor_ГГГГ-ММ-ДД_ЧЧММ.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}
mkdir -p backups
OUT="backups/creditor_$(date +%F_%H%M).sql.gz"
docker compose -f "$COMPOSE_FILE" exec -T db pg_dump -U postgres creditor | gzip > "$OUT"
echo "Сохранено: $OUT"
