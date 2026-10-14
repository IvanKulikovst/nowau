// Реферат → PDF в два прохода: 1) рендер с пустым содержанием; 2) номера страниц заголовков из PDF → содержание → финальный рендер.
import { createRequire } from 'node:module'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const [src, out] = process.argv.slice(2);
const browser = await chromium.launch(); const page = await browser.newPage();
await page.goto('file://' + path.resolve(src), { waitUntil: 'load' });
const heads = await page.evaluate(() => [...document.querySelectorAll('h1[id],h2[id]')].map((h) => ({ id: h.id, lvl: h.tagName, text: h.textContent.trim() })));
const fill = (pages) => page.evaluate(({ heads, pages }) => {
  const toc = document.getElementById('toc'); toc.replaceChildren();
  heads.forEach((h, i) => { const r = document.createElement('p'); r.className = 'toc-row' + (h.lvl === 'H2' ? ' sub' : '');
    r.innerHTML = '<span class="t"></span><span class="d"></span><span class="p"></span>'; r.children[0].textContent = h.text; r.children[2].textContent = pages ? pages[i] : '00'; toc.appendChild(r); });
}, { heads, pages });
const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
let pages = null;
for (let pass = 0; pass < 2; pass++) {
  await fill(pages);
  await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
  const n = +/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [out]).toString())[1];
  const texts = []; for (let p = 1; p <= n; p++) texts.push(norm(execFileSync('pdftotext', ['-f', String(p), '-l', String(p), '-layout', out, '-']).toString()));
  // заголовок ищется после страницы содержания, по порядку
  let from = 2; pages = heads.map((h) => { const key = norm(h.text); for (let p = from; p < n; p++) if (texts[p].includes(key)) { from = p; return String(p + 1); } return '?'; });
  console.log('проход', pass + 1, 'страниц', n, pages.join(','));
}
await browser.close();
