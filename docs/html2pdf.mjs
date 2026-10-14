// HTML → PDF через Chromium (Playwright), размер страницы берётся из CSS @page.
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const [src, out] = process.argv.slice(2);
const browser = await chromium.launch(); const page = await browser.newPage();
await page.goto('file://' + path.resolve(src), { waitUntil: 'load' });
await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
await browser.close();
