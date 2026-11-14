import asyncio
import json
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:4173"


async def main():
    results = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/chromium")
        context = await browser.new_context(service_workers="block")
        page = await context.new_page()

        await page.goto(BASE + "/", wait_until="domcontentloaded")
        await page.wait_for_timeout(2200)
        results["home_gate_visible"] = await page.locator("#wrldlineAuthGate").is_visible()
        results["home_cards_without_session"] = await page.locator(".news-card:visible").count()
        results["home_overflow"] = await page.evaluate("() => ({scrollWidth: document.documentElement.scrollWidth, innerWidth, bodyScrollWidth: document.body.scrollWidth})")

        await page.goto(BASE + "/account.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(700)
        results["account_auth_form"] = await page.locator("#authForm").count()
        results["account_profile_hidden"] = await page.locator("#profilePanel").evaluate("el => el.classList.contains('hidden')")
        results["preferences_section"] = await page.locator("#preferencesSection").count()
        results["preferences_save_button"] = await page.locator("#savePreferencesButton").count()

        legal = {}
        for slug in ("privacy", "terms"):
            response = await page.goto(BASE + "/" + slug + ".html", wait_until="domcontentloaded")
            await page.wait_for_timeout(300)
            legal[slug] = {"status": response.status if response else None, "gate": await page.locator("#wrldlineAuthGate").count()}
        results["public_auth_and_legal"] = legal

        mobile = await browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, service_workers="block")
        mobile_page = await mobile.new_page()
        await mobile_page.goto(BASE + "/", wait_until="domcontentloaded")
        await mobile_page.wait_for_timeout(1800)
        results["mobile_gate_visible"] = await mobile_page.locator("#wrldlineAuthGate").is_visible()
        results["mobile_overflow"] = await mobile_page.evaluate("() => ({scrollWidth: document.documentElement.scrollWidth, innerWidth, bodyScrollWidth: document.body.scrollWidth})")
        await mobile.close()
        await context.close()
        await browser.close()

    print(json.dumps({"results": results}, ensure_ascii=False, indent=2))


asyncio.run(main())
