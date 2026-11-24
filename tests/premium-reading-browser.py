"""Premium reading modes and evidence desk, with local-only news fixtures."""
import asyncio
import importlib.util
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

edition_spec = importlib.util.spec_from_file_location(
    "edition", Path(__file__).with_name("newsroom-edition-browser.py")
)
edition = importlib.util.module_from_spec(edition_spec)
edition_spec.loader.exec_module(edition)
BASE = edition.SITE.rstrip("/")
PUBLISHED_RIGHTS_CASES = 6


async def home(browser, width):
    context, page, state, errors = await edition.setup(browser, width)
    await edition.open_home(page, "?lang=en")
    display = page.get_by_role("group", name="News display")
    headlines = display.get_by_role("button", name="Headlines")
    cards = display.get_by_role("button", name="Cards")
    grid = page.locator("#newsGrid")
    links = grid.locator(".reader-story-link")
    await expect(links).to_have_count(24)
    await expect(headlines if width < 700 else cards).to_have_attribute("aria-pressed", "true")
    await page.locator("#countryFilter").select_option("SAU")
    await page.locator("#formatFilter").select_option("analysis")
    await expect(links).to_have_count(1)
    await expect(links.first).to_have_text("Saudi railway outlook")
    await page.locator("#loadMoreButton").click()
    await expect(links).to_have_count(2)
    before = await links.all_text_contents()
    requests = state["offsets"].copy()

    await cards.focus()
    await page.keyboard.press("Space")
    await expect(cards).to_be_focused()
    await expect(cards).to_have_attribute("aria-pressed", "true")
    await expect(grid.locator(".reader-card .card-content > p").first).to_be_visible()
    await headlines.click()
    await expect(headlines).to_have_attribute("aria-pressed", "true")
    await expect(grid.locator(".reader-card .card-content > p").first).to_be_hidden()
    await expect(grid.locator(".reader-card .story-source").first).to_be_visible()
    save = grid.locator(".reader-card .card-save").first
    await expect(save).to_be_visible()
    assert await links.all_text_contents() == before
    assert state["offsets"] == requests
    await expect(page.locator("#countryFilter")).to_have_value("SAU")
    await expect(page.locator("#formatFilter")).to_have_value("analysis")
    assert await page.evaluate("document.documentElement.scrollWidth === innerWidth")
    await save.click()
    await expect(save).to_have_attribute("aria-pressed", "true")
    await cards.click()
    await expect(save).to_have_attribute("aria-pressed", "true")
    await headlines.click()
    await links.first.click()
    await expect(page.locator("#articleModal")).to_be_visible()
    await page.keyboard.press("Escape")
    await expect(links.first).to_be_focused()
    await page.reload()
    await expect(headlines).to_have_attribute("aria-pressed", "true")
    await page.locator("#languageButton").click()
    await expect(page.get_by_role("group", name="طريقة عرض الأخبار").get_by_role("button", name="عناوين")).to_have_attribute("aria-pressed", "true")
    await page.locator("#themeButton").click()
    await expect(page.locator("html")).to_have_attribute("data-theme", "dark")
    assert await page.evaluate("document.documentElement.scrollWidth === innerWidth")
    assert not errors, errors
    await context.close()


async def dossiers(browser, width):
    context = await browser.new_context(
        viewport={"width": width, "height": 850}, has_touch=width < 700,
        service_workers="block", reduced_motion="reduce", color_scheme="dark" if width == 320 else "light"
    )
    page = await context.new_page()
    requests = []
    page.on("request", lambda req: requests.append(req.url))
    await page.goto(f"{BASE}/rights-cases/index.html")
    cards = page.locator(".hn-card:visible")
    await expect(cards).to_have_count(PUBLISHED_RIGHTS_CASES)
    await page.get_by_role("searchbox").fill("الاردن")
    await expect(cards).to_have_count(2)
    await page.get_by_label("الموضوع").select_option(label="الخصوصية الرقمية")
    await expect(cards).to_have_count(1)
    await expect(cards.first).to_contain_text("الاستهداف الرقمي")
    await page.get_by_role("searchbox").fill("لا يوجد هذا الملف")
    await expect(page.locator("#caseEmpty")).to_be_visible()
    reset = page.get_by_role("button", name="مسح البحث")
    await (reset.tap() if width < 700 else reset.click())
    await expect(page.get_by_role("searchbox")).to_be_focused()
    await expect(cards).to_have_count(PUBLISHED_RIGHTS_CASES)
    assert await page.evaluate("document.documentElement.scrollWidth === innerWidth")

    await page.locator('.hn-card a[href="jordan-expression.html"]').click()
    nav = page.get_by_role("navigation", name="داخل الملف")
    timeline = nav.get_by_role("link", name="التسلسل الزمني")
    await timeline.focus()
    await page.keyboard.press("Enter")
    await expect(timeline).to_have_attribute("aria-current", "location")
    await expect(page.locator("#timeline")).to_be_focused()
    ref = page.locator("#timeline .hn-refs a").first
    await ref.click()
    await expect(nav.get_by_role("link", name="المصادر")).to_have_attribute("aria-current", "location")
    target = await ref.get_attribute("href")
    assert page.url.endswith(target)
    assert await page.locator(target).evaluate("(e) => e.getBoundingClientRect().top >= document.querySelector('.hn-case-nav').getBoundingClientRect().bottom")
    await page.locator("#followup").evaluate("(e) => e.scrollIntoView()")
    await expect(nav.get_by_role("link", name="المتابعة")).to_have_attribute("aria-current", "location")
    assert await page.evaluate("document.documentElement.scrollWidth === innerWidth")
    assert all(urlparse(url).netloc == urlparse(BASE).netloc for url in requests), requests
    await context.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get("WRLDLINE_CHROMIUM_PATH") or None)
        for width in (320, 375, 1440):
            await home(browser, width)
        for width in (320, 375, 1440):
            await dossiers(browser, width)
        context = await browser.new_context(java_script_enabled=False, viewport={"width": 320, "height": 740})
        page = await context.new_page()
        await page.goto(f"{BASE}/rights-cases/index.html")
        await expect(page.locator(".hn-card:visible")).to_have_count(PUBLISHED_RIGHTS_CASES)
        await expect(page.locator(".hn-filter")).to_be_hidden()
        await page.locator('.hn-card a[href="jordan-expression.html"]').click()
        await page.get_by_role("navigation", name="داخل الملف").get_by_role("link", name="الأدلة").click()
        await expect(page.locator("#evidence")).to_be_in_viewport()
        await browser.close()
        print("Premium reading modes and evidence desk passed")


if __name__ == "__main__":
    asyncio.run(main())
