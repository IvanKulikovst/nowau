/* Сквозной тест навигации: разделы и вкладки, «Назад», поиск раздела, карточка курсанта,
   отмена удаления, пустые состояния, «не найдено», первые шаги, мобильная панель.  node tests/e2e-nav.js */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('pfk-vpk-calculator-v1') || 'null'));
  const main = () => page.textContent('#main');
  const wait = (ms = 80) => page.waitForTimeout(ms);
  await page.goto(url + '#/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(150);

  // меню: пять разделов и сервис
  const secs = await page.$$eval('#nav a.sec .t', a => a.map(x => x.textContent));
  assert(secs.join('|') === 'Главная|Оценки|Курсанты и выпускники|Анализ|Методика', 'меню: пять разделов (' + secs + ')');
  assert((await main()).includes('С чего начать'), 'главная: первые шаги для нового пользователя');

  // пустые состояния
  await page.goto(url + '#/history'); await wait();
  assert((await main()).includes('Оценок пока нет') && await page.isVisible('#main .empty a[href="#/new"]'), 'все оценки: пустое состояние с действием');
  await page.goto(url + '#/objects'); await wait();
  assert((await main()).includes('Список пока пуст'), 'курсанты: пустое состояние');

  // быстрое добавление и переход в карточку из сообщения
  await page.fill('#of-name', 'Иванов И.И.'); await page.fill('#of-group', '41'); await page.click('[data-act=obj-add]'); await wait();
  assert((await st()).objects.length === 1 && await page.isVisible('.toast-btn'), 'курсант добавлен, в сообщении есть «Открыть карточку»');
  await page.click('.toast-btn'); await wait();
  const oid = (await st()).objects[0].id;
  assert(page.url().endsWith('#/object/' + oid) && (await page.textContent('.backbar .back')).includes('Курсанты и выпускники'), 'карточка: «Назад» ведёт к списку');
  const tabs = await page.$$eval('#main nav.tabs a', a => a.map(x => x.textContent));
  assert(tabs.join('|') === 'Оценки|Профиль|Карта этапов|Отчёт|Сведения', 'карточка: вкладки (' + tabs + ')');
  assert((await main()).includes('Оценок пока нет'), 'карточка: пустое состояние оценок');

  // разделы с вкладками: подпункты текущего раздела в меню
  await page.goto(url + '#/risk'); await wait();
  const sub = await page.$$eval('#nav .sub a', a => a.map(x => x.textContent));
  assert(sub.includes('Группы риска') && sub.includes('Прогноз по группе') && (await page.textContent('#nav .sub a.active')) === 'Группы риска', 'анализ: подпункты раздела, текущий выделен');
  assert((await page.textContent('#topTitle')) === 'Группы риска', 'заголовок экрана в верхней строке');

  // «Назад» ведёт туда, откуда пришли
  await page.goto(url + '#/new?obj=' + oid); await page.check('input[name=nw-type][value=g0]'); await page.click('[data-act=nw-create]'); await wait();
  const aid = (await st()).assessments[0].id;
  await page.goto(url + '#/object/' + oid); await wait(); await page.goto(url + '#/a/' + aid); await wait();
  assert((await page.textContent('.backbar .back')).includes('Иванов И.И.'), 'черновик из карточки: «Назад» к курсанту');
  await page.goto(url + '#/history'); await wait(); await page.goto(url + '#/a/' + aid + '/edit/1'); await wait();
  assert((await page.textContent('.backbar .back')).includes('Все оценки'), 'ввод из «Все оценки»: «Назад» к списку оценок');

  // поиск раздела
  await page.fill('#navSearch', 'бланк'); await wait();
  const hits = await page.$$eval('#nav a .t', a => a.map(x => x.textContent));
  assert(hits.length === 1 && hits[0].startsWith('Бланки для печати'), 'поиск раздела по слову');
  await page.press('#navSearch', 'Enter'); await wait();
  assert(page.url().endsWith('#/blanks') && (await page.inputValue('#navSearch')) === '', 'Enter открывает найденный раздел и очищает поиск');

  // удаление с отменой
  await page.goto(url + '#/object/' + oid + '/edit'); await page.click('[data-act=obj-del]'); await page.click('#dlgFoot .danger'); await wait();
  assert((await st()).objects.length === 0 && (await page.textContent('.toast')).includes('удалён'), 'удаление: подтверждение и сообщение');
  await page.click('.toast-btn'); await wait();
  const s2 = await st();
  assert(s2.objects.length === 1 && s2.assessments.length === 1 && s2.trash.length === 0, 'кнопка «Отменить» вернула курсанта и его оценки');

  // не найдено и ошибки
  await page.goto(url + '#/a/net-takoy'); await wait();
  assert((await main()).includes('не найдено') && await page.isVisible('#main [data-act=nav-back]'), 'несуществующая запись: понятное сообщение и выход');
  await page.goto(url + '#/neizvestno'); await wait();
  assert((await main()).includes('Страница не найдена'), 'неизвестный адрес: «Страница не найдена»');

  // первые шаги скрываются и возвращаются
  await page.goto(url + '#/'); await page.click('[data-act=ob-hide]'); await wait();
  assert(!(await main()).includes('С чего начать'), 'первые шаги скрыты');
  await page.click('.toast-btn'); await wait();
  assert((await main()).includes('С чего начать'), '«Вернуть» показывает их снова');

  // мобильная панель
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(url + '#/stats'); await wait(200);
  assert(await page.isVisible('.tabbar') && (await page.getAttribute('.tabbar a[data-sec=analysis]', 'class')).includes('active'), 'телефон: панель разделов, «Анализ» активен');
  assert(await page.isVisible('.sectabs'), 'телефон: вкладки раздела над содержимым');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth); assert(sw <= 376, 'телефон: без горизонтальной прокрутки (' + sw + ')');
  await page.click('#menuBtn'); await wait(500);
  assert(await page.isVisible('#nav'), 'телефон: «Ещё» открывает все разделы');
  await page.click('#sideScrim', { position: { x: 10, y: 10 } }); await wait(500);
  assert(!(await page.getAttribute('#side', 'class')).includes('open'), 'телефон: касание вне листа закрывает его');

  assert(!errs.length, 'нет ошибок JavaScript' + (errs.length ? ': ' + errs.join('; ') : ''));
  await b.close();
})();
