#!/bin/bash
# Восстановление: ./scripts/restore.sh backups/creditor_2026-11-08_1200.sql.gz
# ВНИМАНИЕ: текущая БД будет пересоздана.
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -eq 1 ] && [ -f "$1" ] || { echo "Использование: $0 <файл.sql.gz>"; exit 1; }
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}
read -r -p "Текущая БД будет удалена и заменена содержимым $1. Продолжить? [y/N] " a
[ "$a" = "y" ] || exit 0
DC="docker compose -f $COMPOSE_FILE"
$DC exec -T db psql -U postgres -c "DROP DATABASE IF EXISTS creditor;" -c "CREATE DATABASE creditor;"
gunzip -c "$1" | $DC exec -T db psql -U postgres creditor
echo "Восстановлено из $1"
