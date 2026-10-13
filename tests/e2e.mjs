// Сквозные проверки КРПД в реальном Chromium (file://).
// Запуск: PW_PATH=/opt/node-tools/node_modules/playwright node tests/e2e.mjs krpd-standalone.html <каталог-артефактов>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');

const file = path.resolve(process.argv[2] || 'krpd-standalone.html');
const out = path.resolve(process.argv[3] || 'test-output');
fs.mkdirSync(out, { recursive: true });
const URL0 = 'file://' + file;
const results = [];
let cur = null;
function rec(id, name, ok, detail) { results.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail: detail || '' }); console.log((ok ? 'PASS ' : 'FAIL ') + id + ' ' + name + (detail ? ' — ' + detail : '')); }
async function step(id, name, fn) {
  cur = id;
  try { const r = await fn(); rec(id, name, r === undefined ? true : !!(r === true || (r && r.ok)), r && r.detail ? r.detail : (typeof r === 'string' ? r : '')); }
  catch (e) { rec(id, name, false, 'исключение: ' + String(e && e.message || e).split('\n')[0]); }
}

const browser = await chromium.launch();
async function fresh(viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errs.push('console: ' + m.text()); });
  await page.goto(URL0);
  await page.waitForFunction(() => window.KRPD && window.KRPD.isReady());
  return { ctx, page };
}
async function enter(page) { await page.click('#startBtn'); await page.waitForFunction(() => document.getElementById('landing').hidden); }
const txt = (page, sel) => page.$eval(sel, (n) => n.textContent.trim());
const items = (page) => page.evaluate(() => window.KRPD.getItems().map((x) => Object.assign({}, x)));
const toastText = (page) => page.evaluate(() => { const t = document.querySelector('#toasts .toast'); return t ? t.innerText : ''; });
const crashBanner = (page) => page.evaluate(() => !!document.querySelector('[aria-label="Сбой интерфейса"]'));

let { ctx, page } = await fresh();

/* ---------- лендинг ---------- */
await step('L1', 'Лендинг виден при запуске, приложение недоступно (inert)', async () => {
  const vis = await page.isVisible('#landing');
  const inert = await page.evaluate(() => document.getElementById('app').inert);
  return vis && inert;
});
for (const [id, mid] of [['L2', 'm-about'], ['L3', 'm-req'], ['L4', 'm-auth']]) {
  await step(id, 'Окно лендинга ' + mid + ': открытие с фокусом внутри, закрытие ✕/Esc/щелчком по фону, возврат фокуса', async () => {
    await page.click('[data-open="' + mid + '"]');
    const o1 = await page.$eval('#' + mid, (n) => n.classList.contains('open'));
    await page.waitForTimeout(450); // фокус переводится после CSS-перехода видимости окна
    const focusIn = await page.evaluate((mid) => document.getElementById(mid).contains(document.activeElement), mid);
    await page.click('#' + mid + ' .l-close');
    const c1 = await page.$eval('#' + mid, (n) => !n.classList.contains('open'));
    await page.click('[data-open="' + mid + '"]');
    await page.keyboard.press('Escape');
    const c2 = await page.$eval('#' + mid, (n) => !n.classList.contains('open'));
    await page.click('[data-open="' + mid + '"]');
    await page.waitForTimeout(450); // окно становится кликабельным после CSS-перехода видимости
    await page.mouse.click(5, 450);
    const c3 = await page.$eval('#' + mid, (n) => !n.classList.contains('open'));
    const back = await page.evaluate((mid) => document.activeElement && document.activeElement.getAttribute('data-open') === mid, mid);
    return { ok: o1 && focusIn && c1 && c2 && c3 && back, detail: 'открыто/фокус внутри/✕/Esc/фон/фокус возвращён: ' + [o1, focusIn, c1, c2, c3, back].join('/') };
  });
}
await step('L5', '«Начать работу» скрывает лендинг и снимает inert', async () => {
  await enter(page);
  return !(await page.evaluate(() => document.getElementById('app').inert));
});

/* ---------- данные по умолчанию и итоги ---------- */
await step('D1', 'Первый запуск: 3 демонстрационные записи, итоги = сумме строк', async () => {
  const its = await items(page);
  const sum = await page.evaluate(() => { let v = 0n, m = 0n; for (const it of window.KRPD.getItems()) { const c = window.KRPD.calcRecord(it); v += c.volL; m += c.massG; } return [window.KRPD.fmtScaled(v, 3) + ' м³', window.KRPD.fmtScaled(m, 3) + ' кг']; });
  const tv = await txt(page, '#totV'), tm = await txt(page, '#totM');
  return { ok: its.length === 3 && tv === sum[0] && tm === sum[1], detail: tv + ' / ' + tm };
});
await step('D2', 'Демо-записи не записываются в хранилище при загрузке (boot read-only)', async () => {
  const ls = await page.evaluate(() => localStorage.getItem('krpd-firewood.root'));
  return ls === null;
});

/* ---------- навигация ---------- */
const SUBS = { home: ['overview', 'stats'], calc: ['list', 'new', 'io', 'history'], docs: ['orders', 'amend', 'forms'], print: ['preview', 'params', 'log'], set: ['user', 'org', 'calc', 'view', 'data'] };
await step('N1', 'Все подразделы бокового меню открываются, хлебные крошки и hash совпадают', async () => {
  const bad = [];
  for (const sec of Object.keys(SUBS)) {
    await page.click('.side-sec[data-sec="' + sec + '"] .side-sec-btn');
    for (const sub of SUBS[sec]) {
      await page.click('.side-item[data-key="' + sec + '/' + sub + '"]');
      const st = await page.evaluate(() => ({ h: location.hash, cr: document.getElementById('crumb').innerText, vis: [...document.querySelectorAll('#app [data-view]')].filter((n) => !n.classList.contains('vhide') && n.offsetParent !== null).length + (document.getElementById('dyn').classList.contains('vhide') ? 0 : 1) }));
      if (st.h !== '#/' + sec + '/' + sub || st.vis === 0) bad.push(sec + '/' + sub + ':' + st.h + ':' + st.vis);
    }
  }
  return { ok: bad.length === 0 && !(await crashBanner(page)), detail: bad.join(', ') };
});
await step('N2', 'Кнопка «Назад» браузера возвращает предыдущий подраздел', async () => {
  await page.click('.side-sec[data-sec="docs"] .side-sec-btn');
  await page.click('.side-item[data-key="docs/forms"]');
  await page.goBack();
  await page.waitForTimeout(200);
  return (await page.evaluate(() => location.hash)) === '#/docs/orders';
});
await step('N3', 'Alt+1…5 переключают разделы', async () => {
  const got = [];
  for (let i = 1; i <= 5; i++) { await page.keyboard.press('Alt+' + i); got.push(await page.evaluate(() => document.getElementById('app').getAttribute('data-cur'))); }
  return { ok: got.join(',') === 'home,calc,docs,print,set', detail: got.join(',') };
});
await step('N4', 'Прямое открытие внутреннего маршрута #/print/log', async () => {
  const p2 = await ctx.newPage();
  await p2.goto(URL0 + '#/print/log');
  await p2.waitForFunction(() => window.KRPD && window.KRPD.isReady());
  const cr = await p2.$eval('#crumb', (n) => n.innerText);
  await p2.close();
  return { ok: /Журнал печати/.test(cr), detail: cr.replace(/\s+/g, ' ') };
});
await step('N5', 'Несуществующий маршрут #/zzz/yyy открывает «Главная › Обзор»', async () => {
  const p2 = await ctx.newPage();
  const errs = []; p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto(URL0 + '#/zzz/yyy');
  await p2.waitForFunction(() => window.KRPD && window.KRPD.isReady());
  const cr = await p2.$eval('#crumb', (n) => n.innerText);
  await p2.close();
  return { ok: /Обзор/.test(cr) && !errs.length, detail: cr.replace(/\s+/g, ' ') + ' ' + errs.join(';') };
});

/* ---------- создание расчёта ---------- */
await page.evaluate(() => { location.hash = '#/calc/list'; dispatchEvent(new PopStateEvent('popstate')); });
await step('C1', 'Новый расчёт: форма, предпросмотр (УСТ-56, −10 °C, 4 м/с, 4 шт., 7 сут → 2,536 м³)', async () => {
  await page.click('#sideNew');
  await page.waitForSelector('#scrim:not([hidden])');
  await page.fill('#f-title', 'Тест E2E палатки');
  await page.fill('#f-date', '2026-02-10');
  await page.selectOption('#f-object', 'ust56');
  await page.fill('#f-qty', '4'); await page.fill('#f-tempC', '−10'); await page.fill('#f-windMs', '4'); await page.fill('#f-days', '7');
  const pv = await page.$eval('.preview', (n) => n.innerText);
  return { ok: /V = M \/ ρ =\s*2,536 м³/.test(pv) && /278,600 кг у\.т\./.test(pv), detail: pv.split('\n').slice(-1)[0] };
});
await step('C2', 'Сохранение «Готово»: запись в списке и в IndexedDB/localStorage', async () => {
  await page.click('#sheetFoot .btn.fill');
  await page.waitForSelector('#scrim', { state: 'hidden' });
  const its = await items(page);
  const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('krpd-firewood.root') || 'null'));
  const inList = await page.evaluate(() => [...document.querySelectorAll('#list .item')].some((n) => n.innerText.includes('Тест E2E палатки')));
  return { ok: its.length === 4 && ls && ls.payload.length === 4 && inList, detail: 'items ' + its.length };
});
await step('C3', 'Валидация: пустое наименование, текст в количестве, ветер 25, КПД 1,5 → ошибки у полей, запись не создаётся', async () => {
  await page.click('#sideNew');
  await page.fill('#f-title', ''); await page.fill('#f-qty', 'abc'); await page.fill('#f-windMs', '25'); await page.fill('#f-kpdBp', '1,5');
  await page.click('#sheetFoot .btn.fill');
  const errs = await page.$$eval('.ferr:not([hidden])', (n) => n.map((x) => x.id));
  const open = await page.isVisible('#scrim');
  await page.keyboard.press('Escape');
  const its = await items(page);
  return { ok: open && ['err-title', 'err-qty', 'err-windMs', 'err-kpdBp'].every((e) => errs.includes(e)) && its.length === 4, detail: errs.join(',') };
});
await step('C4', 'Граничные значения: строение 26 м³ отклоняется; 25 м³, −30 °C принимается', async () => {
  await page.click('#sideNew');
  await page.fill('#f-title', 'Строение граница'); await page.selectOption('#f-object', 'bldg'); await page.fill('#f-tempC', '-30'); await page.fill('#f-qty', '26'); await page.fill('#f-days', '1');
  await page.click('#sheetFoot .btn.fill');
  const e26 = await page.isVisible('#err-qty');
  await page.fill('#f-qty', '25');
  await page.click('#sheetFoot .btn.fill');
  await page.waitForSelector('#scrim', { state: 'hidden' });
  const its = await items(page);
  return { ok: e26 && its.length === 5, detail: 'items ' + its.length };
});
await step('C5', 'Редактирование: открыть запись, изменить сутки 7→14, объём удваивается (±0,001)', async () => {
  const before = await page.evaluate(() => { const it = window.KRPD.getItems().find((x) => x.title === 'Тест E2E палатки'); return Number(window.KRPD.calcRecord(it).volL); });
  await page.click('#list .item:has-text("Тест E2E палатки") .item-main');
  await page.fill('#f-days', '14');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#scrim', { state: 'hidden' });
  const after = await page.evaluate(() => { const it = window.KRPD.getItems().find((x) => x.title === 'Тест E2E палатки'); return Number(window.KRPD.calcRecord(it).volL); });
  return { ok: Math.abs(after - 2 * before) <= 1 && (await items(page)).length === 5, detail: before + ' → ' + after };
});
await step('C6', 'Удаление + «Отменить» в уведомлении восстанавливает запись', async () => {
  await page.click('#list .item:has-text("Строение граница") .icon-btn.danger');
  const n1 = (await items(page)).length;
  await page.click('#toasts .toast button:has-text("Отменить")');
  await page.waitForTimeout(200);
  const n2 = (await items(page)).length;
  return { ok: n1 === 4 && n2 === 5, detail: n1 + '→' + n2 };
});
await step('C7', 'Ctrl+Z отменяет последнее действие', async () => {
  await page.click('#list .item:has-text("Строение граница") .icon-btn.danger');
  await page.locator('body').click({ position: { x: 700, y: 20 } }).catch(() => {});
  await page.keyboard.press('Escape');
  await page.focus('body');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  return (await items(page)).length === 5;
});
await step('C8', 'Поиск и сегменты: «Строение» → 1; сегмент «Землянки» → 1; счётчики сегментов', async () => {
  await page.fill('#search', 'строение граница');
  const n1 = await page.$$eval('#list .item', (n) => n.length);
  await page.fill('#search', '');
  await page.click('#tab-dugout');
  const n2 = await page.$$eval('#list .item', (n) => n.length);
  const cnt = await page.$eval('#tab-tent', (n) => n.innerText);
  await page.click('#tab-all');
  return { ok: n1 === 1 && n2 === 1 && /2$/.test(cnt), detail: n1 + '/' + n2 + '/' + cnt };
});
await step('C9', 'Сохранение переживает перезагрузку страницы', async () => {
  await page.reload();
  await page.waitForFunction(() => window.KRPD && window.KRPD.isReady());
  return (await items(page)).length === 5;
});
await enter(page);

/* ---------- экспорт / импорт ---------- */
let exported = null;
await step('X1', 'Экспорт в файл JSON: скачивается, 5 записей, корректная схема', async () => {
  await page.evaluate(() => { location.hash = '#/set/data'; dispatchEvent(new PopStateEvent('popstate')); });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExport')]);
  const p = path.join(out, dl.suggestedFilename()); await dl.saveAs(p);
  exported = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { ok: exported._meta.appId === 'krpd-firewood' && exported._meta.schemaVersion === 2 && exported.payload.length === 5, detail: dl.suggestedFilename() };
});
await step('X2', 'Импорт «Заменить» корректного файла с 1 записью и 1 повреждённой → 1 в списке, 1 в карантине', async () => {
  const doc = { _meta: { appId: 'krpd-firewood', schemaVersion: 2 }, payload: [exported.payload[0], { id: 'badbad01', title: 'x', object: 'nope' }] };
  const p = path.join(out, 'import1.json'); fs.writeFileSync(p, JSON.stringify(doc));
  await page.setInputFiles('#file', p);
  await page.waitForSelector('#scrim:not([hidden])');
  const body = await page.$eval('#sheetBody', (n) => n.innerText);
  await page.click('#sheetFoot button:has-text("Заменить")');
  await page.waitForTimeout(300);
  const its = await items(page);
  const quar = await page.evaluate(() => !!document.querySelector('[aria-label^="Скрыто повреждённых записей"]'));
  return { ok: its.length === 1 && quar && /записей: 1/.test(body), detail: body.replace(/\s+/g, ' ').slice(0, 120) };
});
await step('X3', 'Импорт «Объединить» исходного экспорта → 5 записей (без дублей)', async () => {
  const p = path.join(out, 'import2.json'); fs.writeFileSync(p, JSON.stringify(exported));
  await page.setInputFiles('#file', p);
  await page.waitForSelector('#scrim:not([hidden])');
  await page.click('#sheetFoot button:has-text("Объединить")');
  await page.waitForTimeout(300);
  return (await items(page)).length === 5;
});
await step('X4', 'Импорт повреждённого JSON → сообщение, данные не изменены', async () => {
  const p = path.join(out, 'broken.json'); fs.writeFileSync(p, '{"payload": [');
  await page.setInputFiles('#file', p);
  await page.waitForTimeout(200);
  const t = await toastText(page);
  return { ok: /не является корректным JSON/.test(t) && (await items(page)).length === 5, detail: t };
});
await step('X5', 'Импорт файла другого приложения → отказ', async () => {
  const p = path.join(out, 'other.json'); fs.writeFileSync(p, JSON.stringify({ _meta: { appId: 'other' }, payload: [] }));
  await page.setInputFiles('#file', p);
  await page.waitForTimeout(200);
  return /другим приложением/.test(await toastText(page));
});
await step('X6', 'Импорт файла schemaVersion 1 (без date) → миграция, дата из updatedAt', async () => {
  const r = Object.assign({}, exported.payload[0], { id: 'migr0001', updatedAt: '2025-11-03T10:00:00.000Z', title: 'Мигр' }); delete r.date;
  const p = path.join(out, 'v1.json'); fs.writeFileSync(p, JSON.stringify({ _meta: { appId: 'krpd-firewood', schemaVersion: 1 }, payload: [r] }));
  await page.setInputFiles('#file', p);
  await page.waitForSelector('#scrim:not([hidden])');
  await page.click('#sheetFoot button:has-text("Объединить")');
  await page.waitForTimeout(300);
  const it = (await items(page)).find((x) => x.id === 'migr0001');
  return { ok: !!it && it.date === '2025-11-03', detail: it ? it.date : 'нет' };
});
await step('X7', 'Удалить все расчёты: подтверждение, затем «Отменить» восстанавливает', async () => {
  const n0 = (await items(page)).length;
  await page.click('#btnClear');
  await page.click('#sheetFoot button:has-text("Удалить все")');
  await page.waitForTimeout(200);
  const n1 = (await items(page)).length;
  await page.click('#toasts .toast button:has-text("Отменить")');
  await page.waitForTimeout(200);
  const n2 = (await items(page)).length;
  return { ok: n1 === 0 && n2 === n0, detail: n0 + '→' + n1 + '→' + n2 };
});
await step('X8', 'Удалить повреждённые (карантин) с подтверждением', async () => {
  await page.click('[aria-label^="Скрыто повреждённых записей"] .btn.danger');
  await page.click('#sheetFoot button:has-text("Удалить")');
  await page.waitForTimeout(200);
  return !(await page.evaluate(() => !!document.querySelector('[aria-label^="Скрыто повреждённых записей"]')));
});

await step('X9', 'XSS: название с HTML/скриптом из импортированного файла выводится как текст', async () => {
  const evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
  const r = Object.assign({}, exported.payload[0], { id: 'xss00001', title: evil, updatedAt: '2030-01-01T00:00:00.000Z' });
  const p = path.join(out, 'xss.json'); fs.writeFileSync(p, JSON.stringify({ _meta: { appId: 'krpd-firewood', schemaVersion: 2 }, payload: [r] }));
  await page.setInputFiles('#file', p);
  await page.waitForSelector('#scrim:not([hidden])');
  await page.click('#sheetFoot button:has-text("Объединить")');
  await page.waitForTimeout(300);
  await page.evaluate(() => { location.hash = '#/home/overview'; dispatchEvent(new PopStateEvent('popstate')); });
  await page.evaluate(() => { location.hash = '#/calc/history'; dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => ({ xss: window.__xss || 0, imgs: document.querySelectorAll('#app img, #chBars img').length, shown: document.body.innerText.includes('<img src=x') }));
  await page.click('#list .item:has-text("<img src=x") .icon-btn.danger').catch(() => {});
  await page.evaluate(() => window.KRPD.getItems().length);
  return { ok: st.xss === 0 && st.imgs === 0 && st.shown, detail: JSON.stringify(st) };
});
await page.evaluate(() => { location.hash = '#/calc/list'; dispatchEvent(new PopStateEvent('popstate')); });
await page.click('#list .item:has-text("<img src=x") .icon-btn.danger');

/* ---------- окно печати ---------- */
async function openPW() { await page.keyboard.press('Control+Shift+P'); await page.waitForSelector('.pw'); }
await step('P1', 'Окно печати открывается (Ctrl+Shift+P), фон inert, Esc закрывает', async () => {
  await openPW();
  const inert = await page.evaluate(() => document.getElementById('app').inert);
  await page.keyboard.press('Escape');
  const gone = (await page.$('.pw')) === null;
  const inert2 = await page.evaluate(() => document.getElementById('app').inert);
  return { ok: inert && gone && !inert2, detail: [inert, gone, inert2].join('/') };
});
for (const f of ['a1', 'a2', 'a3', 'a4']) {
  await step('P2-' + f, 'Форма ' + f + ': предпросмотр строится, есть таблица и страницы', async () => {
    await openPW();
    await page.selectOption('#pw-form', f);
    await page.fill('#pw-year', '2026');
    if (f === 'a3' || f === 'a4') await page.selectOption('#pw-month', '1');
    await page.waitForTimeout(150);
    const st = await page.evaluate(() => ({ sheets: document.querySelectorAll('.pv-sheet').length, tables: document.querySelectorAll('.pv-sheet table').length, status: document.getElementById('pw-status').textContent }));
    await page.keyboard.press('Escape');
    return { ok: st.sheets >= 1 && st.tables >= 1, detail: JSON.stringify(st) };
  });
}
await step('P3', 'Окно печати: год «20x6» → ошибка поля, экспорт блокируется', async () => {
  await openPW();
  await page.fill('#pw-year', '20x6');
  const err = await page.$eval('#pwf-year .xerr', (n) => !n.hidden && n.textContent);
  await page.click('.pw-foot button:has-text("Word")');
  const t = await toastText(page);
  await page.fill('#pw-year', '2026');
  await page.keyboard.press('Escape');
  return { ok: !!err && /Исправьте/.test(t), detail: err + ' | ' + t };
});
const exportsDone = {};
for (const f of ['a1', 'a2', 'a3', 'a4']) {
  for (const kind of ['Word', 'Excel']) {
    await step('P4-' + f + '-' + kind, 'Экспорт ' + f + ' в ' + kind + ' скачивается', async () => {
      await openPW();
      await page.selectOption('#pw-form', f);
      await page.fill('#pw-year', '2026');
      if (f === 'a3' || f === 'a4') await page.selectOption('#pw-month', '1');
      if (f === 'a2') { await page.fill('#pw-rem', '0,5'); await page.fill('#pw-price', '3500,50'); await page.fill('#pw-unit', 'в/ч 0000'); await page.fill('#pw-place', 'г. Тест'); }
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.pw-foot button:has-text("' + kind + '")')]);
      const p = path.join(out, dl.suggestedFilename()); await dl.saveAs(p);
      exportsDone[f + kind] = p;
      await page.keyboard.press('Escape');
      return { ok: fs.statSync(p).size > 500, detail: path.basename(p) + ' ' + fs.statSync(p).size + ' б' };
    });
  }
}
async function printPdf(name) {
  // window.print() в headless не открывает диалог; печатный вид снимается через page.pdf с CSS-размером страницы
  const p = path.join(out, name);
  await page.pdf({ path: p, preferCSSPageSize: true });
  const { execFileSync } = await import('node:child_process');
  const info = execFileSync('pdfinfo', [p]).toString();
  const m = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
  const text = execFileSync('pdftotext', ['-layout', p, '-']).toString();
  return { w: +m[1], h: +m[2], pages: +(/Pages:\s+(\d+)/.exec(info)[1]), text };
}
await step('P5', 'Печать формы № 1 → PDF: A4 альбомный, есть заголовок и ИТОГО, нет элементов интерфейса', async () => {
  await page.evaluate(() => { window.print = () => {}; });
  await openPW();
  await page.selectOption('#pw-form', 'a1');
  await page.fill('#pw-year', '2026');
  await page.click('#pw-print');
  const r = await printPdf('print-a1.pdf');
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  await page.keyboard.press('Escape');
  const ui = /Обзор потребления|Новый расчёт|Главная/.test(r.text);
  return { ok: r.w > r.h && /Расчет потребности дров на 2026 год/.test(r.text) && /ИТОГО/.test(r.text) && !ui, detail: r.w + '×' + r.h + ' pt, стр. ' + r.pages + (ui ? ', есть элементы интерфейса' : '') };
});
await step('P6', 'Экспорт в Word: размер страницы соответствует альбомной ориентации (ширина > высоты)', async () => {
  const { execFileSync } = await import('node:child_process');
  const xml = execFileSync('unzip', ['-p', exportsDone.a1Word, 'word/document.xml']).toString();
  const m = /<w:pgSz w:w="(\d+)" w:h="(\d+)"( w:orient="landscape")?/.exec(xml);
  return { ok: !!m && +m[1] > +m[2] && !!m[3], detail: m ? m[0] : 'нет pgSz' };
});

/* ---------- справочник ---------- */
await step('R1', 'Справочник (F1): открывается, поиск «КПД» находит совпадения, Esc закрывает', async () => {
  await page.keyboard.press('F1');
  await page.waitForSelector('#rw-search');
  await page.fill('#rw-search', 'КПД');
  await page.waitForTimeout(150);
  const n = await page.$$eval('mark.hit', (m) => m.length);
  await page.keyboard.press('Escape');
  const gone = (await page.$('#rw-search')) === null;
  return { ok: n > 5 && gone, detail: 'совпадений ' + n };
});
await step('R2', 'Справочник: экспорт всех таблиц в XLSX', async () => {
  await page.keyboard.press('F1');
  await page.waitForSelector('#rw-search');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-xl="all"]')]);
  const p = path.join(out, dl.suggestedFilename()); await dl.saveAs(p); exportsDone.refAll = p;
  await page.keyboard.press('Escape');
  return { ok: fs.statSync(p).size > 2000, detail: path.basename(p) };
});
await step('R3', 'Справочник: примеры совпадают с движком (пример 1 = 2,536 м³)', async () => {
  const t = await page.evaluate(() => { const s = window.KRPD_REF.build(); return s.find((x) => x.id === 's5').text; });
  return /Результат: M = 1\s?496,241 кг; V = 2,536 м³/.test(t.replace(/ /g, ' '));
});

/* ---------- меню ---------- */
await step('M1', 'Строка меню: каждый доступный пункт каждого меню выполняется без сбоя интерфейса', async () => {
  const menus = await page.$$eval('.menubar .mb-top', (b) => b.length);
  // системные диалоги (файл, печать, выход, буфер обмена, полноэкранный режим) проверяются отдельно
  const skip = /Выход|Полноэкранный|Открыть|Импорт|Загрузить расчёт|Сохранить|Экспорт|Печать…|Вставить|Вырезать|Копировать|Заменить/;
  let ran = 0; const fails = [];
  for (let i = 0; i < menus; i++) {
    const labels = await page.evaluate((i) => { document.querySelectorAll('.menubar .mb-top')[i].click(); const r = [...document.querySelectorAll('.mb-drop > .mb-item')].map((x) => [x.children[1].textContent, x.getAttribute('aria-disabled')]); document.body.click(); return r; }, i);
    for (let j = 0; j < labels.length; j++) {
      const [name, dis] = labels[j];
      if (skip.test(name) || dis === 'true') continue;
      const okClick = await page.evaluate(({ i, j }) => { document.querySelectorAll('.menubar .mb-top')[i].click(); const it = document.querySelectorAll('.mb-drop > .mb-item')[j]; if (!it) return false; it.click(); return true; }, { i, j });
      await page.waitForTimeout(150);
      ran++;
      if (!okClick || await crashBanner(page)) fails.push(name);
      for (let k = 0; k < 3; k++) await page.keyboard.press('Escape');
      if (!(await page.isHidden('#landing'))) { await page.click('#startBtn'); await page.waitForFunction(() => document.getElementById('landing').hidden); }
    }
  }
  const stuck = await page.evaluate(() => !document.getElementById('scrim').hidden || !!document.querySelector('.xov,.pw'));
  // пункты «Вид» переключают панели — возвращаем настройки по умолчанию
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('krpd-firewood.settings') || '{}'); delete s.view; localStorage.setItem('krpd-firewood.settings', JSON.stringify(s)); });
  await page.reload(); await page.waitForFunction(() => window.KRPD && window.KRPD.isReady()); await enter(page);
  return { ok: fails.length === 0 && ran > 15 && !stuck, detail: 'выполнено пунктов: ' + ran + (fails.length ? '; сбой: ' + fails.join(',') : '') + (stuck ? '; осталось открытое окно' : '') };
});

/* ---------- настройки ---------- */
await step('S1', 'Настройки → Параметры расчёта: КПД 0,8 подставляется в новый расчёт', async () => {
  await page.evaluate(() => { location.hash = '#/set/calc'; dispatchEvent(new PopStateEvent('popstate')); });
  const inp = page.locator('#dyn input').first();
  await inp.fill('0,8');
  await page.click('#dyn button:has-text("Сохранить")');
  await page.click('#sideNew');
  const v = await page.inputValue('#f-kpdBp');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('krpd-firewood.settings')); s.calc = {}; localStorage.setItem('krpd-firewood.settings', JSON.stringify(s)); });
  return { ok: v === '0,8', detail: v };
});
await step('S2', 'Настройки → Параметры расчёта: некорректный КПД «abc» не сохраняется', async () => {
  await page.evaluate(() => { location.hash = '#/set/user'; dispatchEvent(new PopStateEvent('popstate')); location.hash = '#/set/calc'; dispatchEvent(new PopStateEvent('popstate')); });
  await page.locator('#dyn input').first().fill('abc');
  await page.click('#dyn button:has-text("Сохранить")');
  const saved = await page.evaluate(() => (JSON.parse(localStorage.getItem('krpd-firewood.settings') || '{}').calc || {}).kpd);
  await page.locator('#dyn input').first().fill('');
  return { ok: saved !== 'abc', detail: 'сохранено: ' + saved };
});
await step('S3', 'Параметры печати: поля 500 мм и 0 копий не сохраняются как есть', async () => {
  await page.evaluate(() => { location.hash = '#/print/params'; dispatchEvent(new PopStateEvent('popstate')); });
  const nums = page.locator('#dyn input[type=number]');
  await nums.nth(0).fill('500'); await nums.nth(4).fill('0');
  await page.click('#dyn button:has-text("Сохранить")');
  const px = await page.evaluate(() => JSON.parse(localStorage.getItem('krpd-firewood.printx') || '{}'));
  await page.click('#dyn button:has-text("Сбросить")');
  return { ok: px.mt <= 60 && px.copies >= 1, detail: 'mt=' + px.mt + ' copies=' + px.copies };
});
await step('S4', 'Тема: «Тёмная» применяется и сохраняется после перезагрузки', async () => {
  await page.click('.side .theme-switch button[data-t="dark"]');
  await page.reload(); await page.waitForFunction(() => window.KRPD && window.KRPD.isReady());
  const t = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await enter(page);
  await page.click('.side .theme-switch button[data-t="system"]');
  return t === 'dark';
});

/* ---------- горячие клавиши поверх модальных окон ---------- */
await step('K1', 'Ctrl+N при открытом редакторе не сбрасывает введённые данные', async () => {
  await page.click('#sideNew');
  await page.fill('#f-title', 'Черновик не терять');
  await page.keyboard.press('Control+n');
  const v = await page.inputValue('#f-title').catch(() => '');
  await page.keyboard.press('Escape');
  return { ok: v === 'Черновик не терять', detail: 'поле: «' + v + '»' };
});
await step('K2', 'F1 при открытом окне печати не открывает справочник под ним', async () => {
  await openPW();
  await page.keyboard.press('F1');
  await page.waitForTimeout(150);
  const st = await page.evaluate(() => { const rw = document.querySelector('.xov'); const pw = document.querySelector('.pw'); if (!rw) return { hidden: false }; const z = (e) => +getComputedStyle(e).zIndex; return { hidden: z(rw) < z(pw) }; });
  for (let k = 0; k < 2; k++) await page.keyboard.press('Escape');
  return { ok: !st.hidden, detail: JSON.stringify(st) };
});
await step('K3', 'Печать раздела справочника не меняет размер/ориентацию последующей печати формы', async () => {
  await page.evaluate(() => { window.print = () => {}; });
  await page.keyboard.press('F1'); await page.waitForSelector('#rw-search');
  await page.click('.rw-bar button:has-text("Печать раздела")');
  const ref = await printPdf('print-ref.pdf');
  await page.evaluate(() => dispatchEvent(new Event('afterprint'))); await page.keyboard.press('Escape');
  await openPW(); await page.selectOption('#pw-form', 'a1'); await page.click('#pw-print');
  const form = await printPdf('print-a1-after-ref.pdf');
  await page.evaluate(() => dispatchEvent(new Event('afterprint'))); await page.keyboard.press('Escape');
  await page.keyboard.press('F1'); await page.waitForSelector('#rw-search');
  await page.click('.rw-bar button:has-text("Печать раздела")');
  const ref2 = await printPdf('print-ref-after-form.pdf');
  await page.evaluate(() => dispatchEvent(new Event('afterprint'))); await page.keyboard.press('Escape');
  return { ok: ref.h > ref.w && form.w > form.h && ref2.h > ref2.w, detail: 'справочник ' + ref.w + '×' + ref.h + ', форма ' + form.w + '×' + form.h + ', снова справочник ' + ref2.w + '×' + ref2.h };
});
await step('L6', 'Возврат на лендинг («Справка → О программе») не вызывает ложный баннер «Сбой интерфейса»', async () => {
  await page.evaluate(() => { const b = document.querySelector('[aria-label="Сбой интерфейса"]'); if (b) b.remove(); });
  await page.evaluate(() => { const t = [...document.querySelectorAll('.menubar .mb-top')].find((b) => b.textContent === 'Справка'); t.click(); [...document.querySelectorAll('.mb-drop .mb-item')].find((x) => x.textContent.includes('О программе')).click(); });
  await page.waitForTimeout(400);
  const crash = await crashBanner(page);
  await page.click('#startBtn'); await page.waitForFunction(() => document.getElementById('landing').hidden);
  return { ok: !crash, detail: crash ? 'баннер показан' : '' };
});

/* ---------- повреждённое хранилище ---------- */
await step('F1', 'Повреждённое хранилище: баннер, данные не перезаписываются без подтверждения', async () => {
  const c2 = await browser.newContext();
  const p2 = await c2.newPage();
  await p2.addInitScript(() => { if (!sessionStorage.getItem('x')) { localStorage.setItem('krpd-firewood.root', '{broken'); sessionStorage.setItem('x', '1'); } });
  await p2.goto(URL0); await p2.waitForFunction(() => window.KRPD && window.KRPD.isReady());
  await p2.click('#startBtn'); await p2.waitForTimeout(800);
  const banner = await p2.evaluate(() => !!document.querySelector('[aria-label="Хранилище не прочитано"]'));
  const n = await p2.evaluate(() => window.KRPD.getItems().length);
  await p2.click('#sideNew');
  const gate = await p2.$eval('#sheetTitle', (n) => n.textContent);
  const raw = await p2.evaluate(() => localStorage.getItem('krpd-firewood.root'));
  await c2.close();
  return { ok: banner && n === 0 && gate === 'Хранилище не прочитано' && raw === '{broken', detail: [banner, n, gate].join('/') };
});
await step('F2', 'localStorage и IndexedDB недоступны: режим «в памяти», баннер предупреждения', async () => {
  const c2 = await browser.newContext();
  const p2 = await c2.newPage();
  const errs = []; p2.on('pageerror', (e) => errs.push(e.message));
  await p2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); Object.defineProperty(window, 'indexedDB', { get() { return undefined; } }); });
  await p2.goto(URL0); await p2.waitForFunction(() => window.KRPD && window.KRPD.isReady(), null, { timeout: 8000 });
  const b = await p2.evaluate(() => !!document.querySelector('[aria-label="Хранилище браузера недоступно"]'));
  await c2.close();
  return { ok: b && errs.length === 0, detail: errs.join(';') };
});

/* ---------- адаптивность ---------- */
for (const [w, hgt] of [[360, 740], [768, 1024], [1280, 800], [1920, 1080]]) {
  await step('V-' + w, 'Ширина ' + w + ' px: нет горизонтальной прокрутки на всех подразделах', async () => {
    const { ctx: c2, page: p2 } = await fresh({ width: w, height: hgt });
    await p2.click('#startBtn'); await p2.waitForTimeout(800);
    const bad = [];
    for (const sec of Object.keys(SUBS)) for (const sub of SUBS[sec]) {
      await p2.evaluate((h) => { location.hash = h; dispatchEvent(new PopStateEvent('popstate')); }, '#/' + sec + '/' + sub);
      const ov = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (ov > 1) bad.push(sec + '/' + sub + '+' + ov);
    }
    await c2.close();
    return { ok: bad.length === 0, detail: bad.join(', ') };
  });
}
await step('V-mob', 'Мобильный (375): нижняя панель вкладок открывает подменю и раздел', async () => {
  const { ctx: c2, page: p2 } = await fresh({ width: 375, height: 812 });
  await p2.click('#startBtn'); await p2.waitForTimeout(800);
  await p2.click('#tabbar button[data-sec="print"]');
  const pop = await p2.isVisible('#tabpop');
  await p2.click('#tabpop .side-item:has-text("Журнал печати")');
  const cr = await p2.$eval('#crumb', (n) => n.innerText);
  await p2.click('#tabbar button[data-sec="calc"]'); await p2.click('#tabpop .side-item:has-text("Новый расчёт")');
  await p2.click('#dyn .xcard:has-text("Палатка М-10")');
  const sheet = await p2.isVisible('#sheet');
  await c2.close();
  return { ok: pop && /Журнал печати/.test(cr) && sheet, detail: [pop, cr.replace(/\s+/g, ' '), sheet].join('/') };
});

await step('Z1', 'Нет ошибок JavaScript за весь прогон основной вкладки', async () => ({ ok: page.errs.length === 0, detail: page.errs.slice(0, 3).join(' | ') }));

fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, exports: exportsDone }, null, 2));
const fail = results.filter((r) => r.status !== 'PASS');
console.log('\nИТОГО: ' + results.length + ' проверок, PASS ' + (results.length - fail.length) + ', FAIL ' + fail.length);
await browser.close();
process.exit(fail.length ? 1 : 0);
