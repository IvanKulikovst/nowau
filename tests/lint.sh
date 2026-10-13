#!/bin/sh
# Статическая проверка встроенных скриптов: синтаксис (node --check) и ESLint (неопределённые имена, дубли ключей, недостижимый код).
set -e
FILE=${1:-krpd-standalone.html}
OUT=${2:-$(mktemp -d)}
python3 -I - "$FILE" "$OUT" <<'PY'
import re, sys, os
s = open(sys.argv[1], encoding='utf-8').read()
for i, m in enumerate(re.finditer(r'<script(?: id="[^"]*")?>(.*?)</script>', s, re.S)):
    open(os.path.join(sys.argv[2], 'script%d.js' % i), 'w', encoding='utf-8').write(m.group(1))
PY
for f in "$OUT"/script*.js; do node --check "$f"; done
echo "syntax OK: $(ls "$OUT"/script*.js | wc -l) scripts"
cat > "$OUT/eslint.config.mjs" <<'CFG'
export default [{ files: ['**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: {
  window: 'readonly', document: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly', navigator: 'readonly', location: 'readonly', history: 'readonly',
  indexedDB: 'readonly', globalThis: 'readonly', crypto: 'readonly', Blob: 'readonly', URL: 'readonly', FileReader: 'readonly', Node: 'readonly', NodeFilter: 'readonly', Element: 'readonly',
  Event: 'readonly', MutationObserver: 'readonly', ResizeObserver: 'readonly', IntersectionObserver: 'readonly', TextEncoder: 'readonly', setTimeout: 'readonly',
  clearTimeout: 'readonly', getComputedStyle: 'readonly', console: 'readonly', addEventListener: 'readonly', dispatchEvent: 'readonly', PopStateEvent: 'readonly', BigInt: 'readonly' } },
  rules: { 'no-undef': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'no-redeclare': 'error', 'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }], 'no-self-assign': 'error', 'no-dupe-else-if': 'error', 'no-cond-assign': ['error', 'except-parens'], 'use-isnan': 'error', 'valid-typeof': 'error', 'no-unsafe-finally': 'error', 'eqeqeq': ['warn', 'smart'] } }];
CFG
cd "$OUT" && node /opt/node-tools/node_modules/eslint/bin/eslint.js -c eslint.config.mjs script*.js
