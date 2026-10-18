// Запуск: node tests/qr.spec.js [папка-для-результатов]
// Нужен Playwright с Chromium (npm i -D playwright && npx playwright install chromium).
const path = require('path');
const fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = pw;
const OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const PAGE_URL = require('url').pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const results = [];
const check = (n, name, ok, info) => { results.push({ n, name, ok: !!ok, info: info || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' #' + n + ' ' + name + (info ? ' — ' + info : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  // Полная изоляция от сети: любой не-file запрос блокируется и учитывается
  const netReq = [];
  await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue(); netReq.push(u); return r.abort(); });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  const URL0 = PAGE_URL;
  await p.goto(URL0 + '#fleet/park'); await p.waitForTimeout(1200);
  const closeToasts = () => p.evaluate(() => document.querySelectorAll('.f-toast-close').forEach(x => x.click()));
  await closeToasts();
  const ids0 = await p.evaluate(() => JSON.parse(localStorage.getItem('spravochnik-tst-fleet-v1')).vehicles.map(v => v.id));

  // 1. Постановка на учёт → идентификатор и QR
  async function addVehicle(f) {
    await p.evaluate(() => { document.querySelectorAll('.f-modal-backdrop').forEach(x => x.remove()); location.hash = '#fleet/park'; });
    await p.waitForTimeout(250);
    await p.evaluate(() => { document.querySelector('[data-act="add-vehicle"]').click(); });
    await p.waitForSelector('#vName');
    for (const [k, v] of Object.entries(f)) await p.fill('#' + k, String(v));
    await p.click('#vSave'); await p.waitForTimeout(300);
    const db = await p.evaluate(() => JSON.parse(localStorage.getItem('spravochnik-tst-fleet-v1')));
    return db.vehicles.find(v => v.name === f.vName);
  }
  const v1 = await addVehicle({ vName: 'Испытательная кухня КП-130 №1', vBrand: 'КП-130-11Л', vInv: 'ИН-777001', vReg: 'ТТ 0001 77', vSer: 'ЗВ-0001', vUnit: '1-я рота МО', vHours: 120 });
  check(1, 'Новая техника получает постоянный идентификатор', v1 && /^v_[a-z0-9]+_[a-z0-9]+$/.test(v1.id), v1 && v1.id);
  await p.evaluate(id => location.hash = '#fleet/vehicle/' + id, v1.id); await p.waitForTimeout(500);
  const hasPanel = await p.evaluate(() => !!document.querySelector('.qr-panel svg') && [...document.querySelectorAll('.qr-panel button')].map(b => b.textContent.trim()));
  check(1, 'В карточке есть QR-код и 4 кнопки', hasPanel && hasPanel.length === 4, JSON.stringify(hasPanel));

  // 2. Уникальность
  const more = [];
  for (let i = 2; i <= 4; i++) more.push(await addVehicle({ vName: 'Испытательная кухня КП-130 №' + i, vInv: 'ИН-77700' + i }));
  const v5 = await addVehicle({ vName: 'Пустая карточка' });   // только обязательное поле — для проверки пустых полей
  const all = await p.evaluate(() => JSON.parse(localStorage.getItem('spravochnik-tst-fleet-v1')).vehicles.map(v => v.id));
  check(2, 'Идентификаторы всех записей уникальны', new Set(all).size === all.length, all.length + ' записей');
  const payloads = await p.evaluate(ids => ids.map(id => TST.fleet.qrPayload(id)), all);

  // 3. Правка без смены идентификатора
  await p.evaluate(id => location.hash = '#fleet/vehicle/' + id, v1.id); await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('[data-act="edit-vehicle"]').click()); await p.waitForSelector('#vName');
  await p.fill('#vName', 'Испытательная кухня КП-130 №1 (изм.)'); await p.fill('#vUnit', '2-я рота МО');
  await p.click('#vSave'); await p.waitForTimeout(300);
  const v1e = await p.evaluate(id => JSON.parse(localStorage.getItem('spravochnik-tst-fleet-v1')).vehicles.find(v => v.id === id), v1.id);
  check(3, 'После правки идентификатор не изменился', v1e && v1e.name.endsWith('(изм.)') && v1e.id === v1.id, v1e && v1e.id);

  // 5. Печать одной наклейки (принтер этикеток 50×50)
  await p.evaluate(() => document.querySelector('.qr-panel [data-act="qr-print"]').click()); await p.waitForSelector('#qpFormat');
  await p.selectOption('#qpMedia', 'roll'); await p.selectOption('#qpFormat', '50x50'); await p.selectOption('#qpLevel', 'basic');
  await p.screenshot({ path: OUT + '/print-modal.png' });
  await p.click('#qpPrint'); await p.waitForTimeout(300);
  const printed1 = await p.evaluate(() => ({ n: window.__printed, pages: document.querySelectorAll('#fleetPrint .qr-page').length }));
  await p.emulateMedia({ media: 'print' }); await p.pdf({ path: OUT + '/one-50x50.pdf', preferCSSPageSize: true }); await p.emulateMedia({ media: 'screen' });
  check(5, 'Печать одной наклейки: вызвано окно печати, 1 страница', printed1.n === 1 && printed1.pages === 1, JSON.stringify(printed1));
  const exp1 = await p.evaluate(id => TST.fleet.qrPayload(id, 'basic'), v1.id);
  fs.writeFileSync(OUT + '/expect-one.json', JSON.stringify([exp1]));

  // 13. Моточасы: срок «Основных сведений» от них не зависит, «Расширенные» — устаревают
  const st1 = await p.evaluate(id => TST.fleet.qrState(id), v1.id);
  const fullBefore = await p.evaluate(id => TST.fleet.qrPayload(id, 'full'), v1.id);
  await p.evaluate(() => document.querySelector('[data-act="add-hours"]').click()); await p.waitForSelector('#hVal');
  await p.fill('#hVal', '400'); await p.click('#hSave'); await p.waitForTimeout(300);
  const st2 = await p.evaluate(id => TST.fleet.qrState(id), v1.id);
  const fullAfter = await p.evaluate(id => TST.fleet.qrPayload(id, 'full'), v1.id);
  check(13, 'Новые моточасы попадают в расширенный состав кода; наклейка «Основные сведения» остаётся актуальной (срок ТО не изменился)',
    st1 === 'ok' && st2 === 'ok' && /Моточасы: 120/.test(fullBefore) && /Моточасы: 400/.test(fullAfter), st1 + ' → ' + st2);
  // 4. Перезапуск
  await p.reload(); await p.waitForTimeout(1200);
  const after = await p.evaluate(id => { const v = JSON.parse(localStorage.getItem('spravochnik-tst-fleet-v1')).vehicles.find(x => x.id === id); return v && v.qr && v.id; }, v1.id);
  check(4, 'После перезапуска запись, идентификатор и отметка о печати сохранились', after === v1.id);

  // 6. A4 — массовая печать всех единиц
  await p.evaluate(() => location.hash = '#fleet/qr'); await p.waitForTimeout(500); await closeToasts();
  await p.evaluate(() => document.querySelector('[data-act="qr-sel-all"]').click()); await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('[data-act="qr-print-sel"]').click()); await p.waitForSelector('#qpFormat');
  await p.selectOption('#qpMedia', 'a4'); await p.selectOption('#qpFormat', '50x50'); await p.selectOption('#qpLevel', 'basic');
  await p.screenshot({ path: OUT + '/print-a4-modal.png' });
  await p.click('#qpPrint'); await p.waitForTimeout(300);
  const a4 = await p.evaluate(() => ({ pages: document.querySelectorAll('#fleetPrint .qr-page').length, stickers: document.querySelectorAll('#fleetPrint .qr-stk').length }));
  await p.emulateMedia({ media: 'print' }); await p.pdf({ path: OUT + '/a4-50x50.pdf', preferCSSPageSize: true }); await p.emulateMedia({ media: 'screen' });
  const allIds = await p.evaluate(() => JSON.parse(localStorage.getItem('spravochnik-tst-fleet-v1')).vehicles.map(v => v.id));
  check(6, 'Лист A4: все отмеченные наклейки на листе', a4.stickers === allIds.length, JSON.stringify(a4));
  fs.writeFileSync(OUT + '/expect-a4.json', JSON.stringify(await p.evaluate(ids => ids.map(id => TST.fleet.qrPayload(id, 'basic', '50x50')), allIds)));
  // формат 60×40 и 70×70 (расширенные)
  for (const [fmt, lvl] of [['60x40', 'basic'], ['70x70', 'full']]) {
    await p.evaluate(() => document.querySelector('[data-act="qr-print-sel"]').click()); await p.waitForSelector('#qpFormat');
    await p.selectOption('#qpMedia', 'roll'); await p.selectOption('#qpFormat', fmt); await p.selectOption('#qpLevel', lvl);
    await p.click('#qpPrint'); await p.waitForTimeout(300);
    await p.emulateMedia({ media: 'print' }); await p.pdf({ path: OUT + '/roll-' + fmt + '.pdf', preferCSSPageSize: true }); await p.emulateMedia({ media: 'screen' });
    fs.writeFileSync(OUT + '/expect-' + fmt + '.json', JSON.stringify(await p.evaluate(([ids, f, l]) => ids.map(id => TST.fleet.qrPayload(id, l, f)), [allIds, fmt, lvl])));
  }

  // 9, 10. Неизвестный и повреждённый код; HTML/JS в содержимом не выполняется
  const scan = async txt => {
    await p.evaluate(() => document.querySelectorAll('.f-modal-backdrop').forEach(x => x.remove()));
    await p.fill('#qrScanInput', txt); await p.evaluate(() => document.querySelector('[data-act="qr-scan-text"]').click()); await p.waitForTimeout(250);
    return p.evaluate(() => { const m = document.querySelector('.f-modal-backdrop .qr-card'); return m ? m.innerText.slice(0, 300) : null; });
  };
  const r9 = await scan('TST:1:v_neizvestnyi_000');
  check(9, 'Неизвестный идентификатор → «не найдена в локальной базе»', r9 && /не найдена в локальной базе/.test(r9), r9 && r9.split('\n')[0]);
  await p.evaluate(() => { window.__pwn = 0; });
  const bad = ['просто текст', 'TST:2:v_abc_def', 'TST:1:<img src=x onerror="window.__pwn=1">', 'TST:1:v_ab\n<script>window.__pwn=1</script>', 'https://example.com/'];
  const rb = []; for (const t of bad) rb.push(await scan(t));
  const pwn = await p.evaluate(() => window.__pwn);
  check(10, 'Повреждённые и чужие коды отклоняются, содержимое не выполняется', rb.every(x => x && !/основные сведения/i.test(x)) && pwn === 0, rb.map(x => (x || '').split('\n')[0]).join(' | '));

  // 7 (часть). Содержимое напечатанного кода → карточка именно этой единицы
  const card1 = await scan(exp1);
  check(7, 'Содержимое напечатанного кода открывает карточку именно этой единицы', card1 && card1.includes('Испытательная кухня КП-130 №1 (изм.)') && !/отличаются от базы/.test(card1), (card1 || '').split('\n').slice(0, 2).join(' / '));
  const oneLine = await scan(exp1.replace(/\n/g, ' '));   // строки склеены при вставке
  check(7, 'Склеенное в одну строку содержимое тоже распознаётся', oneLine && /основные сведения/i.test(oneLine) && oneLine.includes('Испытательная кухня КП-130 №1 (изм.)'));
  // Наклейка напечатана, затем название изменено → при сканировании видно расхождение
  await p.evaluate(id => { location.hash = '#fleet/vehicle/' + id; }, v1.id); await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelectorAll('.f-modal-backdrop').forEach(x => x.remove()));
  await p.evaluate(() => document.querySelector('[data-act="edit-vehicle"]').click()); await p.waitForSelector('#vName');
  await p.fill('#vName', 'Кухня КП-130 — переименована'); await p.click('#vSave'); await p.waitForTimeout(300);
  const stale = await p.evaluate(id => TST.fleet.qrState(id), v1.id);
  await p.evaluate(() => location.hash = '#fleet/qr'); await p.waitForTimeout(400);
  const card1b = await scan(exp1);
  check(13, 'После правки названия наклейка помечена «устарела», при сканировании показано расхождение (без подмены записи)', stale === 'stale' && card1b && /отличаются от базы/.test(card1b), stale);
  await p.screenshot({ path: OUT + '/scan-card.png' });
  const card5 = await scan('TST:1:' + v5.id);
  const naCount = card5 ? (card5.match(/Не указано/g) || []).length : 0;
  check(12, 'Пустые поля показываются как «Не указано»', naCount >= 5, naCount + ' полей «Не указано»');
  const scanUnchanged = await p.evaluate(() => localStorage.getItem('spravochnik-tst-fleet-v1').length);

  // 11. Резервная копия: экспорт → очистка → восстановление
  await p.evaluate(() => document.querySelectorAll('.f-modal-backdrop').forEach(x => x.remove()));
  await p.evaluate(() => location.hash = '#fleet/settings'); await p.waitForTimeout(500);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => document.querySelector('[data-act="backup-export"]').click())]);
  await dl.saveAs(OUT + '/backup.zip');
  const before = await p.evaluate(() => JSON.parse(localStorage.getItem('spravochnik-tst-fleet-v1')).vehicles.map(v => v.id + '|' + (v.qr ? v.qr.digest : '')).sort().join(','));
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('spravochnik-tst-fleet-v1')); d.vehicles = []; localStorage.setItem('spravochnik-tst-fleet-v1', JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(1000); await p.evaluate(() => location.hash = '#fleet/settings'); await p.waitForTimeout(400);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.evaluate(() => document.querySelector('[data-act="backup-import"]').click())]);
  await fc.setFiles(OUT + '/backup.zip'); await p.waitForTimeout(600);
  await p.evaluate(() => { const y = document.querySelector('[data-dec="restore"]') || document.querySelector('[data-yes]'); if (y) y.click(); }); await p.waitForTimeout(1200);
  const restored = await p.evaluate(() => JSON.parse(localStorage.getItem('spravochnik-tst-fleet-v1')).vehicles.map(v => v.id + '|' + (v.qr ? v.qr.digest : '')).sort().join(','));
  check(11, 'Экспорт/импорт сохраняет идентификаторы и отметки QR', restored === before && before.length > 0, restored.split(',').length + ' записей');

  // 8, 14. Без сети
  const ext = await p.evaluate(() => [...document.querySelectorAll('script[src],link[href],img[src],iframe[src]')].map(n => n.src || n.href).filter(u => /^https?:/.test(u)));
  check(8, 'Ни одного сетевого запроса за весь прогон (все внешние запросы заблокированы и учтены)', netReq.length === 0, netReq.length + ' запросов: ' + netReq.slice(0, 3).join(', '));
  check(14, 'Нет внешних скриптов, стилей, изображений', ext.length === 0, ext.join(', '));

  // 15. Регрессия: все разделы учёта, справочник, обзор, окно печати, справка
  const views = ['park', 'dashboard', 'trips', 'planning', 'documents', 'reports', 'qr', 'settings'];
  for (const v of views) { await p.evaluate(x => location.hash = '#fleet/' + x, v); await p.waitForTimeout(250); }
  await p.evaluate(() => location.hash = '#catalog/ka-220/to1'); await p.waitForTimeout(300);
  await p.evaluate(() => location.hash = '#overview'); await p.waitForTimeout(300);
  await p.evaluate(() => location.hash = '#fleet/reports'); await p.waitForTimeout(300);
  await p.keyboard.press('Control+p'); await p.waitForTimeout(500);
  const pw = await p.evaluate(() => !!document.querySelector('.pw')); await p.keyboard.press('Escape');
  await p.keyboard.press('F1'); await p.waitForTimeout(500);
  const help = await p.evaluate(() => !!document.querySelector('#ref-s11')); await p.keyboard.press('Escape');
  check(15, 'Регрессия: разделы, окно печати документов и справка (с разделом 11) работают без ошибок', errs.length === 0 && pw && help, 'ошибок JS: ' + errs.length + (errs[0] ? ' (' + errs[0] + ')' : ''));
  fs.writeFileSync(OUT + '/results.json', JSON.stringify(results, null, 1));
  await b.close();
})().catch(e => { console.error('SUITE ERROR', e); process.exit(1); });
