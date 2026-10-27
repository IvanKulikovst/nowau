/* Сквозной функциональный тест (Playwright + Chromium): node tests/e2e-flow.js
   Использует чистый профиль браузера; проверяет ввод, расчёт, утверждение, перезагрузку,
   редакции, отчёт, сводную, резервное копирование, импорт, CSV, траекторию g и узкий экран. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const url = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
  await page.goto(url + '#/objects');
  // validation: empty name
  await page.click('[data-act=obj-add]');
  assert(await page.$('#of-name.invalid'), 'пустое ФИО отклоняется');
  for (const [n, g] of [['Савченко А.А.', '41 взвод'], ['Гончаренко Б.Б.', '41 взвод'], ['Иванов И.И.', 'выпуск 2023']]) {
    await page.fill('#of-name', n); await page.fill('#of-group', g); await page.click('[data-act=obj-add]'); await page.waitForTimeout(30);
  }
  assert((await page.$$('#objTable tbody tr')).length === 3, '3 объекта созданы');
  async function practice(name, grades, course, leader) {
    await page.goto(url + '#/new');
    await page.selectOption('#nw-obj', { label: name + ' — 41 взвод' });
    await page.check('input[name=nw-type][value=practice]');
    await page.click('[data-act=nw-create]'); await page.waitForTimeout(50);
    await page.selectOption('select[data-bind="meta|course"]', String(course));
    await page.fill('input[data-bind="meta|evaluator"]', 'капитан Иванов А.А.');
    await page.click('text=Далее →');
    const ids = ['ВПК-1','ВПК-2','ВПК-3','ВПК-4','ВПК-5','ВПК-6','ВПК-7','ВПК-8','ВПК-9','ВПК-10','ВПК-11','ВПК-12','ВПК-16'];
    // review before fill: finalize must be blocked
    for (let i = 0; i < ids.length; i++) await page.click(`input[name="gr-input|vpk|${ids[i]}"][value="${grades[i]}"] + span`);
    const prog = await page.textContent('#prog'); 
    await page.click('text=Далее →');
    await page.selectOption('select[data-bind="input|leaderMark"]', String(leader));
    await page.click('text=Далее →');
    const rev = await page.textContent('.card');
    await page.click('[data-act=finalize]'); await page.click('#dlgFoot .primary'); await page.waitForTimeout(80);
    return { prog, rev, body: await page.textContent('#main') };
  }
  // incomplete check
  await page.goto(url + '#/new');
  await page.selectOption('#nw-obj', { index: 1 }); await page.check('input[name=nw-type][value=practice]'); await page.click('[data-act=nw-create]'); await page.waitForTimeout(50);
  const draftUrl = page.url();
  await page.goto(draftUrl.replace(/edit\/1$/, 'edit/4'));
  assert((await page.textContent('.card')).includes('не может быть утверждён'), 'неполная анкета: утверждение заблокировано');
  await page.click('[data-act=finalize]'); await page.waitForTimeout(50);
  assert(page.url().includes('/edit/4'), 'после попытки утверждения остаёмся в черновике');
  await page.click('[data-act=del-a]'); await page.click('#dlgFoot .danger'); await page.waitForTimeout(50);

  const r1 = await practice('Савченко А.А.', [4,3,5,5,4,4,3,5,4,4,4,3,4], 4, 4);
  assert(r1.prog.includes('13 из 13'), 'прогресс 13 из 13');
  assert(r1.body.includes('0,251') && r1.body.includes('4,00') && r1.body.includes('80,00%'), 'Савченко: 0,251 / 4,00 / 80% (контрольный пример)');
  assert(r1.body.includes('«средний»'), 'уровень по bср = 4,0 — «средний»');
  const r2 = await practice('Гончаренко Б.Б.', [4,4,5,5,4,4,5,5,5,5,5,5,4], 4, 4);
  assert(r2.body.includes('0,289') && r2.body.includes('4,62') && r2.body.includes('92,31%'), 'Гончаренко: 0,289 / 4,62 / 92,31%');
  const r3 = await practice('Савченко А.А.', [5,5,5,5,5,5,5,5,5,5,5,5,5], 5, 5);
  assert(r3.body.includes('0,313'), 'все 5: 0,313');

  // reload persistence
  await page.reload(); await page.goto(url + '#/history');
  const rows = await page.$$('#main tbody tr');
  assert(rows.length === 3, 'после перезагрузки 3 утверждённых расчёта (' + rows.length + ')');

  // verify reproducibility
  await rows[0].click(); await page.waitForTimeout(50);
  await page.click('[data-act=verify]'); await page.waitForTimeout(50);
  assert((await page.textContent('#toasts')).includes('идентичный'), 'воспроизводимость подтверждена');

  // graduate with all 5 and PSK
  await page.goto(url + '#/new');
  await page.selectOption('#nw-obj', { label: 'Иванов И.И. — выпуск 2023' }); await page.check('input[name=nw-type][value=graduate]');
  await page.click('[data-act=nw-create]'); await page.waitForTimeout(50);
  await page.fill('input[data-bind="meta|header|organ"]', 'Центральный округ');
  await page.fill('input[data-bind="meta|header|gradYear"]', '2023');
  await page.fill('input[data-bind="meta|header|rank"]', 'лейтенант');
  await page.fill('input[data-bind="meta|signers|commander"]', 'полковник Петров');
  await page.waitForTimeout(400);
  await page.click('text=Далее →');
  await page.waitForSelector('#prog');
  const radios = await page.$$('input[type=radio][value="5"]');
  for (const r of radios) await (await r.evaluateHandle(e => e.nextElementSibling)).click();
  assert((await page.textContent('#prog')).includes('21 из 21'), 'отзыв: 21 из 21');
  await page.click('text=Далее →'); await page.waitForTimeout(50);
  await page.selectOption('select[data-bind="input|graduateColumn|q3"]', 'Скорее да, чем нет');
  await page.fill('textarea[data-bind="input|graduateColumn|q2"]', 'тактика');
  await page.waitForTimeout(400);
  await page.click('text=Далее →');
  await page.click('[data-act=finalize]'); await page.waitForTimeout(50);
  assert((await page.textContent('#dlgBody')).includes('Не заполнено'), 'предупреждение о незаполненных разделах II–V');
  await page.click('#dlgFoot .primary'); await page.waitForTimeout(80);
  const g = await page.textContent('#main');
  assert(g.includes('0,313') && g.includes('0,321') && g.includes('0,315'), 'отзыв все 5: ВПК 0,313, ПСК 0,321, итог 0,315');
  assert(g.includes('Центральный округ') && g.includes('полковник Петров') && g.includes('Скорее да, чем нет') && g.includes('тактика'), 'шапка, подписи и колонка выпускника в результате');
  // revision
  await page.click('[data-act=reopen]'); await page.click('#dlgFoot .primary'); await page.waitForTimeout(50);
  await page.click('text=Далее →');
  await page.click(`input[name="gr-input|vpk|ВПК-1"][value="3"] + span`);
  await page.goto(page.url().replace(/edit\/\d$/, 'edit/4'));
  await page.click('[data-act=finalize]'); await page.click('#dlgFoot .primary'); await page.waitForTimeout(80);
  const g2 = await page.textContent('#main');
  assert(g2.includes('Предыдущие редакции (1)'), 'сохранена предыдущая редакция');

  // report
  await page.click('text=Отчёт для печати'); await page.waitForTimeout(50);
  const rep = await page.textContent('#main');
  assert(rep.includes('Применённые формулы') && rep.includes('Основания расчёта'), 'отчёт содержит формулы и основания расчёта');

  // summary
  await page.goto(url + '#/summary'); await page.selectOption('#sm-sub', '4'); await page.waitForTimeout(50);
  const sm = await page.textContent('#main');
  assert(sm.includes('0,289') && sm.includes('0,251'), 'сводная по 4 курсу');
  const places = await page.$$eval('#main tbody tr td:nth-child(8)', tds => tds.map(t => t.textContent));
  assert(JSON.stringify(places) === '["1","2"]', 'места: ' + places);

  // backup / import
  await page.goto(url + '#/data');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=backup]')]);
  const p = await dl.path(); const fs = require('fs'); const txt = fs.readFileSync(p, 'utf8');
  assert(JSON.parse(txt).data.assessments.length === 4, 'резервная копия содержит 4 расчёта');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=csv-all]')]);
  const csv = fs.readFileSync(await dl2.path(), 'utf8');
  assert(csv.includes('0,2542') && csv.includes(';'), 'CSV с десятичной запятой');
  // wipe and restore
  await page.click('[data-act=wipe]'); await page.click('#dlgFoot .danger'); await page.waitForTimeout(50);
  await page.goto(url + '#/history'); assert((await page.textContent('#main')).includes('Найдено: 0'), 'данные удалены');
  await page.goto(url + '#/data');
  await page.setInputFiles('#importFile', p); await page.waitForTimeout(100);
  await page.click('#dlgFoot .danger'); await page.waitForTimeout(80);
  await page.goto(url + '#/history'); assert((await page.textContent('#main')).includes('Найдено: 4'), 'восстановлено 4 расчёта');
  // bad import
  fs.writeFileSync(require('path').join(require('os').tmpdir(), 'pfk-bad.json'), '{"x":1}');
  await page.goto(url + '#/data'); await page.setInputFiles('#importFile', require('path').join(require('os').tmpdir(), 'pfk-bad.json')); await page.waitForTimeout(80);
  assert((await page.textContent('#toasts')).includes('Импорт невозможен'), 'некорректный файл отклонён');

  // g trajectory with example curriculum
  await page.goto(url + '#/curricula'); await page.click('[data-act=cur-example]'); await page.waitForTimeout(50);
  await page.goto(url + '#/new'); await page.selectOption('#nw-obj', { index: 1 }); await page.check('input[name=nw-type][value=trajectory]'); await page.click('[data-act=nw-create]'); await page.waitForTimeout(50);
  await page.selectOption('select[data-bind="input|curriculumId"]', { index: 1 }); await page.waitForTimeout(50);
  await page.click('text=Далее →');
  await page.fill('input[data-bind="input|g0"]', '0,713');
  const cs = [0.5,0.5,0.4,0.4,0.3,0.4]; const cells = await page.$$('input[data-bind^="input|abilities"]');
  for (let i = 0; i < 6; i++) await cells[i].fill(String(cs[i]).replace('.', ','));
  await page.click('text=Далее →'); await page.waitForTimeout(50);
  await page.click('[data-act=finalize]'); await page.click('#dlgFoot .primary'); await page.waitForTimeout(80);
  const tr = await page.textContent('#main');
  assert(tr.includes('0,7339') || tr.includes('0,7340'), 'траектория K1: g6 ≈ 0,734');

  // анализ отзывов (S1 Прил. 2)
  await page.goto(url + '#/reviews'); await page.waitForTimeout(80);
  let rv = await page.textContent('#main');
  assert(rv.includes('Центральный округ'), 'анализ отзывов: строка органа управления');
  const rvCells = await page.$$eval('#main tbody tr td', t => t.map(x => x.textContent.trim()));
  assert(rvCells[3] === '1' && rvCells[4] === '1', 'анализ отзывов: 1 отзыв, оценён на 5 (итог 0,307 — «высокий») — ' + rvCells.slice(3, 8));
  await page.fill('input[data-sent]', '12'); await page.press('input[data-sent]', 'Tab'); await page.waitForTimeout(80);
  assert((await page.textContent('#main tfoot')).includes('12'), 'анализ отзывов: введено число направленных');
  // сводная для выпускников с ПСК и итогом
  await page.goto(url + '#/summary'); await page.selectOption('#sm-type', 'graduate'); await page.waitForTimeout(80);
  assert((await page.textContent('#main thead')).includes('Итоговый уровень'), 'сводная по отзывам: столбцы ПСК и итог');
  // отчёт по объекту
  const objId = await page.evaluate(() => JSON.parse(localStorage.getItem('pfk-vpk-calculator-v1')).objects.find(o => o.name.startsWith('Савченко')).id);
  await page.goto(url + '#/object/' + objId + '/report'); await page.waitForTimeout(80);
  const orep = await page.textContent('#main');
  assert(orep.includes('Отчёт по объекту') && orep.includes('4 курс') && orep.includes('5 курс') && orep.includes('ВПК-16'), 'отчёт по объекту: расчёты и матрица компетенций');
  // справочник: термины и группы
  await page.goto(url + '#/method/terms'); assert((await page.textContent('#main')).includes('Коэффициент значимости'), 'справочник: термины');
  await page.goto(url + '#/method/comp'); assert((await page.$$('#main details')).length >= 6, 'справочник: группы по видам деятельности');
  // черновик подхватывает изменения набора Кзнк
  await page.goto(url + '#/coef'); await page.click('[data-act=coef-copy][data-id=src-vpk13]'); await page.waitForTimeout(80);
  const setId = page.url().split('/').pop();
  await page.goto(url + '#/new'); await page.selectOption('#nw-obj', { index: 1 }); await page.check('input[name=nw-type][value=practice]'); await page.click('[data-act=nw-create]'); await page.waitForTimeout(80);
  await page.selectOption('select[data-bind="meta|vpkSetId"]', setId); await page.waitForTimeout(80);
  const dr = page.url();
  await page.goto(url + '#/coef/' + setId); await page.fill('#cs-k-0', '0,5'); await page.click('[data-act=coef-save]'); await page.waitForTimeout(80);
  await page.goto(dr.replace(/edit\/1$/, 'edit/2')); await page.waitForTimeout(80);
  assert((await page.textContent('tbody tr:first-child td.num')).trim() === '0,50000' && (await page.textContent('#main')).includes('Параметры методики обновлены'), 'черновик подхватил новый Кзнк и показал уведомление');
  // mobile
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(url + '#/history'); await page.waitForTimeout(600);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(sw <= 376, 'нет горизонтальной прокрутки страницы на 375px (scrollWidth=' + sw + ')');
  await page.screenshot({ path: require('path').join(require('os').tmpdir(), 'mobile.png') });
  await page.click('#menuBtn'); await page.waitForTimeout(400); await page.screenshot({ path: require('path').join(require('os').tmpdir(), 'mobile-menu.png') });
  await page.goto(url + '#/a/' + (await page.evaluate(() => JSON.parse(localStorage.getItem('pfk-vpk-calculator-v1')).assessments.find(a => a.type === 'graduate').id))); await page.waitForTimeout(500); await page.screenshot({ path: require('path').join(require('os').tmpdir(), 'mobile-grad.png'), fullPage: true });
  const sw2 = await page.evaluate(() => document.documentElement.scrollWidth); assert(sw2 <= 376, 'карточка отзыва на 375px без горизонтальной прокрутки (' + sw2 + ')');
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(url + '#/a/' + (await page.evaluate(() => JSON.parse(localStorage.getItem('pfk-vpk-calculator-v1')).assessments.find(a => a.type === 'practice').id)));
  await page.waitForTimeout(50); await page.screenshot({ path: require('path').join(require('os').tmpdir(), 'practice.png'), fullPage: true });
  console.log('JS ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})();
