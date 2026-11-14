import asyncio
import json
from playwright.async_api import async_playwright


async def run(mode):
    events = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/chromium")
        context = await browser.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
        await context.add_init_script("window.WRLDLINE_ANALYTICS_CONFIG={ga4MeasurementId:'',endpoint:'http://127.0.0.1:4173/__analytics'};")

        async def route(request):
            try:
                if request.request.post_data:
                    events.append(json.loads(request.request.post_data))
            except Exception:
                pass
            await request.fulfill(status=204, body="")

        await context.route("**/__analytics", route)
        page = await context.new_page()
        await page.goto("http://127.0.0.1:4173/account.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(1000)
        banner = page.locator(".wrldline-consent")
        before = len(events)
        if await banner.count() and await page.locator(f'.wrldline-consent [data-consent="{mode}"]').count():
            await page.locator(f'.wrldline-consent [data-consent="{mode}"]').click()
            await page.wait_for_timeout(500)
        after = len(events)
        await browser.close()
        return {"mode": mode, "before_click": before, "after_click": after, "events": [e.get("event") for e in events]}


async def main():
    print(json.dumps([await run("granted"), await run("denied")], ensure_ascii=False, indent=2))


asyncio.run(main())
