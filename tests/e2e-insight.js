/* Сквозной тест: демонстрационные данные, группы риска, профиль, паспорта, матрица ВПК, статистика,
   импорт .xlsx, корзина, учебный режим, справка, напоминание о копии.  node tests/e2e-insight.js */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ acceptDownloads: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  const st = key => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), key);
  const MAIN = 'pfk-vpk-calculator-v1', DEMO = 'pfk-vpk-calculator-v1-demo';
  await page.goto(url + '#/objects'); await page.fill('#of-name', 'Рабочий Р.Р.'); await page.fill('#of-group', '1'); await page.click('[data-act=obj-add]');

  // учебный режим + демо-данные
  await page.goto(url + '#/data'); await page.click('[data-act=demo-load]'); await page.click('#dlgFoot .primary'); await page.waitForTimeout(400);
  assert(await page.isVisible('#modeBanner'), 'учебный режим: баннер показан');
  const d = await st(DEMO), m = await st(MAIN);
  assert(d.objects.length === 60 && d.objects.every(o => o.demo) && new Set(d.objects.map(o => o.name)).size === 60 && new Set(d.objects.map(o => o.group)).size === 4, 'демо: 60 разных вымышленных курсантов (4 взвода) в учебном хранилище');
  assert(m.objects.length === 1 && m.objects[0].name === 'Рабочий Р.Р.', 'рабочие данные не затронуты');
  const types = t => d.assessments.filter(a => a.type === t && a.status === 'final').length;
  assert(types('practice') === 117 && types('graduate') === 72 && types('g0') === 60 && types('trajectory') === 30 && d.controlRecords.length === 60 * 14, `демо: практика ${types('practice')}, отзывы ${types('graduate')}, g₀ ${types('g0')}, траектории ${types('trajectory')}, журнал ${d.controlRecords.length}`);
  const ab = d.objects.find(o => o.name.startsWith('Абрамов ')), be = d.objects.find(o => o.name.startsWith('Белов '));
  const p4 = id => d.assessments.find(a => a.type === 'practice' && a.meta.course === 4 && a.objectId === id).result.vpk;
  assert(p4(ab.id).meanPsfk.toFixed(3) === '0.289' && p4(be.id).meanPsfk.toFixed(3) === '0.251', 'демо: контрольные примеры источников внутри (0,289 и 0,251)');

  // группы риска
  await page.goto(url + '#/'); await page.waitForTimeout(80);
  assert((await page.textContent('#main')).includes('Группы риска:'), 'главная: предупреждение о группах риска');
  await page.goto(url + '#/risk'); await page.waitForTimeout(80);
  const rk = await page.textContent('#main');
  const weakest = d.assessments.filter(a => a.type === 'practice' && a.meta.course === 4).sort((x, y) => x.result.vpk.meanPsfk - y.result.vpk.meanPsfk)[0];
  assert(rk.includes(d.objects.find(o => o.id === weakest.objectId).name) && /критично|внимание/.test(rk), 'группы риска: слабый курсант выявлен');

  // профиль
  await page.goto(url + '#/object/' + ab.id + '/profile'); await page.waitForTimeout(80);
  const pf = await page.textContent('#main');
  assert((await page.$$('svg.chart polygon')).length >= 6 && pf.includes('Среднее по группе') && pf.includes('целенаправленной работы'), 'профиль: лепестковая диаграмма, среднее по группе, отстающие компетенции');

  assert(pf.includes('Характеристика') && pf.includes('Сильные стороны') && pf.includes('Зоны развития') && pf.includes('Соблюдение законодательства'), 'профиль: автоматическая характеристика, сильные стороны и зоны развития, описание компетенций');

  // паспорта компетенций
  await page.goto(url + '#/passports'); await page.waitForTimeout(60);
  await page.$eval('[data-pp="ВПК-1|4|crit"]', e => { e.closest('details').open = true; }); await page.check('[data-pp="ВПК-1|4|crit"]'); await page.waitForTimeout(60);
  const pp = (await st(DEMO)).settings.passports;
  assert(pp['ВПК-1'] && pp['ВПК-1'][4].includes('crit') && pp['ВПК-11'], 'паспорта: можно задать для любой ВПК, ВПК-11 из источника сохранён');
  await page.click('[data-act=pp-reset]'); await page.waitForTimeout(60);
  const a4 = d.assessments.find(a => a.type === 'practice' && a.meta.course === 4 && a.result.vpk.rows.find(r => r.id === 'ВПК-11').grade <= 2);
  if (a4) { await page.goto(url + '#/a/' + a4.id); await page.waitForTimeout(60); assert((await page.textContent('#main')).includes('Паспорт компетенции'), 'анкета: нарушение паспорта ВПК-11 показано'); }
  else assert(true, 'анкета: нарушений паспорта ВПК-11 в демо нет (проверка пропущена)');

  // матрица
  await page.goto(url + '#/matrix'); await page.waitForTimeout(80);
  const mx = await page.textContent('#main');
  assert(mx.includes('Не формируются') && mx.includes('ВПК-7') && mx.includes('Контроль по компетенциям'), 'матрица: непокрытые ВПК и данные журнала по компетенциям');
  await page.check('[data-mx="0|ВПК-7"]'); await page.waitForTimeout(60);
  assert((await st(DEMO)).curricula[0].disciplines[0].comps.includes('ВПК-7'), 'матрица: отметка сохраняется в учебном плане');

  // статистика
  await page.goto(url + '#/stats'); await page.waitForTimeout(80);
  const sx = await page.textContent('#main');
  assert(sx.includes('r Пирсона') && sx.includes('Не из методики') && (await page.$$('svg.chart circle')).length >= 10, 'статистика: r, ρ, диаграмма рассеяния, пометка');
  await page.selectOption('[data-st=kind]', 'follow'); await page.waitForTimeout(60);
  assert((await page.textContent('#main')).includes('bср в отзыве'), 'статистика: практика ↔ отзыв');

  // импорт .xlsx
  await page.goto(url + '#/import');
  await page.setInputFiles('#imFile', path.join(__dirname, 'fixtures', 'import-practice.xlsx')); await page.waitForTimeout(300);
  const imp = await page.textContent('#main');
  assert(imp.includes('Тестов Т.Т.') && imp.includes('Импортировать 2 строк'), 'импорт .xlsx: 2 строки прочитаны');
  await page.click('[data-act=im-commit]'); await page.click('#dlgFoot .primary'); await page.waitForTimeout(150);
  const s2 = await st(DEMO); const t = s2.objects.find(o => o.name === 'Тестов Т.Т.');
  const ta = s2.assessments.find(a => a.objectId === t.id);
  assert(ta && ta.status === 'final' && ta.result.vpk.meanPsfk.toFixed(3) === '0.251' && ta.meta.date === '2022-05-16', 'импорт .xlsx: дата Excel преобразована, Псфк 0,251');

  // корзина
  await page.goto(url + '#/object/' + t.id + '/edit'); await page.click('[data-act=obj-del]'); await page.click('#dlgFoot .danger'); await page.waitForTimeout(80);
  let s3 = await st(DEMO);
  assert(!s3.objects.some(o => o.id === t.id) && s3.trash.length === 1 && s3.trash[0].payload.assessments.length === 1, 'удаление объекта → корзина (с расчётом)');
  await page.goto(url + '#/trash'); await page.click('[data-act=tr-restore]'); await page.waitForTimeout(80);
  s3 = await st(DEMO);
  assert(s3.objects.some(o => o.id === t.id) && s3.assessments.some(a => a.objectId === t.id) && s3.trash.length === 0, 'восстановление из корзины');

  // справка
  await page.goto(url + '#/matrix'); await page.keyboard.press('F1'); await page.waitForTimeout(60);
  assert((await page.textContent('#dlgTitle')).includes('Дисциплины и ВПК'), 'справка по разделу (F1)');
  await page.click('#dlgFoot .primary');

  // напоминание о копии
  await page.goto(url + '#/'); assert((await page.textContent('#main')).includes('Сделайте резервную копию'), 'напоминание о резервной копии');
  await page.goto(url + '#/data'); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=backup]')]); await dl.path();
  await page.goto(url + '#/'); await page.waitForTimeout(60); assert(!(await page.textContent('#main')).includes('Сделайте резервную копию'), 'после копии напоминание скрыто');

  // удаление демо и возврат
  await page.goto(url + '#/data'); await page.click('[data-act=demo-remove]'); await page.click('#dlgFoot .danger'); await page.waitForTimeout(80);
  const s4 = await st(DEMO); assert(s4.objects.every(o => !o.demo) && s4.objects.length === 2, 'демо-данные удалены одной кнопкой (2 импортированных объекта остались)');
  await page.click('[data-act=mode-main]'); await page.waitForTimeout(80);
  assert(!(await page.isVisible('#modeBanner')), 'возврат к рабочим данным');
  await page.goto(url + '#/objects'); assert((await page.textContent('#main')).includes('Рабочий Р.Р.'), 'рабочие данные на месте');
  assert(errs.length === 0, 'нет ошибок JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
