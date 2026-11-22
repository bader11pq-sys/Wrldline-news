"""Verify source-backed reading paths and their connection to the newsroom."""
import asyncio
import os
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

SITE = os.environ.get("WRLDLINE_TEST_SITE", "http://127.0.0.1:4173").rstrip("/")
ORIGIN = urlparse(SITE).netloc


async def isolate(route):
    target = urlparse(route.request.url)
    if target.netloc == ORIGIN:
        await route.continue_()
    elif (target.hostname or "").endswith("supabase.co"):
        await route.fulfill(json=[], headers={"access-control-allow-origin": "*"})
    else:
        await route.fulfill(status=200, body="")


async def main():
    async with async_playwright() as p:
        executable = os.environ.get("WRLDLINE_CHROMIUM_PATH") or None
        browser = await p.chromium.launch(headless=True, executable_path=executable)
        desktop = await browser.new_context(viewport={"width": 1366, "height": 850}, reduced_motion="reduce", service_workers="block")
        await desktop.route("**/*", isolate)
        page = await desktop.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(f"{SITE}/history.html")
        await expect(page.locator(".rp-card")).to_have_count(4)
        await expect(page.locator("#featuredGrid h3").first).to_be_visible()
        search = page.locator("#historySearch")
        await search.fill("السُّوَيْس ١٨٦٩")
        result = page.locator("#historySearchResults a").first
        await expect(result).to_have_attribute("href", "reading.html#suez")
        await search.press("Tab")
        await expect(result).to_be_focused()
        await result.press("Escape")
        await expect(search).to_be_focused()
        await expect(page.locator("#historySearchResults")).to_be_hidden()
        await search.fill("cErN")
        await expect(result).to_have_attribute("href", "reading.html#web")
        await search.fill("السُّوَيْس ١٨٦٩")
        await search.press("Tab")
        await result.press("Enter")
        await expect(page).to_have_url(f"{SITE}/reading.html#suez")
        await expect(page.locator(":target")).to_have_attribute("id", "suez")
        await expect(page.locator("#suez .rp-milestones dt")).to_have_count(3)
        await page.locator("#suez summary").press("Space")
        await expect(page.locator("#suez details p")).to_be_visible()
        await page.locator("#suez a[href='history-dossier.html?id=eg']").click()
        await expect(page).to_have_url(f"{SITE}/history-dossier.html?id=eg")
        await expect(page.locator("main h1")).to_contain_text("مصر")
        await page.goto(f"{SITE}/reading.html#suez")
        await page.locator("#themeButton").click()
        await expect(page.locator("html")).to_have_attribute("data-theme", "dark")
        await page.reload()
        await expect(page.locator("html")).to_have_attribute("data-theme", "dark")
        await page.locator("#suez a[href='impact.html#shipping-guide']").click()
        await expect(page.locator(":target")).to_have_attribute("id", "shipping-guide")
        await expect(page.locator("#nrRoot [data-impact]").first).to_be_visible()
        for desk, slug, dataset in [("context", "diriyah", "ctx"), ("explainers", "web", "exp")]:
            await page.goto(f"{SITE}/{desk}.html")
            await expect(page.locator(f"#nrRoot [data-{dataset}]").first).to_be_visible()
            await page.locator(f"a.rp-card[href='reading.html#{slug}']").click()
            await expect(page.locator(":target")).to_have_attribute("id", slug)
        assert not errors, errors
        await desktop.close()

        mobile = await browser.new_context(viewport={"width": 375, "height": 800}, has_touch=True, reduced_motion="reduce", service_workers="block")
        await mobile.route("**/*", isolate)
        await mobile.add_init_script("localStorage.setItem('wrldline:language', 'en')")
        phone = await mobile.new_page()
        for section in ["history.html", "context.html", "explainers.html", "impact.html", "reading.html#rosetta"]:
            await phone.goto(f"{SITE}/{section}")
            await expect(phone.locator(".rp-promo, .rp-page")).to_have_attribute("dir", "rtl")
            assert await phone.evaluate("document.documentElement.scrollWidth === innerWidth"), section
        await expect(phone.locator("html")).to_have_attribute("dir", "ltr")
        await phone.locator("#rosetta summary").tap()
        await expect(phone.locator("#rosetta details p")).to_be_visible()
        await mobile.close()

        static = await browser.new_context(java_script_enabled=False, reduced_motion="reduce", service_workers="block")
        await static.route("**/*", isolate)
        static_page = await static.new_page()
        await static_page.goto(f"{SITE}/reading.html")
        await static_page.locator("#reading-index a[href='#web']").click()
        await expect(static_page.locator(":target h2")).to_contain_text("نشأة الويب")
        await expect(static_page.locator("#web a[href^='https://home.cern']")).to_be_visible()
        await static_page.locator("#web summary").press("Space")
        await expect(static_page.locator("#web details p")).to_be_visible()
        await static.close()
        await browser.close()
    print("Reading paths QA passed: newsroom routes, atlas links, search, keyboard, theme, mobile RTL and no-JS reading")


asyncio.run(main())
