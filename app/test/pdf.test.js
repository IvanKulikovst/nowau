'use strict';
/* Просмотр PDF-вложения в отдельном окне приложения: xvfb-run -a node test/pdf.test.js [папка-для-снимков] */
const path = require('path'), fs = require('fs'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const electronPath = require('electron');
const APP = path.resolve(__dirname, '..');
const OUT = process.argv[2] || '';
const res = []; const check = (n, ok, i) => { res.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p));
// Минимальный корректный PDF с одной страницей и надписью
function tinyPdf() {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream = 'BT /F1 24 Tf 40 100 Td (PASSPORT TEST) Tj ET';
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
(async () => {
  const dataDir = path.join(tmp('tst-pdf-'), 'data'), profile = tmp('tst-profile-');
  const app = await pw._electron.launch({ executablePath: electronPath, args: [APP, '--no-sandbox'],
    env: Object.assign({}, process.env, { TST_USER_DATA: profile, TST_DATA_DIR: dataDir, TST_TEST: '1' }) });
  const page = await app.firstWindow(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.waitForLoadState('domcontentloaded'); await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelectorAll('.f-toast-close').forEach(x => x.click()));
  check('Мост приложения умеет открывать PDF', await page.evaluate(() => typeof window.TSTNative.openPdf === 'function'));
  const vid = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8')).vehicles[0].id;
  await page.evaluate(id => { location.hash = '#fleet/vehicle/' + id; }, vid); await page.waitForTimeout(900);
  await page.evaluate(() => [...document.querySelectorAll('.f-tab')].find(t => /Фото и документы/.test(t.textContent)).click()); await page.waitForTimeout(300);
  const addDoc = async (kind, name, buf, mime) => {
    await page.click('[data-do="doc-add"]'); await page.waitForSelector('#vdKind'); await page.selectOption('#vdKind', kind);
    await page.setInputFiles('#vdFiles', [{ name, mimeType: mime, buffer: buf }]);
    const n = await page.evaluate(() => document.querySelectorAll('.vf-doc').length);
    await page.click('#vdSave'); await page.waitForFunction(k => document.querySelectorAll('.vf-doc').length === k + 1, n, { timeout: 10000 });
  };
  await addDoc('Паспорт', 'passport.pdf', tinyPdf(), 'application/pdf');
  await addDoc('Формуляр', 'fake.pdf', Buffer.from('это не PDF, а текст'), 'application/pdf');
  const titles = await page.evaluate(() => [...document.querySelectorAll('[data-do="docfile"]')].map(b => b.title));
  check('У PDF в приложении действие «Открыть», а не «Скачать»', titles.every(t => /^Открыть/.test(t)), titles.join(' | '));

  const winP = app.waitForEvent('window', { timeout: 15000 });
  await page.click('[data-do="docfile"] >> nth=0');
  const pdfWin = await winP.catch(() => null);
  check('PDF открывается в отдельном окне', !!pdfWin);
  if (pdfWin) {
    await pdfWin.waitForTimeout(2500);
    const url = pdfWin.url();
    check('Окно показывает временную копию с расширением .pdf', /preview[\\/].*\.pdf$/.test(decodeURIComponent(url)), decodeURIComponent(url).slice(-60));
    const viewer = await pdfWin.evaluate(() => !!document.querySelector('embed[type="application/pdf"], embed, pdf-viewer') || document.contentType === 'application/pdf').catch(() => false);
    check('Встроенный просмотр PDF загружен', viewer);
    check('У окна просмотра нет доступа к мосту приложения', await pdfWin.evaluate(() => typeof window.TSTNative === 'undefined').catch(() => true));
    if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await pdfWin.screenshot({ path: path.join(OUT, 'pdf-window.png') }).catch(() => {}); }
    const files = fs.readdirSync(path.join(profile, 'preview'));
    check('Временная копия создана в профиле приложения под исходным именем', files.length === 1 && fs.readdirSync(path.join(profile, 'preview', files[0])).join() === 'passport.pdf', files.join(','));
    await pdfWin.close(); await page.waitForTimeout(600);
    check('После закрытия окна временная копия удалена', fs.readdirSync(path.join(profile, 'preview')).length === 0);
  }
  // Подделка: расширение .pdf, содержимое — текст
  const before = app.windows().length;
  await page.click('[data-do="docfile"] >> nth=1'); await page.waitForTimeout(1500);
  check('Файл с расширением .pdf, но не PDF, в окне не открывается', app.windows().length === before, app.windows().length + ' окон');
  const r = await page.evaluate(() => window.TSTNative.openPdf('../../etc/passwd').catch(e => ({ ok: false, thrown: true })));
  check('Чужой путь вместо идентификатора отклоняется', r && r.ok === false);
  check('Нет ошибок JavaScript', errs.length === 0, errs.join('; '));
  await app.close();
  const bad = res.filter(x => !x).length; console.log(`\nИТОГ: ${res.length - bad} из ${res.length}`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
