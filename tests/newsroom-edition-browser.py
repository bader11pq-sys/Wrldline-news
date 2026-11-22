"""Exercise the public front page with isolated newsroom and monitor fixtures."""
import asyncio
from datetime import datetime, timedelta, timezone
import os
from urllib.parse import parse_qs, urlparse

from playwright.async_api import async_playwright, expect

SITE = os.environ.get("WRLDLINE_TEST_SITE", "http://127.0.0.1:4173")
NOW = datetime.now(timezone.utc)


def story(index, title, event_country, kind="news", category="economy", **fields):
    return {
        "id": f"00000000-0000-4000-8000-{index:012d}", "title": title,
        "summary": "This summary describes a fictional report for isolated browser testing.",
        "published_at": (NOW - timedelta(minutes=index + 2)).isoformat(),
        "lang": "en", "source_language": "en", "source_name": "Example Journal",
        "category": category, "content_type": kind, "event_country": event_country,
        "country": "Saudi Arabia", "ai_country_code": "SAU",
        "editorial_status": "published", "url": f"https://publisher.example/story/{index}", **fields,
    }


FIRST = [
    story(1, "Saudi railway outlook", "السعودية", "analysis"),
    story(2, "Saudi trade report", "Saudi Arabia"),
    story(3, "Japanese market outlook", "Japan", "analysis"),
    story(4, "Regional market outlook", "International", "analysis"),
    story(5, "Sponsored transport announcement", "SAU", "sponsored", sponsor_name="Example Sponsor"),
    *[story(n, f"Technology desk report {n:02d}", "GBR", category="tech") for n in range(6, 25)],
]
OLDER = [story(25, "Earlier railway analysis", "SA", "analysis")]
MONITOR = [{**FIRST[0], "ai_event_type": "market", "ai_risk_level": "low", "ai_risk_score": 18}]


async def setup(browser, width, *, monitor_mode="ready", home_failure=False):
    context = await browser.new_context(viewport={"width": width, "height": 850},
                                        service_workers="block", reduced_motion="reduce")
    state = {"monitor_mode": monitor_mode, "home_failure": home_failure, "offsets": []}

    async def route_request(route):
        url = urlparse(route.request.url)
        if url.netloc == urlparse(SITE).netloc:
            await route.continue_()
        elif url.path.endswith("/rpc/public_world_monitor_feed"):
            unavailable = state["monitor_mode"] == "error"
            await route.fulfill(status=503 if unavailable else 200,
                                json=MONITOR if state["monitor_mode"] == "ready" else [])
        elif url.path.endswith("/rpc/public_home_news_recent_v3"):
            args = route.request.post_data_json
            primary = not any(args.get(name) for name in ("p_newsdata_only", "p_is_breaking", "p_is_exclusive"))
            if primary:
                state["offsets"].append(args["p_offset"])
            await route.fulfill(status=503 if primary and state["home_failure"] else 200,
                                json=(OLDER if args["p_offset"] else FIRST) if primary else [])
        else:
            await route.fulfill(status=200, body="")

    await context.route("**/*", route_request)
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    return context, page, state, errors


async def open_home(page, query=""):
    await page.goto(f"{SITE}/index.html{query}")
    deny = page.locator('.wrldline-consent [data-choice="denied"]')
    if await deny.is_visible():
        await deny.click()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=os.environ.get("WRLDLINE_CHROMIUM_PATH") or None)
        context, page, state, errors = await setup(browser, 1440)
        await open_home(page, "?lang=en")
        cards = page.locator("#newsGrid .reader-story-link")
        await expect(cards).to_have_count(24)
        await expect(page.locator(".wl-nav-scroll")).to_contain_text("Event files")
        await expect(page.locator(".editorial-focus")).to_contain_text("Coverage priorities")
        await expect(page.locator(".editorial-focus")).to_contain_text("Trade and shipping")
        await expect(page.get_by_role("button", name="Load older news")).to_be_enabled()
        if os.environ.get("WRLDLINE_SCREENSHOTS"):
            await page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
            await page.screenshot(path="/tmp/wrldline-edition-home-desktop.png")
        await page.locator(".edition-monitor").scroll_into_view_if_needed()
        await expect(page.locator("#editionReportCount")).to_have_text("1")
        await expect(page.locator("#editionHighCount")).to_have_text("0")
        await expect(page.locator("#editionMonitorStatus")).to_contain_text("not country safety")
        if os.environ.get("WRLDLINE_SCREENSHOTS"):
            await page.screenshot(path="/tmp/wrldline-edition-home-snapshot.png")
        await page.locator("#countryFilter").select_option("SAU")
        await page.locator("#formatFilter").select_option("analysis")
        await page.locator("#sortFilter").select_option("oldest")
        await expect(cards).to_have_text(["Saudi railway outlook"])
        assert parse_qs(urlparse(page.url).query) == {
            "country": ["SAU"], "format": ["analysis"], "lang": ["en"], "sort": ["oldest"],
        }
        await page.reload()
        await expect(cards).to_have_text(["Saudi railway outlook"])
        await expect(page.locator("#newsGrid .content-analysis")).to_have_text("Analysis")
        await page.locator("#loadMoreButton").click()
        await expect(cards).to_have_text(["Earlier railway analysis", "Saudi railway outlook"])
        assert 24 in state["offsets"]
        trigger = cards.filter(has_text="Saudi railway outlook")
        await trigger.click()
        dialog = page.locator("#articleModal")
        await expect(dialog.locator("h1")).to_have_text("Saudi railway outlook")
        await expect(dialog.locator(".story-country")).to_have_text("Saudi Arabia")
        await expect(dialog.locator(".source-box strong")).to_have_text("Example Journal")
        await expect(dialog.locator(".source-box a")).to_have_attribute("href", FIRST[0]["url"])
        await expect(dialog.locator(".edition-related > a")).to_have_attribute("href", "map.html?country=SAU&lang=en")
        await expect(dialog.locator(".edition-related")).not_to_contain_text("Sponsored transport announcement")
        await dialog.locator(".edition-related").get_by_role("button", name="Saudi trade report", exact=False).click()
        await expect(dialog.locator("h1")).to_have_text("Saudi trade report")
        await page.go_back()
        await expect(dialog.locator("h1")).to_have_text("Saudi railway outlook")
        await dialog.locator("#modalSave").click()
        await expect(dialog.locator("#modalSave")).to_contain_text("Remove saved")
        await page.keyboard.press("Escape")
        await expect(trigger).to_be_focused()
        await page.locator("#formatFilter").select_option("sponsored")
        await cards.first.click()
        await expect(dialog.locator(".sponsor-disclosure")).to_contain_text("Example Sponsor")
        await page.keyboard.press("Escape")
        await page.locator("#clearEditionFilters").click()
        assert parse_qs(urlparse(page.url).query) == {"lang": ["en"]}
        await expect(page.locator("#formatFilter")).to_have_value("all")
        await page.locator("#searchButton").click()
        await page.locator("#searchInput").fill("Japanese")
        await page.locator("#searchInput").press("Enter")
        await expect(dialog.locator("h1")).to_have_text("Japanese market outlook")
        await page.keyboard.press("Escape")
        await expect(page.locator("#searchButton")).to_be_focused()
        assert not errors, errors
        await context.close()

        for mode, text in [("empty", "no classified reports"), ("error", "snapshot is unavailable")]:
            context, page, state, errors = await setup(browser, 375, monitor_mode=mode, home_failure=(mode == "empty"))
            await open_home(page, "?lang=en")
            await page.locator(".edition-monitor").scroll_into_view_if_needed()
            await expect(page.locator("#editionMonitorStatus")).to_contain_text(text)
            if mode == "error":
                await expect(page.locator("#editionMonitorMetrics")).to_be_hidden()
            else:
                await expect(page.locator("#editionReportCount")).to_have_text("0")
            if mode == "empty":
                await expect(page.locator("#heroLayout .front-pick-link")).to_have_count(5)
                await expect(page.locator("#newsGrid")).to_contain_text("We could not load the news")
                state["home_failure"] = False
                await page.locator("#newsGrid [data-reader-action=retry]").click()
            await expect(page.locator("#newsGrid .reader-story-link")).to_have_count(24)
            await page.get_by_role("button", name="التبديل إلى العربية").click()
            await expect(page.locator("#editionMonitorTitle")).to_have_text("مرصد العالم")
            await page.locator("#themeButton").click()
            await expect(page.locator("html")).to_have_attribute("data-theme", "dark")
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            if os.environ.get("WRLDLINE_SCREENSHOTS") and mode == "error":
                await page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
                await page.screenshot(path="/tmp/wrldline-edition-home-mobile.png")
            assert not errors, errors
            await context.close()
        await browser.close()
    print("Newsroom edition QA passed: filters, reload, pagination, source and sponsor labels, related history, save, search, languages, theme and independent feeds")


if __name__ == "__main__":
    asyncio.run(main())
