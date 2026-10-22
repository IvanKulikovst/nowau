'use strict';
/* Переносной режим и проверка упакованного приложения:
     xvfb-run -a node test/portable.test.js [путь-к-app.asar]
   Без аргумента запускается исходная папка app. */
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const electronPath = require('electron');
const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const ok = []; const check = (n, v, i) => { ok.push(!!v); console.log((v ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
(async () => {
  const exeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tst-portable-'));
  const env = Object.assign({}, process.env, { PORTABLE_EXECUTABLE_DIR: exeDir, TST_TEST: '1' });
  delete env.TST_DATA_DIR; delete env.TST_USER_DATA;
  const app = await pw._electron.launch({ executablePath: electronPath, args: [target, '--no-sandbox'], env });
  const page = await app.firstWindow(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.waitForLoadState('domcontentloaded'); await page.waitForTimeout(3000);
  const base = path.join(exeDir, 'Данные Регламент-ТС');
  check('Приложение стартует' + (process.argv[2] ? ' из упакованного app.asar' : ''), await page.evaluate(() => !!(window.TSTNative && window.TSTNative.isNative)));
  check('Папка данных рядом с программой', await page.evaluate(d => window.TSTNative.dataDir === d, path.join(base, 'db')), await page.evaluate(() => window.TSTNative.dataDir));
  check('db.json создан в переносной папке', fs.existsSync(path.join(base, 'db', 'db.json')));
  check('Профиль приложения тоже рядом (флешка не оставляет следов)', fs.existsSync(path.join(base, 'profile')));
  check('Нет ошибок JavaScript', errs.length === 0, errs[0]);
  await app.close();
  console.log(`ИТОГ: ${ok.filter(Boolean).length} из ${ok.length}`); process.exit(ok.every(Boolean) ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
