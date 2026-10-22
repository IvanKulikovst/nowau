'use strict';
/* Сквозной тест приложения на Electron (нужен виртуальный экран на Linux):
     xvfb-run -a node test/e2e.test.js
   Проверяет главное: данные лежат в файлах и переживают потерю профиля браузера. */
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const electronPath = require('electron');
const APP = path.resolve(__dirname, '..');
const res = []; const check = (n, ok, i) => { res.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p));

(async () => {
  const dataDir = path.join(tmp('tst-e2e-'), 'Данные'), dlDir = tmp('tst-dl-');
  const launch = async () => {
    const app = await pw._electron.launch({ executablePath: electronPath, args: [APP, '--no-sandbox'],
      env: Object.assign({}, process.env, { TST_USER_DATA: tmp('tst-profile-'), TST_DATA_DIR: dataDir, TST_TEST: '1', TST_DOWNLOAD_DIR: dlDir }) });
    const page = await app.firstWindow();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.waitForLoadState('domcontentloaded'); await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelectorAll('.f-toast-close').forEach(x => x.click()));
    return { app, page, errs };
  };
  const readDb = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  const act = (page, a, id) => page.evaluate(([a, id]) => { const b = document.createElement('button'); b.dataset.act = a; if (id) b.dataset.id = id; document.getElementById('fleetView').appendChild(b); b.click(); b.remove(); }, [a, id]);

  // 1. Первый запуск
  let { app, page, errs } = await launch();
  check('Приложение запущено, мост TSTNative доступен', await page.evaluate(() => !!(window.TSTNative && window.TSTNative.isNative)));
  check('Заголовок окна', /Регламент-ТС/.test(await page.title()), await page.title());
  check('Папка данных — заданная', await page.evaluate(d => window.TSTNative.dataDir === d, dataDir));
  await page.evaluate(() => TST.setWorkspace('fleet')); await page.waitForTimeout(800);
  check('Файл db.json создан сразу (демо-данные)', fs.existsSync(path.join(dataDir, 'db.json')) && readDb().vehicles.length > 0, readDb().vehicles.length + ' машин');
  check('Записи не дублируются в localStorage браузера', await page.evaluate(() => localStorage.getItem('spravochnik-tst-fleet-v1') === null));

  // 2. Добавить технику через интерфейс
  await page.evaluate(() => { location.hash = '#fleet/park'; }); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('[data-act="add-vehicle"]').click()); await page.waitForSelector('#vName');
  await page.fill('#vName', 'Тестовая кухня «Файл»'); await page.fill('#vInv', 'ИН-E2E-1'); await page.click('#vSave'); await page.waitForTimeout(800);
  const veh = readDb().vehicles.find(v => v.name === 'Тестовая кухня «Файл»');
  check('Новая техника записана в db.json', !!veh, veh && veh.id);

  // 3. Вложение к записи ТО
  const bytes = Buffer.from([37, 80, 68, 70, 0, 1, 2, 200, 255, 10, 13]);   // файл с русским именем передаётся из памяти
  await act(page, 'add-maint', veh.id); await page.waitForSelector('#mFiles', { state: 'attached' });
  await page.setInputFiles('#mFiles', { name: 'акт.pdf', mimeType: 'application/pdf', buffer: bytes }); await page.waitForTimeout(300);
  await page.click('#mSave'); await page.waitForTimeout(1200);
  const filesDir = path.join(dataDir, 'files'); const bins = fs.readdirSync(filesDir).filter(n => n.endsWith('.bin'));
  check('Вложение записано в папку files', bins.length === 1 && Buffer.compare(fs.readFileSync(path.join(filesDir, bins[0])), bytes) === 0, bins.join(','));
  const maint = readDb().maint.find(m => m.vehicleId === veh.id); const docId = maint && maint.docs && maint.docs[0] && maint.docs[0].id;
  check('Запись ТО ссылается на вложение', !!docId && bins[0] === docId + '.bin');

  // 4. Точка восстановления
  await page.evaluate(() => { location.hash = '#fleet/safety'; }); await page.waitForTimeout(600);
  await act(page, 'snap-create'); await page.waitForTimeout(1200);
  const snaps = () => fs.readdirSync(path.join(dataDir, 'snapshots')).filter(n => n.endsWith('.json'));
  check('Точка восстановления записана в папку snapshots', snaps().length >= 1, snaps().length + ' шт.');
  check('Панель «Файлы данных приложения» показана', await page.evaluate(() => /файлы данных приложения/i.test(document.getElementById('fleetView').innerText) && document.getElementById('fleetView').innerText.includes('db.json')));
  check('Нет ошибок JavaScript (сессия 1)', errs.length === 0, errs[0]);
  await app.close();

  // 5. Главное: новый профиль браузера (как после очистки или переустановки), та же папка данных
  ({ app, page, errs } = await launch());
  await page.evaluate(() => { location.hash = '#fleet/park'; }); await page.waitForTimeout(800);
  check('После перезапуска с ЧИСТЫМ профилем техника на месте', await page.evaluate(() => document.getElementById('fleetView').innerText.includes('Тестовая кухня «Файл»')));
  check('Идентификатор техники не изменился', readDb().vehicles.some(v => v.id === veh.id));
  await page.evaluate(() => { location.hash = '#fleet/safety'; }); await page.waitForTimeout(1500);
  const nSnap = await page.evaluate(() => new Promise(r => { const q = indexedDB.open('tst-fleet-snapshots', 1); q.onsuccess = () => { const g = q.result.transaction('snaps').objectStore('snaps').getAll(); g.onsuccess = () => r(g.result.length); }; q.onerror = () => r(-1); }));
  check('Точки восстановления подтянуты из файлов в новый профиль', nSnap >= 1, nSnap + ' шт.');
  check('Точка видна в списке раздела «Сохранность данных»', await page.evaluate(() => /Вернуться/.test(document.getElementById('sfSnaps').innerText)));
  // вложение открывается из файла (в IndexedDB нового профиля его нет)
  await page.evaluate(id => { location.hash = '#fleet/vehicle/' + id; }, veh.id); await page.waitForTimeout(800);
  await page.evaluate(() => [...document.querySelectorAll('.f-tab')].find(t => /ТО/.test(t.textContent) && !/Моточасы/.test(t.textContent))?.click()); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('[data-act="download-file"]').click()); await page.waitForTimeout(1500);
  // Имя файла зависит от локали ОС (в тестовой среде без UTF-8 имя заменяется на «download»), поэтому сверяем содержимое
  const dlFiles = fs.readdirSync(dlDir); const got = dlFiles.length ? fs.readFileSync(path.join(dlDir, dlFiles[0])) : null;
  const dlToast = await page.evaluate(() => [...document.querySelectorAll('.f-toast')].map(t => t.innerText.replace(/\n/g, ' ')).join(' | '));
  check('Вложение читается из файла при чистом профиле (байты совпадают)', got && Buffer.compare(got, bytes) === 0, got ? got.length + ' байт' : 'не скачан; в папке: ' + fs.readdirSync(dlDir).join(',') + '; уведомления: ' + dlToast);
  // правка после перезапуска снова пишет в файл
  await page.evaluate(() => { location.hash = '#fleet/park'; }); await page.waitForTimeout(500);
  await page.evaluate(id => { const b = document.createElement('button'); b.dataset.act = 'edit-vehicle'; b.dataset.id = id; document.getElementById('fleetView').appendChild(b); b.click(); }, veh.id);
  await page.waitForSelector('#vInv'); await page.fill('#vInv', 'ИН-E2E-2'); await page.click('#vSave'); await page.waitForTimeout(800);
  check('Правка после перезапуска записана в файл', readDb().vehicles.find(v => v.id === veh.id).invNumber === 'ИН-E2E-2');
  check('Предыдущая версия сохранена в db.prev.json', fs.existsSync(path.join(dataDir, 'db.prev.json')) && JSON.parse(fs.readFileSync(path.join(dataDir, 'db.prev.json'), 'utf8')).vehicles.find(v => v.id === veh.id).invNumber === 'ИН-E2E-1');
  check('Нет ошибок JavaScript (сессия 2)', errs.length === 0, errs[0]);
  await app.close();

  // 6. Сбой: db.json оборван на середине записи
  const full = fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8');
  fs.writeFileSync(path.join(dataDir, 'db.json'), full.slice(0, Math.floor(full.length / 2)));
  ({ app, page, errs } = await launch());
  const toasts = await page.evaluate(() => [...document.querySelectorAll('.f-toast-title')].map(t => t.textContent));
  await page.waitForTimeout(1200);
  const toasts2 = await page.evaluate(() => [...document.querySelectorAll('.f-toast')].map(t => t.innerText).join(' | '));
  check('Оборванный db.json: программа предупредила о восстановлении', /Файл данных восстановлен из копии/.test(toasts.concat(toasts2).join(' ')), toasts2.slice(0, 120));
  await page.evaluate(() => { location.hash = '#fleet/park'; }); await page.waitForTimeout(800);
  check('Данные восстановлены из db.prev.json (техника на месте)', await page.evaluate(() => document.getElementById('fleetView').innerText.includes('Тестовая кухня «Файл»')));
  check('Повреждённый файл сохранён рядом', fs.readdirSync(dataDir).some(n => n.startsWith('db.corrupt-')));
  check('Новый db.json корректен', (() => { try { return readDb().vehicles.length > 0; } catch (e) { return false; } })());
  check('Нет ошибок JavaScript (сессия 3)', errs.length === 0, errs[0]);
  await app.close();

  console.log(`ИТОГ: ${res.filter(Boolean).length} из ${res.length}`);
  process.exit(res.every(Boolean) ? 0 : 1);
})().catch(e => { console.error('E2E ERROR', e); process.exit(2); });
