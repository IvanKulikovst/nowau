// Запуск: node tests/ux.spec.js [папка-для-снимков]
// Удобство работы: уведомления, показатели карточки, быстрый ввод показаний, «Начало работы»
const path = require('path'), fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = pw;
const OUT = process.argv[2] || path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const PAGE_URL = require('url').pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href; const LS = 'spravochnik-tst-fleet-v1';
const res = []; const check = (n, ok, i) => { res.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const net = []; await ctx.route('**/*', r => { const u = r.request().url(); if (/^(file|data|blob):/.test(u)) return r.continue(); net.push(u); r.abort(); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const load = async (h, keepToasts) => { await p.goto(PAGE_URL + h); await p.reload(); await p.waitForTimeout(1500); if (!keepToasts) await p.evaluate(() => document.querySelectorAll('.f-toast-close').forEach(x => x.click())); };
  const db = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), LS);
  const box = sel => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; }, sel);

  // 6. «Начало работы» на первом запуске
  await load('#fleet/command');
  const ob = await p.evaluate(() => { const e = document.getElementById('obPanel'); return e ? { steps: e.querySelectorAll('.ob-step').length, done: e.querySelectorAll('.ob-step.is-done').length, next: e.querySelector('.ob-step.is-next b')?.textContent } : null; });
  check('На первом запуске показана панель «Начало работы» из 4 шагов', ob && ob.steps === 4 && ob.done === 0, ob && JSON.stringify(ob));
  check('Первый шаг — знакомство на демо-данных', ob && /демо/.test(ob.next || ''));
  await p.screenshot({ path: OUT + '/onboarding.png' });

  // 5. Быстрый ввод показаний
  check('В Пункте управления есть кнопка «Внести показания»', await p.evaluate(() => !!document.querySelector('[data-act="cp-hours"]')));
  await p.click('[data-act="cp-hours"]'); await p.waitForSelector('.qh-table');
  const d0 = await db();
  const active = d0.vehicles.filter(v => v.status !== 'Списано');
  const rows = await p.evaluate(() => [...document.querySelectorAll('.qh-row')].map(r => ({ id: r.dataset.vid, cur: Number(r.querySelector('.qh-in').dataset.cur) })));
  check('В таблице вся техника, кроме списанной', rows.length === active.length, rows.length + ' из ' + d0.vehicles.length);
  const hoursBefore = d0.hours.length;
  await p.fill('.qh-in >> nth=0', String(rows[0].cur + 12)); await p.fill('.qh-in >> nth=1', String(rows[1].cur + 7.5).replace('.', ','));
  await p.fill('.qh-in >> nth=2', 'abc'); await p.waitForTimeout(100);
  check('Нечисловое значение подсвечено', await p.evaluate(() => document.querySelectorAll('.qh-in')[2].classList.contains('is-invalid')));
  check('Счётчик заполненных строк', /Заполнено: 3/.test(await p.textContent('#qhCount')));
  await p.click('#qhSave'); await p.waitForTimeout(300);
  check('При ошибке в строке ничего не сохраняется', (await db()).hours.length === hoursBefore && await p.evaluate(() => !!document.querySelector('.qh-table')));
  await p.fill('.qh-in >> nth=2', String(Math.max(0, rows[2].cur - 5) === rows[2].cur ? '' : rows[2].cur - 5)); await p.waitForTimeout(100);
  if (rows[2].cur >= 5) check('Показание меньше текущего не принимается', await p.evaluate(() => document.querySelectorAll('.qh-in')[2].classList.contains('is-invalid')));
  await p.fill('.qh-in >> nth=2', '');
  check('Таблица ввода помещается в окно без горизонтальной прокрутки', await p.evaluate(() => { const t = document.querySelector('.qh-table'); return t.scrollWidth <= t.clientWidth + 1; }));
  await p.screenshot({ path: OUT + '/quick-hours.png' });
  await p.click('#qhSave'); await p.waitForTimeout(600);
  const d1 = await db();
  const v0 = d1.vehicles.find(v => v.id === rows[0].id), v1 = d1.vehicles.find(v => v.id === rows[1].id), v2 = d1.vehicles.find(v => v.id === rows[2].id);
  check('Сохранены ровно две записи моточасов', d1.hours.length === hoursBefore + 2, (d1.hours.length - hoursBefore) + '');
  check('Текущие моточасы пересчитаны (целое и дробное через запятую)', v0.currentHours === rows[0].cur + 12 && v1.currentHours === rows[1].cur + 7.5, v0.currentHours + ' / ' + v1.currentHours);
  check('Незаполненная строка не изменена', v2.currentHours === rows[2].cur);
  check('Запись помечена как групповой ввод', d1.hours.slice(-2).every(h => /Групповой/.test(h.note) && h.source === 'manual'));

  // 1. Уведомления: внизу и не больше двух
  await load('#fleet/vehicle/' + rows[0].id);
  await p.evaluate(() => { const F = document.getElementById('fleetView'); for (let i = 0; i < 5; i++) { const b = document.createElement('button'); b.dataset.act = 'vf'; b.dataset.do = 'doc-del'; b.dataset.did = 'нет'; F.appendChild(b); b.remove(); } });
  await p.evaluate(() => { location.hash = '#fleet/command'; }); await p.waitForTimeout(500);
  for (let i = 0; i < 4; i++) { await p.click('[data-act="cp-hours"]'); await p.waitForSelector('.qh-table'); await p.click('#qhSave'); await p.waitForTimeout(120); await p.click('.f-modal-close'); await p.waitForTimeout(120); }
  await p.waitForTimeout(400);
  const live = await p.evaluate(() => [...document.querySelectorAll('.f-toast')].filter(t => !t.classList.contains('is-out')).length);
  check('Одновременно видно не больше двух уведомлений', live > 0 && live <= 2, live + '');
  const tb = await box('.f-toasts');
  check('Уведомления в нижней части экрана', tb && tb.y > 450, tb && Math.round(tb.y) + ' px от верха');
  await load('#fleet/vehicle/' + rows[0].id, true);
  await p.evaluate(() => { location.hash = '#fleet/command'; }); await p.waitForTimeout(300);
  await p.click('[data-act="cp-hours"]'); await p.waitForSelector('.qh-table'); await p.click('#qhSave'); await p.waitForTimeout(200); await p.click('.f-modal-close');
  await p.evaluate(id => { location.hash = '#fleet/vehicle/' + id; }, rows[0].id); await p.waitForTimeout(700);
  const hit = await p.evaluate(() => { const t = document.querySelector('.f-toast'); const a = document.querySelector('.f-page-actions'); if (!t || !a) return null; const x = t.getBoundingClientRect(), y = a.getBoundingClientRect(); return !(x.right < y.left || x.left > y.right || x.bottom < y.top || x.top > y.bottom); });
  check('Уведомление не перекрывает кнопки карточки', hit === false, String(hit));
  // Уведомление с «Отменить» не вытесняется обычными
  await p.evaluate(() => document.querySelectorAll('.f-toast-close').forEach(x => x.click())); await p.waitForTimeout(300);
  const mid = (await db()).maint.find(m => m.vehicleId === rows[0].id);
  if (mid) {
    await p.evaluate(id => { const F = document.getElementById('fleetView'); const b = document.createElement('button'); b.dataset.act = 'del-maint'; b.dataset.id = id; F.appendChild(b); b.click(); b.remove(); }, mid.id); await p.waitForTimeout(300);
    await p.evaluate(() => { location.hash = '#fleet/command'; }); await p.waitForTimeout(300);
    for (let i = 0; i < 3; i++) { await p.click('[data-act="cp-hours"]'); await p.waitForSelector('.qh-table'); await p.click('#qhSave'); await p.waitForTimeout(120); await p.click('.f-modal-close'); await p.waitForTimeout(120); }
    check('Уведомление с кнопкой «Отменить» остаётся при потоке других', await p.evaluate(() => !![...document.querySelectorAll('.f-toast:not(.is-out) .f-toast-action')].find(x => /Отменить/.test(x.textContent))));
    await p.click('.f-toast-action'); await p.waitForTimeout(300);
    check('Отмена удаления по-прежнему работает', (await db()).maint.some(m => m.id === mid.id));
  }

  // 2. Показатели карточки
  await load('#fleet/vehicle/' + rows[0].id);
  const wide = await p.evaluate(() => { const w = document.querySelector('.f-metric-wide'); const g = document.querySelector('.f-hero-metrics'); if (!w) return null; const a = w.getBoundingClientRect(), c = g.getBoundingClientRect(); const v = w.querySelector('.f-metric-value');
    const others = [...g.children].filter(x => x !== w).map(x => x.getBoundingClientRect());
    return { full: Math.abs(a.width - c.width) < 2, below: others.every(o => o.bottom <= a.top + 1), oneLine: v.getBoundingClientRect().height < 30, text: v.textContent.trim() }; });
  check('«Следующее ТО» занимает отдельную строку во всю ширину блока', wide && wide.full && wide.below, wide && JSON.stringify(wide));
  check('Значение «Следующее ТО» помещается в одну строку', wide && wide.oneLine, wide && wide.text);
  await p.screenshot({ path: OUT + '/vehicle-hero.png' });

  // 3. Кнопки панелей в одной строке с заголовком
  await p.evaluate(() => [...document.querySelectorAll('.f-tab')].find(t => /Фото и документы/.test(t.textContent)).click()); await p.waitForTimeout(300);
  const heads = await p.evaluate(() => [...document.querySelectorAll('.vf-panel .f-panel-head')].map(h => { const t = h.querySelector('.f-panel-title').getBoundingClientRect(), b = h.querySelector('.f-btn').getBoundingClientRect(); return Math.abs((t.top + t.bottom) / 2 - (b.top + b.bottom) / 2) < 8 && b.left > t.right; }));
  check('«Добавить фото» и «Добавить документ» стоят в строке заголовка', heads.length === 2 && heads.every(Boolean), heads.join());
  await p.screenshot({ path: OUT + '/panel-head.png' });

  // 6. Шаги «Начала работы» отмечаются по мере выполнения
  await load('#fleet/command');
  await p.click('#obPanel [data-act="seed-remove"]'); await p.waitForTimeout(500);
  let st = await p.evaluate(() => [...document.querySelectorAll('.ob-step')].map(s => s.classList.contains('is-done')));
  check('После удаления демо-данных первый шаг выполнен', st[0] === true && st[1] === false, st.join());
  await p.click('#obPanel [data-act="add-vehicle"]'); await p.waitForSelector('#vName'); await p.fill('#vName', 'Кухня проверочная'); await p.click('#vSave'); await p.waitForTimeout(700);
  await p.evaluate(() => { location.hash = '#fleet/command'; }); await p.waitForTimeout(500);
  await p.click('#obPanel [data-act="ob-settings"]'); await p.waitForTimeout(500);
  check('Шаг «интервалы» ведёт в настройки', await p.evaluate(() => !!document.getElementById('setHours')));
  await p.evaluate(() => { location.hash = '#fleet/command'; }); await p.waitForTimeout(500);
  st = await p.evaluate(() => [...document.querySelectorAll('.ob-step')].map(s => s.classList.contains('is-done')));
  check('Выполнены три шага из четырёх, остался шаг про копию', st.join() === 'true,true,true,false', st.join());
  const dl = p.waitForEvent('download'); await p.click('#obPanel [data-act="backup-export"]'); await dl; await p.waitForTimeout(700);
  await p.evaluate(() => { location.hash = '#fleet/park'; }); await p.waitForTimeout(300); await p.evaluate(() => { location.hash = '#fleet/command'; }); await p.waitForTimeout(500);
  check('Когда все шаги выполнены, панель исчезает', await p.evaluate(() => !document.getElementById('obPanel')));
  // «Скрыть» запоминается
  await p.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.lastBackupAt = ''; d.settings.onboarding = {}; localStorage.setItem(k, JSON.stringify(d)); }, LS);
  await load('#fleet/command');
  check('Пока копии нет — панель снова видна', await p.evaluate(() => !!document.getElementById('obPanel')));
  await p.click('[data-act="ob-hide"]'); await p.waitForTimeout(300); await load('#fleet/command');
  check('«Скрыть» убирает панель и после перезагрузки', await p.evaluate(() => !document.getElementById('obPanel')));

  // Телефон
  await p.setViewportSize({ width: 390, height: 844 }); await load('#fleet/command');
  await p.click('[data-act="cp-hours"]'); await p.waitForSelector('.qh-table'); await p.waitForTimeout(200);
  check('На телефоне нет горизонтальной прокрутки страницы', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check('На телефоне строка ввода помещается по ширине, название видно', await p.evaluate(() => { const t = document.querySelector('.qh-table'), n = document.querySelector('.qh-name b').getBoundingClientRect(); return t.scrollWidth <= t.clientWidth + 1 && n.left >= 0 && n.width > 40; }));
  await p.screenshot({ path: OUT + '/quick-hours-phone.png' });
  check('Внешних запросов нет', net.length === 0, net.join(','));
  check('Ошибок на странице нет', errs.length === 0, errs.join('; '));
  await b.close();
  const bad = res.filter(x => !x).length; console.log(`\nИтого: ${res.length - bad}/${res.length}`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
