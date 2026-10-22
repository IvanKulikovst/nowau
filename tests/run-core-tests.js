/* Запуск тестов вычислительного модуля без браузера:
   node tests/run-core-tests.js
   Модули конфигурации, вычислений и тестов извлекаются из index.html. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const start = js.indexOf('const METHOD');
const end = js.indexOf('/* =====================================================================\n   МОДУЛЬ 4.');
if (start < 0 || end < 0) { console.error('Не удалось выделить модули 1–3 из index.html'); process.exit(2); }
const ctx = {};
vm.createContext(ctx);
vm.runInContext(js.slice(start, end) + '\n;this.SelfTests = SelfTests;', ctx);
const res = ctx.SelfTests.run();
for (const r of res) console.log(`${r.ok ? 'OK  ' : 'FAIL'} [${r.group}] ${r.name}${r.detail ? ' :: ' + r.detail : ''}`);
const failed = res.filter(r => !r.ok).length;
console.log(`\nИтого: ${res.length - failed} из ${res.length} пройдено`);
process.exit(failed ? 1 : 0);
