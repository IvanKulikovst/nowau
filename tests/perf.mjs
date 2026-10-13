// Замер загрузки и проверка утечек: многократное открытие/закрытие окон, рост кучи JS, DOM-узлов и обработчиков.
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
const t0 = Date.now();
await page.goto('file://' + path.resolve(process.argv[2]));
await page.waitForFunction(() => window.KRPD && window.KRPD.isReady());
const ready = Date.now() - t0;
const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), transfer: n.decodedBodySize }; });
await page.click('#startBtn'); await page.waitForTimeout(800);
async function metrics() { await cdp.send('HeapProfiler.collectGarbage'); const m = (await cdp.send('Performance.getMetrics')).metrics; const g = (k) => m.find((x) => x.name === k).value; return { heapMB: +(g('JSHeapUsedSize') / 1048576).toFixed(2), nodes: g('Nodes'), listeners: g('JSEventListeners') }; }
async function cycle() {
  await page.keyboard.press('Control+Shift+P'); await page.locator('.pw').waitFor(); await page.selectOption('#pw-form', 'a3'); await page.keyboard.press('Escape');
  await page.keyboard.press('F1'); await page.locator('#rw-search').waitFor(); await page.fill('#rw-search', 'норма'); await page.keyboard.press('Escape');
  await page.click('#sideNew'); await page.fill('#f-qty', '5'); await page.keyboard.press('Escape');
  for (const h of ['#/home/stats', '#/calc/history', '#/print/log', '#/home/overview']) await page.evaluate((h) => { location.hash = h; dispatchEvent(new PopStateEvent('popstate')); }, h);
}
await cycle();
const m0 = await metrics();
const tc = Date.now(); for (let i = 0; i < 20; i++) await cycle(); const per = Math.round((Date.now() - tc) / 20);
const m1 = await metrics();
const t1 = Date.now(); await page.evaluate(() => window.KRPD.render()); const renderMs = Date.now() - t1;
console.log(JSON.stringify({ readyMs: ready, nav, afterFirstCycle: m0, after20Cycles: m1, msPerCycle: per, renderMs }, null, 1));
await browser.close();
// критерий: после 20 циклов DOM-узлы и обработчики не растут более чем на 10 %
const leak = m1.nodes > m0.nodes * 1.1 || m1.listeners > m0.listeners * 1.1;
console.log(leak ? 'УТЕЧКА: рост узлов/обработчиков' : 'утечек не обнаружено');
process.exit(leak ? 1 : 0);
