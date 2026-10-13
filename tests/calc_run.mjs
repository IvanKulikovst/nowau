// Прогон набора случайных записей через движок приложения (window.KRPD.calcRecord) в реальном браузере.
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const [file, casesFile, outFile] = process.argv.slice(2);
const cases = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + path.resolve(file));
await page.waitForFunction(() => window.KRPD && window.KRPD.isReady());
const res = await page.evaluate((cs) => cs.map((c) => { const r = window.KRPD.calcRecord(c); return r.ok ? { ok: true, nMilli: String(r.nMilli), kMilli: String(r.kMilli), massG: String(r.massG), volL: String(r.volL) } : r; }), cases);
fs.writeFileSync(outFile, JSON.stringify(res));
await browser.close();
