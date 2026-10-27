/* Сквозной тест блока контроля по схемам модели (Playwright + Chromium): node tests/e2e-control.js
   Сведения абитуриента, журнал форм контроля, ведомость группы, карта этапов, связи схемы S7. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const store = page => page.evaluate(() => JSON.parse(localStorage.getItem('pfk-vpk-calculator-v1')));
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext()).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(url + '#/objects');
  await page.fill('#of-name', 'Савченко А.А.'); await page.fill('#of-group', '41');
  await page.click('text=Дополнительные сведения'); await page.click('text=Сведения абитуриента'); await page.selectOption('#of-edu', 'колледж'); await page.check('.of-flag[value=combat]'); await page.fill('#of-exp', 'контрактная служба 2 года');
  await page.click('[data-act=obj-add]');
  await page.fill('#of-name', 'Гончаренко Б.Б.'); await page.fill('#of-group', '41'); await page.click('[data-act=obj-add]');
  let s = await store(page);
  assert(s.objects[0].applicant.education === 'колледж' && s.objects[0].applicant.flags.combat === true, 'сведения абитуриента сохранены');
  const sId = s.objects[0].id;

  // одиночная запись: ЕГЭ на этапе «Абитуриент»
  await page.goto(url + '#/journal'); await page.waitForTimeout(60);
  await page.selectOption('[data-jr=objectId]', sId); await page.selectOption('[data-jr=stage]', '0'); await page.waitForTimeout(60);
  await page.selectOption('[data-jr=form]', 'ege'); await page.waitForTimeout(60);
  assert((await page.inputValue('[data-jr=markType]')) === 'score' && (await page.inputValue('[data-jr=block]')) === 'diagnostics', 'ЕГЭ: результат в баллах, блок «диагностика»');
  await page.fill('[data-jr=mark]', '245'); await page.fill('[data-jr=discipline]', 'сумма баллов');
  await page.click('[data-act=jr-save]'); await page.waitForTimeout(60);
  // подсказки форм по виду контроля
  await page.selectOption('[data-jr=kind]', 'final'); await page.waitForTimeout(60);
  const og = await page.$$eval('[data-jr=form] optgroup', g => g.map(x => x.label + ': ' + [...x.children].map(o => o.textContent).join(', ')));
  assert(og[0].includes('Итоговый') && og[0].includes('Экзамен') && og[0].includes('Портфолио'), 'вид «итоговый» → сверху формы по схеме: ' + og[0]);
  // недопустимая оценка
  await page.selectOption('[data-jr=form]', 'exam'); await page.waitForTimeout(60);
  await page.click('[data-act=jr-save]'); await page.waitForTimeout(60);
  assert((await page.textContent('#toasts')).includes('оценка 2…5'), 'без оценки запись не сохраняется');

  // ведомость группы: экзамен, 1 курс, 2 семестр, вставка столбца
  await page.goto(url + '#/journal/sheet'); await page.waitForTimeout(60);
  await page.selectOption('[data-jr=stage]', '1'); await page.waitForTimeout(60); await page.selectOption('[data-jr=semester]', '2');
  await page.selectOption('[data-jr=kind]', 'final'); await page.waitForTimeout(60); await page.selectOption('[data-jr=form]', 'exam'); await page.waitForTimeout(60);
  await page.fill('[data-jr=discipline]', 'Тактика');
  await page.click('text=Контролируемые ВПК'); await page.check('[data-jrc="ВПК-5"]');
  await page.focus('[data-grid=js][data-rc="0,0"]');
  await page.evaluate(() => { const dt = new DataTransfer(); dt.setData('text', '4\n5'); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); });
  await page.click('[data-act=js-save]'); await page.waitForTimeout(80);
  s = await store(page);
  const ex = s.controlRecords.filter(r => r.form === 'exam');
  assert(ex.length === 2 && ex.every(r => r.semester === 2 && r.discipline === 'Тактика' && r.comps[0] === 'ВПК-5' && r.kind === 'final'), 'ведомость: 2 записи экзамена с семестром, дисциплиной, видом и ВПК');
  // ведомость: недопустимое значение
  await page.goto(url + '#/journal/sheet'); await page.waitForTimeout(60);
  await page.selectOption('[data-jr=form]', 'zachet'); await page.waitForTimeout(60);
  assert((await page.inputValue('[data-jr=markType]')) === 'pass', 'форма «зачёт» → вид результата «зачёт / незачёт»');
  await page.fill('[data-grid=js][data-rc="0,0"]', 'нз'); await page.fill('[data-grid=js][data-rc="1,0"]', 'з');
  await page.click('[data-act=js-save]'); await page.waitForTimeout(80);
  s = await store(page);
  assert(s.controlRecords.filter(r => r.markType === 'pass').map(r => r.mark).sort().join() === 'зачтено,не зачтено', 'зачёт: «з» и «нз» распознаны');

  // журнал: эмпирические показатели и фильтр
  await page.goto(url + '#/journal'); await page.waitForTimeout(60);
  assert((await page.textContent('#main')).includes('средний балл 4,50'), 'журнал: средний балл по оценкам 2–5 = 4,50');

  // карта этапов
  await page.goto(url + '#/object/' + sId + '/map'); await page.waitForTimeout(80);
  const map = await page.textContent('#main');
  assert(map.includes('колледж') && map.includes('участие в боевых действиях') && map.includes('ЕГЭ') && map.includes('245 б.'), 'карта: входной блок и ЕГЭ на этапе «Абитуриент»');
  assert(map.includes('Экзамен (Тактика): 5') && map.includes('ср. балл 5,00') && map.includes('не вычисляется'), 'карта: экзамен 1 курса, эмпирический показатель, пометка об отсутствии единого уровня');

  if (process.env.SHOTS) { await page.setViewportSize({ width: 1400, height: 900 }); await page.screenshot({ path: path.join(process.env.SHOTS, 'map.png'), fullPage: true }); await page.goto(url + '#/journal'); await page.waitForTimeout(100); await page.screenshot({ path: path.join(process.env.SHOTS, 'journal.png'), fullPage: true }); await page.goto(url + '#/method/scheme'); await page.waitForTimeout(100); await page.screenshot({ path: path.join(process.env.SHOTS, 'scheme.png') }); }
  // схема связей: правка и возврат
  await page.goto(url + '#/method/scheme'); await page.waitForTimeout(60);
  await page.uncheck('[data-link="final|portfolio"]'); await page.waitForTimeout(60);
  assert((await page.textContent('#main')).includes('изменённые пользователем'), 'связи схемы можно править');
  await page.goto(url + '#/journal'); await page.selectOption('[data-jr=kind]', 'final'); await page.waitForTimeout(60);
  const og2 = await page.$eval('[data-jr=form] optgroup', g => g.textContent);
  assert(!og2.includes('Портфолио'), 'изменённые связи применяются в журнале');
  await page.goto(url + '#/method/scheme'); await page.click('[data-act=links-reset]'); await page.waitForTimeout(60);
  assert(!(await page.textContent('#main')).includes('изменённые пользователем'), 'возврат связей со схемы');

  // удаление объекта удаляет записи журнала
  await page.goto(url + '#/object/' + sId + '/edit'); await page.click('[data-act=obj-del]'); await page.click('#dlgFoot .danger'); await page.waitForTimeout(80);
  s = await store(page);
  assert(s.controlRecords.every(r => r.objectId !== sId), 'удаление объекта удаляет его записи журнала');
  assert(errs.length === 0, 'нет ошибок JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
