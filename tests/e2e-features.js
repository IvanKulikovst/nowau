/* Сквозной тест дополнительных функций (Playwright + Chromium): node tests/e2e-features.js
   Групповой ввод, импорт CSV, выпуск ↔ войска, сравнение групп, правило расхождений,
   прогноз g по группе, чувствительность, оптимизация плана, бланки, отчёт о практике, дубли. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const assert = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const paste = (page, sel, text) => page.focus(sel).then(() => page.evaluate(t => { const dt = new DataTransfer(); dt.setData('text', t); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); }, text));
const store = page => page.evaluate(() => JSON.parse(localStorage.getItem('pfk-vpk-calculator-v1')));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(url + '#/objects');
  for (const [n, g] of [['Сердюк М.А.', '41'], ['Дорогань И.О.', '41'], ['Петров П.П.', '42'], ['Сидоров С.С.', '42']]) { await page.fill('#of-name', n); await page.fill('#of-group', g); await page.click('[data-act=obj-add]'); }

  // 8. Групповой ввод: практика 4 курса группы 41, вставка из Excel
  await page.goto(url + '#/batch'); await page.selectOption('#bt-group', '41'); await page.waitForTimeout(80);
  await paste(page, '[data-bg="0,0"]', '4\t4\t5\t5\t4\t4\t5\t5\t5\t5\t5\t5\t4\t4\t5\n4\t3\t5\t5\t4\t4\t3\t5\t4\t4\t4\t3\t4\t5\t4');
  await page.waitForTimeout(80);
  assert(JSON.stringify(await page.$$eval('[data-st=p]', t => t.map(x => x.textContent))) === '["0,289","0,251"]', 'групповой ввод: Дорогань 0,289, Сердюк 0,251 (контрольные примеры)');
  await page.reload(); await page.waitForTimeout(80);
  assert((await page.inputValue('[data-bg="1,1"]')) === '3', 'таблица группового ввода сохраняется после перезагрузки');
  await page.click('[data-act=bt-commit][data-final="1"]'); await page.click('#dlgFoot .primary'); await page.waitForTimeout(120);
  let s = await store(page);
  assert(s.assessments.filter(a => a.status === 'final' && a.type === 'practice').length === 2, 'групповой ввод: 2 утверждённые анкеты');

  // 9. Импорт CSV: отзывы группы 41 и практика группы 42
  await page.goto(url + '#/import'); await page.selectOption('#im-type', 'graduate'); await page.waitForTimeout(50);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=im-template]')]);
  const tpl = fs.readFileSync(await dl.path(), 'utf8').trim();
  assert(tpl.includes('ВПК-16') && tpl.includes('ПСК-5'), 'шаблон CSV для отзыва');
  const g16 = n => Array(16).fill(n);
  const csv = '﻿' + tpl + '\r\n' + ['Сердюк М.А.', '41', '1', '01.12.2023', 'майор А', ...g16('3'), '', '', '', '', ''].join(';') + '\r\n' + ['Дорогань И.О.', '41', '1', '2023-12-01', 'майор Б', ...g16('5'), '5', '5', '5', '5', '5'].join(';') + '\r\n' + ['Новиков Н.Н.', '43', '3', '', '', '6'].join(';') + '\r\n';
  const f = path.join(os.tmpdir(), 'pfk-import.csv'); fs.writeFileSync(f, csv);
  await page.setInputFiles('#imFile', f); await page.waitForTimeout(100);
  const prev = await page.textContent('#main');
  assert(prev.includes('курс/год') && prev.includes('ВПК-1: «6»') && prev.includes('Импортировать 2 строк'), 'импорт: ошибки строки выявлены, 2 корректные строки');
  await page.click('[data-act=im-commit]'); await page.click('#dlgFoot .primary'); await page.waitForTimeout(120);
  s = await store(page);
  const grads = s.assessments.filter(a => a.type === 'graduate' && a.status === 'final');
  assert(grads.length === 2 && s.objects.length === 4, 'импорт: 2 утверждённых отзыва, новые объекты не созданы (совпадение по ФИО и группе)');

  // 1. Выпуск ↔ войска
  await page.goto(url + '#/followup'); await page.waitForTimeout(80);
  const fu = await page.textContent('#main');
  assert(fu.includes('Сердюк') && fu.includes('Дорогань'), 'выпуск ↔ войска: обе пары найдены');
  const sId = s.objects.find(o => o.name.startsWith('Сердюк')).id;
  await page.goto(url + '#/followup/' + sId); await page.waitForTimeout(80);
  const fd = await page.textContent('#main');
  assert(fd.includes('13 общих компетенций'), 'выпуск ↔ войска: 13 общих компетенций');
  const kp = await page.$$eval('.kpi .v', t => t.map(x => x.textContent));
  assert(kp[0] === '4,00' && kp[1] === '3,00' && kp[2] === '-1,00', 'Сердюк: практика 4,00 → отзыв 3,00, Δ = −1,00 (' + kp + ')');

  // 2. Сравнение групп
  await page.goto(url + '#/batch'); await page.selectOption('#bt-group', '42'); await page.waitForTimeout(80);
  await paste(page, '[data-bg="0,0"]', Array(13).fill('3').join('\t') + '\t3\t3\n' + Array(13).fill('4').join('\t') + '\t4\t5');
  await page.click('[data-act=bt-commit][data-final="1"]'); await page.click('#dlgFoot .primary'); await page.waitForTimeout(120);
  await page.goto(url + '#/groups'); await page.selectOption('#gc-a', '41'); await page.waitForTimeout(50); await page.selectOption('#gc-b', '42'); await page.waitForTimeout(80);
  const gc = await page.textContent('#main');
  assert(gc.includes('4,31') && gc.includes('3,50'), 'сравнение групп: средний балл 41 — 4,31; 42 — 3,50');

  // 10. Правило расхождений
  await page.goto(url + '#/summary'); await page.selectOption('#sm-group', '42'); await page.waitForTimeout(80);
  await page.check('[data-dr=enabled]'); await page.waitForTimeout(80);
  const dsum = await page.textContent('#main tfoot');
  assert(dsum.includes('1 из 2') && dsum.includes('завышено 1'), 'расхождения: у Сидорова (bср 4 → 4, комиссия 5) завышено на 1: ' + dsum.replace(/\s+/g, ' ').slice(-60));

  // 3. Прогноз g по группе (S5 табл. 6, K1 и K3)
  await page.goto(url + '#/curricula'); await page.click('[data-act=cur-example]'); await page.waitForTimeout(80);
  await page.goto(url + '#/gbatch'); await page.selectOption('#gb-c', { index: 1 }); await page.waitForTimeout(50); await page.selectOption('#gb-g', '41'); await page.waitForTimeout(80);
  await paste(page, '[data-grid=gb][data-rc="0,0"]', '0,713\t0,5\t0,5\t0,4\t0,4\t0,3\t0,4\n0,888\t0,4\t0,4\t0,3\t0,2\t0,5\t0,3');
  await page.click('[data-act=gb-calc]'); await page.waitForTimeout(100);
  const gr = await page.textContent('#gbRes');
  assert(gr.includes('0,734') && gr.includes('0,895'), 'прогноз по группе: 0,734 и 0,895 (S5 табл. 6)');
  await page.click('[data-act=gb-save]'); await page.click('#dlgFoot .primary'); await page.waitForTimeout(100);
  s = await store(page); assert(s.assessments.filter(a => a.type === 'trajectory').length === 2, 'прогноз по группе сохранён как 2 расчёта');

  // 4. Чувствительность
  await page.goto(url + '#/sensitivity'); await page.waitForTimeout(80);
  assert((await page.$$('#main svg.chart')).length === 3, 'чувствительность: 3 графика');
  await page.fill('#sn-m', 'abc'); await page.press('#sn-m', 'Tab'); await page.waitForTimeout(50);
  assert((await page.textContent('#main')).includes('Значения m'), 'чувствительность: ошибка ввода сообщается');

  // 5. Оптимизация учебного плана
  await page.goto(url + '#/optimize'); await page.selectOption('#op-c', { index: 1 }); await page.waitForTimeout(80);
  const sems = [1, 1, 2, 2, 2, 3];
  for (let i = 0; i < 6; i++) { await page.fill(`[data-opd="${i}|semester"]`, String(sems[i])); await page.press(`[data-opd="${i}|semester"]`, 'Tab'); await page.waitForTimeout(30); }
  for (let i = 0; i < 6; i++) for (const k of ['T1min', 'T2min']) { await page.fill(`[data-opd="${i}|${k}"]`, '20'); await page.press(`[data-opd="${i}|${k}"]`, 'Tab'); }
  await page.check('[data-opd="5|final"]');
  for (const [k, v] of [[1, 380], [2, 520], [3, 160]]) { await page.fill(`[data-opl="${k}"]`, String(v)); await page.press(`[data-opl="${k}"]`, 'Tab'); }
  await page.fill('[data-opc=iterations]', '300'); await page.press('[data-opc=iterations]', 'Tab');
  await page.click('[data-act=op-run]'); await page.waitForTimeout(1500);
  assert((await page.textContent('#opRes')).includes('прирост'), 'оптимизация выполнена');
  await page.click('[data-act=op-save]'); await page.waitForTimeout(100);
  assert((await page.inputValue('#cu-name')).includes('оптимальный вариант'), 'создан план из оптимального варианта');
  s = await store(page);
  const opt = s.curricula[1].disciplines; const sum = ks => opt.filter(d => ks.includes(d.semester)).reduce((a, d) => a + d.T1 + d.T2, 0);
  assert(Math.abs(sum([1]) - 380) < 0.5 && Math.abs(sum([3]) - 160) < 0.5, 'оптимальный план укладывается в лимиты семестров');

  // 6. Бланки
  await page.goto(url + '#/blanks'); await page.waitForTimeout(50);
  const bl = await page.textContent('#main');
  assert(bl.includes('СЛУЖЕБНЫЙ ОТЗЫВ') && bl.includes('0,06689') && bl.includes('КОЛОНКА ВЫПУСКНИКА'), 'бланк отзыва с Кзнк и колонкой выпускника');
  await page.selectOption('#bl-k', 'anketa'); await page.waitForTimeout(50); await page.selectOption('#bl-f', 'group'); await page.waitForTimeout(50); await page.selectOption('#bl-g', '41'); await page.waitForTimeout(80);
  assert((await page.$$('#main .blank')).length === 2 && (await page.textContent('#main')).includes('Дорогань И.О.'), 'бланки анкет на группу (2 шт., с ФИО)');

  // 7. Отчёт о практике
  await page.goto(url + '#/preports'); await page.click('[data-act=pr-new]'); await page.waitForTimeout(80);
  await page.selectOption('select[data-pr$="|group"]', '41'); await page.waitForTimeout(80);
  await page.fill('textarea[data-pr$="|items|program"]', 'выполнена полностью'); await page.waitForTimeout(400);
  const pr = await page.textContent('#main');
  assert(pr.includes('средний балл группы 4,31') && pr.includes('Сердюк М.А.'), 'отчёт о практике: характеристика курсантов из анкет');
  s = await store(page); assert(s.practiceReports[0].items.program === 'выполнена полностью', 'отчёт о практике сохраняется');

  // 11. Дубли
  await page.goto(url + '#/objects'); await page.fill('#of-name', 'сердюк  м.а.'); await page.fill('#of-group', '41'); await page.click('[data-act=obj-add]'); await page.waitForTimeout(80);
  assert(await page.isVisible('#dlg[open]'), 'предупреждение: такой курсант уже есть'); await page.click('#dlgFoot .primary'); await page.waitForTimeout(80);
  const dupId = (await store(page)).objects.find(o => o.name === 'сердюк  м.а.').id;
  await page.goto(url + '#/new?obj=' + dupId); await page.check('input[name=nw-type][value=g0]'); await page.click('[data-act=nw-create]'); await page.waitForTimeout(80);
  await page.goto(url + '#/objects'); await page.waitForTimeout(80);
  assert((await page.textContent('#main')).includes('Поиск дублей') && (await page.$$('[data-act=dup-merge]')).length === 1, 'найдена 1 группа дублей');
  await page.click('[data-act=dup-merge]'); await page.click('#dlgFoot .primary'); await page.waitForTimeout(100);
  s = await store(page);
  assert(s.objects.length === 4 && s.assessments.every(a => s.objects.some(o => o.id === a.objectId)), 'дубли объединены, расчёты перенесены');

  if (process.env.SHOTS) for (const [r, n] of [['#/followup/' + sId, 'followup'], ['#/groups', 'groups'], ['#/optimize', 'optimize'], ['#/blanks', 'blanks'], ['#/batch', 'batch']]) {
    await page.goto(url + r); await page.waitForTimeout(150); await page.screenshot({ path: path.join(process.env.SHOTS, n + '.png'), fullPage: n !== 'blanks' });
  }
  assert(errs.length === 0, 'нет ошибок JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
