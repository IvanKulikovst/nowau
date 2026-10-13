#!/bin/sh
# Полный прогон проверок КРПД. Требуется: Node 18+, Playwright с Chromium, Python 3 с python-docx и openpyxl, poppler-utils (pdfinfo/pdftotext).
# Использование: sh tests/run-all.sh [krpd-standalone.html] [каталог-артефактов]
FILE=${1:-krpd-standalone.html}
OUT=${2:-test-output}
mkdir -p "$OUT"
rc=0
echo "== 1. Синтаксис и ESLint"; sh tests/lint.sh "$FILE" "$(mktemp -d)" || rc=1
echo "== 2. Запуск file://, консоль, сеть, встроенная самопроверка"; node tests/smoke.mjs "$FILE" || rc=1
echo "== 3. Расчёты: движок против независимого эталона (6000 случаев)"
python3 -I tests/calc_oracle.py "$FILE" gen 6000 > "$OUT/cases.json" && node tests/calc_run.mjs "$FILE" "$OUT/cases.json" "$OUT/got.json" && python3 -I tests/calc_oracle.py "$FILE" check "$OUT/cases.json" "$OUT/got.json" | tail -1 | tee "$OUT/oracle.txt"
grep -q "mismatches 0" "$OUT/oracle.txt" || rc=1
echo "== 4. Сквозные сценарии интерфейса"; node tests/e2e.mjs "$FILE" "$OUT/e2e" || rc=1
echo "== 5. Выгрузки DOCX/XLSX"; python3 -I tests/check_office.py "$OUT/e2e" 2>/dev/null || rc=1
echo "== 6. Производительность и утечки"; node tests/perf.mjs "$FILE" || rc=1
[ $rc -eq 0 ] && echo "ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" || echo "ЕСТЬ ОШИБКИ"
exit $rc
