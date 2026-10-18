// Запуск: node tests/platform.spec.js [папка-для-результатов]
// Нужен Playwright с Chromium (npm i -D playwright && npx playwright install chromium).
const path = require('path');
const fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = pw;
const OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const PAGE_URL = require('url').pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
// Функциональная проверка платформы, сохранности данных и командного пункта
const LS = 'spravochnik-tst-fleet-v1';
const res = [];
const check = (name, ok, info) => { res.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' — ' + info : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const net = [];
  await ctx.route('**/*', r => { const u = r.request().url(); if (/^(file|data|blob):/.test(u)) return r.continue(); net.push(u); r.abort(); });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  const URL0 = PAGE_URL;
  // Настоящий перезапуск программы: смена только #… не перезагружает страницу
  const load = async (hash) => { await p.goto(URL0 + (hash || '#fleet/command')); await p.reload(); await p.waitForTimeout(1500); await p.evaluate(() => document.querySelectorAll('.f-toast-close').forEach(x => x.click())); };
  const db = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), LS);
  const act = (a, id, extra) => p.evaluate(([a, id, extra]) => {
    const btn = document.createElement('button'); btn.dataset.act = a; if (id) btn.dataset.id = id;
    Object.entries(extra || {}).forEach(([k, v]) => { btn.dataset[k] = v; });
    document.getElementById('fleetView').appendChild(btn); btn.click(); btn.remove();
  }, [a, id, extra]);
  const closeModals = () => p.evaluate(() => document.querySelectorAll('.f-modal-backdrop').forEach(x => x.remove()));
  const snaps = () => p.evaluate(() => new Promise(res => {
    const r = indexedDB.open('tst-fleet-snapshots', 1);
    r.onsuccess = () => { const tx = r.result.transaction('snaps', 'readonly'); const q = tx.objectStore('snaps').getAll(); q.onsuccess = () => res(q.result.map(s => ({ id: s.id, reason: s.reason, at: s.at, vehicles: s.counts && s.counts.vehicles }))); };
    r.onerror = () => res([]);
  }));

  // 0. Старая база (структура 1) → миграция, точка восстановления, ничего не потеряно
  await load('#fleet/park');
  const seeded = await db();
  const old = Object.assign({}, seeded, { version: 1 }); delete old.trash; delete old.history; delete old.migrations;
  old.vehicles[0].customField = 'сохранить';
  await p.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [LS, old]);
  await load('#fleet/safety');
  const m1 = await db();
  check('Миграция 1 → 2: версия обновлена, записи и неизвестные поля сохранены',
    m1.version === 2 && m1.vehicles.length === old.vehicles.length && m1.vehicles[0].customField === 'сохранить' && Array.isArray(m1.trash) && m1.migrations.length === 1,
    `версия ${m1.version}, техники ${m1.vehicles.length}`);
  await p.waitForTimeout(500);
  const s0 = await snaps();
  check('Перед миграцией создана точка восстановления со старыми данными', s0.some(s => s.reason === 'migration'), s0.map(s => s.reason).join(', '));
  check('Раздел «Сохранность данных» сообщает об обновлении структуры', await p.evaluate(() => /Структура данных обновлена/.test(document.body.innerText)));

  // 1. Данные новой версии программы не понижаются
  const newer = Object.assign({}, m1, { version: 7, futureCollection: [{ id: 'x_1', a: 1 }] });
  await p.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [LS, newer]);
  await p.goto(URL0 + '#fleet/command'); await p.reload(); await p.waitForTimeout(2200);
  const warned = await p.evaluate(() => [...document.querySelectorAll('.f-toast-title')].some(t => /более новой версии/.test(t.textContent)));
  await act('snap-create'); await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelectorAll('.f-toast-close').forEach(x => x.click()));
  // любое сохранение не должно терять неизвестную коллекцию и номер версии
  await act('edit-vehicle', m1.vehicles[0].id); await p.waitForSelector('#vSave'); await p.click('#vSave'); await p.waitForTimeout(300);
  const n1 = await db();
  check('База новой версии: предупреждение, версия и неизвестные данные сохранены', warned && n1.version === 7 && n1.futureCollection && n1.futureCollection.length === 1, `версия ${n1.version}`);
  await p.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [LS, m1]);
  await load('#fleet/park');

  // 2. Журнал изменений
  const v0 = (await db()).vehicles[0];
  await act('edit-vehicle', v0.id); await p.waitForSelector('#vInv');
  await p.fill('#vInv', 'ИН-ЖУРНАЛ-1'); await p.click('#vSave'); await p.waitForTimeout(300);
  const h1 = await db();
  const he = h1.history.find(e => e.vehicleId === v0.id && e.field === 'invNumber');
  check('Журнал: изменение инвентарного номера записано (было → стало)', he && he.from === (v0.invNumber || '') && he.to === 'ИН-ЖУРНАЛ-1', he ? `${he.from} → ${he.to}` : 'нет записи');
  await p.evaluate(id => location.hash = '#fleet/vehicle/' + id, v0.id); await p.waitForTimeout(500);
  check('Журнал виден в карточке техники', await p.evaluate(() => /Журнал изменений карточки[\s\S]*ИН-ЖУРНАЛ-1/i.test(document.getElementById('fleetView').innerText)));

  // 3. Корзина: удаление техники и возврат со всеми записями
  const before = await db();
  const victim = before.vehicles.find(v => before.maint.some(m => m.vehicleId === v.id)) || before.vehicles[0];
  const cnt = d => ({ m: d.maint.filter(x => x.vehicleId === victim.id).length, h: d.hours.filter(x => x.vehicleId === victim.id).length, t: d.trips.filter(x => x.vehicleId === victim.id).length });
  const c0 = cnt(before);
  await act('del-vehicle', victim.id); await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelectorAll('.f-toast-close').forEach(x => x.click()));
  const afterDel = await db();
  check('Удалённая техника попала в корзину вместе с журналом ТО, моточасами и путевыми листами',
    !afterDel.vehicles.some(v => v.id === victim.id) && afterDel.trash.length === 1 && afterDel.trash[0].records.vehicles[0].id === victim.id,
    `ТО ${c0.m}, моточасов ${c0.h}, путевых ${c0.t}`);
  await p.waitForTimeout(8500);   // срок отмены истёк — запись должна остаться в корзине
  await load('#fleet/safety');
  check('После истечения срока отмены и перезапуска запись в корзине', (await db()).trash.length === 1);
  await act('trash-restore', afterDel.trash[0].id); await p.waitForTimeout(400);
  const back = await db();
  const c1 = cnt(back);
  check('Возврат из корзины: техника и все связанные записи на месте', back.vehicles.some(v => v.id === victim.id) && c1.m === c0.m && c1.h === c0.h && c1.t === c0.t && back.trash.length === 0, JSON.stringify(c1));
  check('ID техники после возврата не изменился (QR-наклейка действительна)', back.vehicles.some(v => v.id === victim.id && v.qr === victim.qr || v.id === victim.id));

  // 4. Удаление с отменой не оставляет мусора в корзине
  await act('del-vehicle', victim.id); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('.f-toast-action')?.click()); await p.waitForTimeout(300);
  const undone = await db();
  check('«Отменить» в уведомлении возвращает запись и убирает её из корзины', undone.vehicles.some(v => v.id === victim.id) && undone.trash.length === 0);

  // 5. Проверка перед импортом: копия с ошибками → отчёт → «Исправить и загрузить»
  const broken = JSON.parse(JSON.stringify(undone));
  broken.trips.push({ id: 't_orphan_00001', vehicleId: 'v_net_takoy_tehniki', date: '2026-01-01', startHours: 1, endHours: 2 });
  broken.maint.push(Object.assign({}, broken.maint[0]));            // повтор идентификатора
  broken.vehicles.push({ id: 'v_bad id!', name: '' });               // неверный id и пустое имя
  fs.writeFileSync(OUT + '/broken.json', JSON.stringify(broken));
  await load('#fleet/safety');
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), act('backup-import')]);
  await chooser.setFiles(OUT + '/broken.json'); await p.waitForTimeout(600);
  const review = await p.evaluate(() => { const m = document.querySelector('.f-modal-backdrop .f-modal'); return m ? m.innerText : ''; });
  check('Перед импортом показан отчёт проверки с ошибками целостности', /Проверка резервной копии/.test(review) && /Ошибки целостности: \d+/.test(review) && /Исправить и загрузить/.test(review), (review.match(/Ошибки целостности: \d+/) || [''])[0]);
  await p.screenshot({ path: OUT + '/review.png' });
  await p.evaluate(() => document.querySelector('[data-dec="repair"]').click()); await p.waitForTimeout(800);
  const fixed = await db();
  const integ = await p.evaluate(() => TST.platform.checkIntegrity(JSON.parse(localStorage.getItem('spravochnik-tst-fleet-v1'))));
  check('После «Исправить и загрузить» ошибок целостности нет', integ.errors.length === 0 && !fixed.trips.some(t => t.id === 't_orphan_00001'), `ошибок ${integ.errors.length}, замечаний ${integ.warnings.length}`);
  const s1 = await snaps();
  check('Перед восстановлением создана точка «Перед восстановлением из копии»', s1.some(s => s.reason === 'import'));

  // 6. Откат к точке восстановления возвращает состояние до импорта
  const imp = s1.filter(s => s.reason === 'import').sort((a, b) => b.at.localeCompare(a.at))[0];
  await load('#fleet/safety');
  await act('snap-restore', imp.id); await p.waitForTimeout(700);
  await p.evaluate(() => document.querySelector('[data-dec="restore"]').click()); await p.waitForTimeout(900);
  const rolled = await db();
  check('Откат к точке «Перед восстановлением из копии» вернул прежние данные', rolled.vehicles.length === undone.vehicles.length && !rolled.vehicles.some(v => v.id === 'v_bad id!'), `техники ${rolled.vehicles.length}`);
  check('Перед откатом создана точка «Перед откатом»', (await snaps()).some(s => s.reason === 'rollback'));

  // 7. Очистка всех данных — с точкой восстановления
  await act('wipe'); await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('[data-yes]').click()); await p.waitForTimeout(800);
  const wiped = await db();
  const sw = (await snaps()).filter(s => s.reason === 'wipe');
  check('После очистки данных есть точка «Перед очисткой» с прежним количеством техники', wiped.vehicles.length === 0 && sw.length === 1 && sw[0].vehicles === rolled.vehicles.length, `в точке ${sw[0] && sw[0].vehicles}`);
  await load('#fleet/safety');
  await act('snap-restore', sw[0].id); await p.waitForTimeout(700);
  await p.evaluate(() => document.querySelector('[data-dec="restore"]').click()); await p.waitForTimeout(900);
  check('Данные возвращены из точки «Перед очисткой»', (await db()).vehicles.length === rolled.vehicles.length);

  // 8. Самотесты не меняют реальные данные
  await load('#fleet/safety');
  const raw0 = await p.evaluate(k => localStorage.getItem(k), LS);
  await act('tests-run'); await p.waitForTimeout(1200);
  const raw1 = await p.evaluate(k => localStorage.getItem(k), LS);
  const tr = await p.evaluate(() => document.querySelector('.sf-tests-sum')?.textContent || '');
  check('Самотесты модулей пройдены и не изменили базу', /16 из 16/.test(tr) && raw0 === raw1, tr);

  // 9. Командный пункт: числа совпадают с перечнями, перечень → карточка, задание печатается
  await load('#fleet/command');
  const tiles = await p.evaluate(() => [...document.querySelectorAll('[data-act="cp-list"].cp-tile')].map(b => [b.dataset.list, Number(b.querySelector('.f-stat-value').textContent)]));
  let allOk = true; const info = [];
  for (const [key, n] of tiles) {
    await act('cp-list', null, { list: key }); await p.waitForTimeout(150);
    const rows = await p.evaluate(() => document.querySelectorAll('.f-modal-backdrop [data-cp-open]').length);
    if (rows !== n) { allOk = false; info.push(`${key}: ${n}≠${rows}`); }
    await closeModals();
  }
  check('Каждое число командного пункта открывает перечень ровно из этих машин', allOk && tiles.length >= 10, info.join('; ') || `${tiles.length} показателей`);
  const units = await p.evaluate(() => [...document.querySelectorAll('.cp-table [data-act="cp-list"]')].map(b => [b.dataset.list, Number(b.textContent)]));
  let uOk = true;
  for (const [key, n] of units) { await act('cp-list', null, { list: key }); await p.waitForTimeout(100); const rows = await p.evaluate(() => document.querySelectorAll('.f-modal-backdrop [data-cp-open]').length); if (rows !== n) uOk = false; await closeModals(); }
  check('Числа таблицы подразделений совпадают с перечнями', uOk && units.length > 0, units.length + ' чисел');
  await act('cp-list', null, { list: 'total' }); await p.waitForTimeout(200);
  const firstId = await p.evaluate(() => document.querySelector('[data-cp-open]').dataset.cpOpen);
  await p.evaluate(() => document.querySelector('[data-cp-open]').click()); await p.waitForTimeout(400);
  check('Из перечня открывается карточка выбранной машины', (await p.evaluate(() => location.hash)) === '#fleet/vehicle/' + firstId);
  await load('#fleet/command');
  await act('cp-task', null, { list: 'overdue' }); await p.waitForTimeout(700);
  const pw = await p.evaluate(() => { const t = document.querySelector('.tpaper, .pw-page, #pwStage'); return t ? t.innerText.slice(0, 200) : document.body.innerText.includes('ЗАДАНИЕ'); });
  check('«Сформировать задание» открывает печатную форму «Задание»', /ЗАДАНИЕ/.test(String(pw)) || pw === true);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);

  // 10. Статус «Неисправна» влияет на КТГ
  const d10 = await db();
  const vv = d10.vehicles.find(v => v.status === 'В эксплуатации');
  await act('edit-vehicle', vv.id); await p.waitForSelector('#vStatus');
  await p.selectOption('#vStatus', 'Неисправна'); await p.click('#vSave'); await p.waitForTimeout(300);
  await load('#fleet/command');
  const faulty = await p.evaluate(() => Number(document.querySelector('[data-list="faulty"] .f-stat-value').textContent));
  const ktg = await p.evaluate(() => document.querySelector('.cp-ktg .f-stat-value').textContent);
  const S = await p.evaluate(() => TST.fleet.commandSummary());
  check('Статус «Неисправна» учитывается в счётчике и КТГ', faulty >= 1 && Math.abs(S.ktg - (S.total - S.faulty - S.repair) / S.total) < 1e-9, `неисправна ${faulty}, КТГ ${ktg}`);

  check('Без сетевых запросов и ошибок JavaScript', net.length === 0 && errs.length === 0, `запросов ${net.length}, ошибок ${errs.length}${errs[0] ? ': ' + errs[0] : ''}`);
  console.log(`ИТОГ: ${res.filter(Boolean).length} из ${res.length}`);
  await b.close();
})();
