"""КАД Арбитр (Playwright, headless Chromium). Cookies кэшируются в Redis на 24 ч.

Селекторы зависят от вёрстки kad.arbitr.ru и могут потребовать актуализации;
при сбое срабатывают retry и circuit breaker, API отвечает status=partial + ручной ввод.
"""
from app.core.cache import cache_get, cache_set
from app.core.config import settings
from app.services.parsers.resilience import kad_breaker, with_retry


async def _context(p):
    browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = await browser.new_context()
    cookies = await cache_get("kad:cookies")
    if cookies:
        await context.add_cookies(cookies)
    return browser, context


async def search_cases(*, inn: str | None = None, case_number: str | None = None) -> list[dict]:
    key = f"kad:search:{inn or case_number}"
    if (c := await cache_get(key)) is not None:
        return c

    async def call():
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser, context = await _context(p)
            try:
                page = await context.new_page()
                await page.goto(settings.KAD_BASE_URL, timeout=30000)
                await cache_set("kad:cookies", await context.cookies(), 86400)
                await page.fill('input[placeholder*="ИНН" i], input[name="inn"]', inn or case_number or "")
                await page.click('button[type="submit"]')
                await page.wait_for_selector(".b-found-cases, .case-list", timeout=30000)
                items = await page.query_selector_all(".b-found-cases tr, .case-item")
                out = []
                for it in items:
                    text = (await it.inner_text()).strip()
                    if text:
                        out.append({"raw": text, "number": text.split()[0]})
                return out
            finally:
                await browser.close()

    result = await with_retry(call, kad_breaker)
    await cache_set(key, result, 12 * 3600)
    return result
