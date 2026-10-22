// Запуск: node tests/vfiles.spec.js [папка-для-снимков]
// Фото единицы техники и документы на машину (паспорт, формуляр, акты приёма-передачи)
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
  const load = async h => { await p.goto(PAGE_URL + h); await p.reload(); await p.waitForTimeout(1500); await p.evaluate(() => document.querySelectorAll('.f-toast-close').forEach(x => x.click())); };
  const db = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), LS);
  // Большое изображение 4000×3000 из холста — проверка сжатия
  const bigPng = () => p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 4000, 3000); gr.addColorStop(0, '#2a6'); gr.addColorStop(1, '#e83'); g.fillStyle = gr; g.fillRect(0, 0, 4000, 3000);
    for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${i * 7},70%,50%)`; g.fillRect((i * 97) % 3900, (i * 53) % 2900, 90, 60); }
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await load('#fleet/park');
  const v = (await db()).vehicles[0];
  await load('#fleet/vehicle/' + v.id);
  const tab = await p.evaluate(() => [...document.querySelectorAll('.f-tab')].map(t => t.textContent.trim()));
  check('Во вкладках карточки есть «Фото и документы»', tab.some(t => /^Фото и документы \(0\)/.test(t)), tab.join(' | '));
  await p.evaluate(() => [...document.querySelectorAll('.f-tab')].find(t => /Фото и документы/.test(t.textContent)).click()); await p.waitForTimeout(300);

  // 1. Фотографии
  const png = await bigPng();
  await p.setInputFiles('#vfPhotoIn', [{ name: 'общий вид.png', mimeType: 'image/png', buffer: Buffer.from(png) }, { name: 'табличка.png', mimeType: 'image/png', buffer: Buffer.from(png) }, { name: 'заметка.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }]);
  await p.waitForFunction(() => document.querySelectorAll('.vf-ph').length === 2, null, { timeout: 15000 }).catch(() => {});
  let d = await db(); let vv = d.vehicles.find(x => x.id === v.id);
  check('Добавлены 2 фото, текстовый файл отклонён', (vv.photos || []).length === 2, (vv.photos || []).length + '');
  const ph = vv.photos[0];
  check('Фото сжато до 1600 px по длинной стороне', ph.w === 1600 && ph.h === 1200, ph.w + '×' + ph.h);
  check('Размер сжатого фото меньше исходного PNG', ph.size < png.length / 2, ph.size + ' < ' + png.length);
  check('Главное фото назначено первым', vv.mainPhotoId === ph.id);
  check('Миниатюра — отдельный файл, в записи нет данных изображения', !!ph.thumbId && JSON.stringify(vv).length < 4000, JSON.stringify(vv).length + ' байт');
  const thumbOk = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 600)); const im = document.querySelector('.vf-ph img'); return !!(im && im.src.startsWith('blob:') && im.naturalWidth > 0 && im.naturalWidth <= 320); });
  check('Миниатюры загружаются и не больше 320 px', thumbOk);
  await p.screenshot({ path: OUT + '/photos.png' });

  // 2. Просмотр, подпись, главное фото
  await p.click('.vf-ph >> nth=1'); await p.waitForFunction(() => { const i = document.getElementById('vwImg'); return i && i.naturalWidth > 0; }, null, { timeout: 10000 });
  const shown = await p.evaluate(() => { const i = document.getElementById('vwImg'); return i.naturalWidth; });
  check('Фото открывается в просмотре', shown === 1600, shown + '');
  await p.fill('#vwCap', 'Табличка с заводским номером'); await p.dispatchEvent('#vwCap', 'change');
  await p.click('#vwMain'); await p.waitForTimeout(200);
  d = await db(); vv = d.vehicles.find(x => x.id === v.id);
  check('Подпись и главное фото сохранены', vv.photos[1].caption === 'Табличка с заводским номером' && vv.mainPhotoId === vv.photos[1].id);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
  check('Стрелки листают фото', /1 из 2/.test(await p.textContent('#vwSub')));
  await p.click('.f-modal-close'); await p.waitForTimeout(200);

  // 3. Документы
  let nDocs = 0;
  for (const [kind, num, fname] of [['Паспорт', 'АБ 123456', 'паспорт.pdf'], ['Формуляр', 'Ф-77', 'формуляр.pdf'], ['Акт приёма-передачи', '12', 'акт.png']]) {
    await p.click('[data-do="doc-add"]'); await p.waitForSelector('#vdKind');
    await p.selectOption('#vdKind', kind); await p.fill('#vdNumber', num); await p.fill('#vdDate', '2026-03-15');
    const buf = fname.endsWith('.png') ? Buffer.from(png) : Buffer.from('%PDF-1.4 test');
    await p.setInputFiles('#vdFiles', [{ name: fname, mimeType: fname.endsWith('.png') ? 'image/png' : 'application/pdf', buffer: buf }]);
    await p.click('#vdSave'); nDocs++; await p.waitForFunction(n => document.querySelectorAll('.vf-doc').length === n, nDocs, { timeout: 15000 }).catch(() => {});
  }
  d = await db(); vv = d.vehicles.find(x => x.id === v.id);
  check('Три документа сохранены', (vv.vdocs || []).length === 3 && vv.vdocs.map(x => x.kind).join() === 'Паспорт,Формуляр,Акт приёма-передачи');
  check('Скан-изображение акта сжато (PNG 4000 px → JPEG)', vv.vdocs[2].files[0].type === 'image/jpeg' && vv.vdocs[2].files[0].size < png.length, vv.vdocs[2].files[0].size + '');
  check('Файлы документов лежат в хранилище, а не в записи', JSON.stringify(vv).length < 5000);
  const rows = await p.evaluate(() => document.querySelectorAll('.vf-doc').length);
  check('Документы показаны в списке', rows === 3, rows + '');
  await p.click('[data-do="doc-add"]'); await p.waitForSelector('#vdKind'); await p.selectOption('#vdKind', 'Другой документ'); await p.click('#vdSave'); await p.waitForTimeout(300);
  check('«Другой документ» без названия не сохраняется', (await db()).vehicles.find(x => x.id === v.id).vdocs.length === 3);
  await p.fill('#vdTitle', 'Свидетельство о регистрации'); await p.click('#vdSave'); await p.waitForTimeout(500);
  check('«Другой документ» с названием сохранён', (await db()).vehicles.find(x => x.id === v.id).vdocs.length === 4);
  await p.screenshot({ path: OUT + '/docs.png' });

  // 4. Скачивание PDF и открытие скана
  const dlp = p.waitForEvent('download');
  await p.click('[data-do="docfile"][data-did] >> nth=0'); const dl = await dlp;
  check('PDF скачивается с исходным именем', dl.suggestedFilename().length > 0, dl.suggestedFilename());
  const content = fs.readFileSync(await dl.path(), 'latin1');
  check('Содержимое скачанного файла совпадает', content === '%PDF-1.4 test');

  // 5. Шапка, список
  await p.evaluate(() => document.querySelector('[data-act="back-park"]').click()); await p.waitForTimeout(700);
  const mini = await p.evaluate(() => { const i = document.querySelector('img.vf-mini'); return !!(i && i.src.startsWith('blob:')); });
  check('Фото показано в списке техники', mini);

  // 6. Редактирование и удаление
  await load('#fleet/vehicle/' + v.id);
  await p.evaluate(() => [...document.querySelectorAll('.f-tab')].find(t => /Фото и документы/.test(t.textContent)).click()); await p.waitForTimeout(300);
  await p.click('[data-do="doc-edit"] >> nth=0'); await p.waitForSelector('#vdKind');
  await p.fill('#vdNumber', 'АБ 999999'); await p.click('#vdSave'); await p.waitForTimeout(500);
  check('Документ редактируется', (await db()).vehicles.find(x => x.id === v.id).vdocs[0].number === 'АБ 999999');
  const before = await p.evaluate(() => new Promise(r => { const q = indexedDB.open('tst-fleet-files'); q.onsuccess = () => { const t = q.result.transaction('files').objectStore('files').getAllKeys(); t.onsuccess = () => r(t.result.length); }; }));
  await p.click('[data-do="doc-del"] >> nth=0'); await p.click('[data-yes]'); await p.waitForTimeout(1200);
  d = await db(); vv = d.vehicles.find(x => x.id === v.id);
  const after = await p.evaluate(() => new Promise(r => { const q = indexedDB.open('tst-fleet-files'); q.onsuccess = () => { const t = q.result.transaction('files').objectStore('files').getAllKeys(); t.onsuccess = () => r(t.result.length); }; }));
  check('Документ удалён', vv.vdocs.length === 3);
  check('Файл удалённого документа убран из хранилища', after < before, before + ' → ' + after);

  // 7. Резервная копия содержит файлы техники
  await load('#fleet/settings');
  const dlb = p.waitForEvent('download'); await p.evaluate(() => document.querySelector('[data-act="backup-export"]').click()); const zip = await dlb;
  const zb = fs.readFileSync(await zip.path());
  const names = (zb.toString('latin1').match(/files\/[A-Za-z0-9_-]+\.[a-z]+/g) || []);
  const mine = (await db()).vehicles.find(x => x.id === v.id);
  const need = mine.photos.length * 2 + mine.vdocs.reduce((s, x) => s + x.files.length, 0);
  check('В резервной копии есть все фото, миниатюры и сканы', new Set(names).size >= need, new Set(names).size + ' из ' + need);

  // 8. Удаление техники вместе с файлами, отмена возвращает
  await load('#fleet/park');
  await p.evaluate(id => { const b = document.createElement('button'); b.dataset.act = 'del-vehicle'; b.dataset.id = id; document.getElementById('fleetView').appendChild(b); b.click(); }, v.id);
  await p.waitForTimeout(800);
  const gone = (await db()).vehicles.some(x => x.id === v.id);
  check('Техника удалена в корзину', !gone);
  const undo = await p.waitForSelector('.f-toast-action', { timeout: 4000 }).catch(() => null);
  if (undo) { await undo.click(); await p.waitForTimeout(500); }
  const back = (await db()).vehicles.find(x => x.id === v.id);
  check('Отмена удаления возвращает технику вместе с фото и документами', !!back && (back.photos || []).length === 2 && (back.vdocs || []).length === 3, `undo=${!!undo} back=${!!back} ph=${back && (back.photos || []).length}`);
  const st = await p.evaluate(() => TST.platform.runTests());
  const badT = st.filter(r => r.ok === false || r.pass === false);
  check('Самотесты платформы проходят (включая «Файлы техники»)', badT.length === 0 && st.some(r => r.module === 'vfiles'), st.length + ' тестов' + (badT.length ? '; упали: ' + badT.map(r => r.name).join(',') : ''));
  check('Внешних запросов нет', net.length === 0, net.join(','));
  check('Ошибок на странице нет', errs.length === 0, errs.join('; '));
  await b.close();
  const bad = res.filter(x => !x).length; console.log(`\nИтого: ${res.length - bad}/${res.length}`); process.exit(bad ? 1 : 0);
})();
