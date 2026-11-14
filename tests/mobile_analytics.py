import asyncio
import json
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/chromium")
        context = await browser.new_context(**p.devices["iPhone 13"], service_workers="block")
        page = await context.new_page()
        await page.goto("http://127.0.0.1:4173/", wait_until="domcontentloaded")
        await page.wait_for_timeout(1800)
        result = {
            "ua": await page.evaluate("navigator.userAgent"),
            "auth_gate": await page.locator("#wrldlineAuthGate").is_visible(),
            "visible_cards_without_session": await page.locator(".news-card:visible").count(),
            "overflow": await page.evaluate("() => ({scrollWidth: document.documentElement.scrollWidth, innerWidth, bodyScrollWidth: document.body.scrollWidth})"),
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        await browser.close()


asyncio.run(main())
