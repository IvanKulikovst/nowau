// Запуск: node tests/season.spec.js [папка-для-снимков]
const path = require('path'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = pw;
const OUT = process.argv[2] || path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const PAGE_URL = require('url').pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href; const LS = 'spravochnik-tst-fleet-v1';
const res = []; const check = (n, ok, i) => { res.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const net = []; await ctx.route('**/*', r => { const u = r.request().url(); if (/^(file|data|blob):/.test(u)) return r.continue(); net.push(u); r.abort(); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.print = () => {}; });
  const URL0 = PAGE_URL;
  const load = async h => { await p.goto(URL0 + h); await p.reload(); await p.waitForTimeout(1500); await p.evaluate(() => document.querySelectorAll('.f-toast-close').forEach(x => x.click())); };
  const db = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), LS);
  const act = (a, id, ex) => p.evaluate(([a, id, ex]) => { const b = document.createElement('button'); b.dataset.act = a; if (id) b.dataset.id = id; Object.entries(ex || {}).forEach(([k, v]) => { b.dataset[k] = v; }); document.getElementById('fleetView').appendChild(b); b.click(); b.remove(); }, [a, id, ex]);
  await load('#fleet/park');
  const d0 = await db();
  const v = d0.vehicles.find(x => x.catalogId && /КА-220/.test(x.name)) || d0.vehicles.find(x => x.catalogId);
  check('Есть техника, привязанная к справочнику', !!v, v && v.name);

  // 1. Шаблон работ в форме ТО
  await act('add-maint', v.id); await p.waitForSelector('#mKind'); await p.waitForTimeout(300);
  await p.selectOption('#mKind', 'ТО-1'); await p.waitForTimeout(200);
  const rows = await p.evaluate(() => document.querySelectorAll('#mCheck [data-mc]').length);
  check('Перечень операций регламента показан с галочками', rows > 0, rows + ' операций');
  const hidden0 = await p.evaluate(() => document.getElementById('mCheck').hidden);
  check('Блок виден, пока есть регламент', !hidden0);
  await p.click('#mCheck [data-mc="0"]'); await p.click('#mCheck [data-mc="1"]');
  const cnt = await p.evaluate(() => document.getElementById('mcCount').textContent);
  check('Счётчик выполненных работ', /выполнено 2 из \d+/.test(cnt), cnt);
  await p.click('[data-mc-all]');
  check('«Отметить все» отмечает всё', await p.evaluate(() => [...document.querySelectorAll('#mCheck [data-mc]')].every(x => x.checked)));
  await p.click('[data-mc-none]'); await p.click('#mCheck [data-mc="0"]'); await p.click('#mCheck [data-mc="2"]');
  await p.screenshot({ path: OUT + '/form.png' });
  await p.selectOption('#mKind', 'ТО-2'); await p.waitForTimeout(200);
  const after2 = await p.evaluate(() => document.getElementById('mcCount').textContent);
  check('При смене вида ТО перечень сменяется, отметки не переносятся', /выполнено 0 из/.test(after2), after2);
  await p.selectOption('#mKind', 'ТО-1'); await p.waitForTimeout(200);
  const back = await p.evaluate(() => document.getElementById('mcCount').textContent);
  check('Возврат к ТО-1 вернул прежние отметки', /выполнено 2 из 7/.test(back), back);
  await p.click('#mSave'); await p.waitForTimeout(500);
  const d1 = await db();
  const rec = d1.maint.filter(m => m.vehicleId === v.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
  check('Запись ТО хранит снимок перечня с отметками', rec.checklist && rec.checklist.kind === 'ТО-1' && rec.checklist.items.filter(x => x.done).length === 2, rec.checklist && rec.checklist.items.length + ' операций');
  check('Пустое «Выполненные работы» заполнено отмеченными операциями', rec.works && rec.works.split('\n').length === 2, rec.works.slice(0, 60));
  await load('#fleet/vehicle/' + v.id);
  await p.evaluate(() => [...document.querySelectorAll('.f-tab')].find(t => /ТО/.test(t.textContent) && !/Моточасы/.test(t.textContent))?.click()); await p.waitForTimeout(400);
  const badge = await p.evaluate(() => document.querySelector('.mc-badge')?.textContent || '');
  check('В журнале ТО видно «По регламенту: 2 из N»', /По регламенту: 2 из \d+/.test(badge), badge);
  // повторное открытие записи: отметки сохранились
  await act('edit-maint', rec.id); await p.waitForSelector('#mKind'); await p.waitForTimeout(300);
  const reopened = await p.evaluate(() => document.getElementById('mcCount').textContent);
  check('При редактировании записи отметки восстановлены', /выполнено 2 из/.test(reopened), reopened);
  await p.evaluate(() => document.querySelectorAll('.f-modal-backdrop').forEach(x => x.remove()));

  // 2. Сезонное обслуживание: настройки → напоминание
  await load('#fleet/settings');
  const winter = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 10); return [d.getDate(), d.getMonth() + 1]; });
  await p.fill('#setWinDay', String(winter[0])); await p.selectOption('#setWinMonth', String(winter[1])); await p.dispatchEvent('#setWinMonth', 'change'); await p.waitForTimeout(300);
  await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 180); document.getElementById('setSumDay').value = d.getDate(); document.getElementById('setSumMonth').value = d.getMonth() + 1; document.getElementById('setSumMonth').dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/settings.png', fullPage: true });
  const s1 = (await db()).settings.seasons;
  check('Даты сезонов сохраняются в настройках', s1 && /^\d\d-\d\d$/.test(s1.winter) && /^\d\d-\d\d$/.test(s1.summer), JSON.stringify(s1));
  await p.fill('#setWinDay', '31'); await p.selectOption('#setWinMonth', '2'); await p.dispatchEvent('#setWinMonth', 'change'); await p.waitForTimeout(300);
  check('Некорректная дата (31 февраля) не сохраняется', (await db()).settings.seasons.winter === s1.winter);
  await load('#fleet/command');
  const tile = await p.evaluate(() => { const t = document.querySelector('[data-list="season"]'); return t ? t.innerText.replace(/\n+/g, ' | ') : null; });
  check('В «Пункте управления» есть плитка сезонного ТО', !!tile && /Сезонное ТО/i.test(tile), tile);
  const total = await p.evaluate(() => TST.fleet.helpData ? 0 : 0);
  const bell = await p.evaluate(() => { document.getElementById('fleetBell').click(); return document.getElementById('fleetNotifPanel').innerText; });
  check('В колоколе есть напоминание о переводе на зимний режим', /Перевод на зимний режим/.test(bell), (bell.match(/Перевод на зимний[^\n]*/) || [''])[0]);
  await p.evaluate(() => document.getElementById('fleetBell').click());
  await act('season'); await p.waitForTimeout(400);
  const listN = await p.evaluate(() => document.querySelectorAll('.f-modal-backdrop [data-cp-open]').length);
  const tileN = Number(await p.evaluate(() => document.querySelector('[data-list="season"] .f-stat-value').textContent));
  check('Перечень по плитке совпадает со счётчиком', listN === tileN && tileN > 0, tileN + ' машин');
  await p.screenshot({ path: OUT + '/season-list.png' });
  await p.evaluate(() => document.querySelector('[data-cp-task]').click()); await p.waitForTimeout(800);
  const doc = await p.evaluate(() => document.body.innerText);
  check('Задание на сезонное обслуживание формируется', /сезонного обслуживания/.test(doc) && /зимний режим/.test(doc));
  await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelectorAll('.f-modal-backdrop').forEach(x => x.remove()));

  // 3. СО с отметкой сезона снимает машину из перечня
  await load('#fleet/command');
  await act('add-maint', v.id); await p.waitForSelector('#mKind');
  await p.selectOption('#mKind', 'Сезонное обслуживание (СО)'); await p.waitForTimeout(200);
  check('Для СО появляется выбор сезона, по умолчанию — ближайший (зимний)', await p.evaluate(() => !document.getElementById('mSeasonBox').hidden && document.getElementById('mSeason').value === 'winter'));
  await p.screenshot({ path: OUT + '/form-so.png' });
  await p.click('#mSave'); await p.waitForTimeout(500);
  await load('#fleet/command');
  const tile2 = Number(await p.evaluate(() => document.querySelector('[data-list="season"] .f-stat-value').textContent));
  check('После СО с отметкой сезона плитка уменьшилась на 1', tile2 === tileN - 1, tileN + ' → ' + tile2);
  await p.screenshot({ path: OUT + '/command.png', fullPage: false });

  check('Без сетевых запросов и ошибок JavaScript', net.length === 0 && errs.length === 0, `запросов ${net.length}, ошибок ${errs.length}${errs[0] ? ': ' + errs[0] : ''}`);
  console.log(`ИТОГ: ${res.filter(Boolean).length} из ${res.length}`);
  await b.close();
})();
