"""Isolated browser QA for the monitor. Run against the local static site on port 4173."""
import asyncio
from datetime import datetime, timedelta, timezone
import os
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

SITE = os.environ.get("WRLDLINE_TEST_SITE", "http://127.0.0.1:4173")
NOW = datetime.now(timezone.utc)


def report(name, code="SAU", level="high", score=70, kind="diplomacy", age=15):
    return {
        "id": name, "title": name, "ai_country_code": code, "country": "Publisher Geography Fixture",
        "ai_risk_level": level, "ai_risk_score": score, "ai_event_type": kind,
        "published_at": (NOW - timedelta(minutes=age)).isoformat(), "summary": "Fixture source summary.",
    }


ROWS = [
    {**report("Critical report", level="critical", score=4),
     "article_translations": [{"lang": "ar", "title": "خبر حرج مترجم"}], "url": "https://source.example/verified"},
    report("Low report", level="low", score=99),
    report("Report in Japan", "JPN", kind="conflict", age=125),
    report("Publisher-only row", None), report("Unknown row", level="unknown"),
    *[report(f"Additional report {n:02d}", "GBR", level="guarded") for n in range(21)],
]


async def context_for(browser, *, width, fail_map=False, first_feed_failed=False):
    state = {"fail_map": fail_map, "feed": 503 if first_feed_failed else 200, "rows": ROWS, "requests": 0}
    context = await browser.new_context(viewport={"width": width, "height": 870}, service_workers="block")

    async def route_request(route):
        url = urlparse(route.request.url)
        if url.netloc == urlparse(SITE).netloc:
            if url.path.endswith(".geojson") and state["fail_map"]:
                await route.fulfill(status=503, body="Boundary asset fixture unavailable")
            else:
                await route.continue_()
        elif url.path.endswith("/rpc/public_world_monitor_feed"):
            state["requests"] += 1
            assert route.request.post_data_json == {"p_hours": 24, "p_limit": 1000}
            await route.fulfill(status=state["feed"], json=state["rows"] if state["feed"] == 200 else {})
        elif url.hostname == "source.example":
            await route.fulfill(status=200, body="Original source fixture")
        else:
            await route.fulfill(status=200, body="")

    await context.route("**/*", route_request)
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    return context, page, state, errors


async def main():
    async with async_playwright() as p:
        executable = os.environ.get("WRLDLINE_CHROMIUM_PATH") or None
        browser = await p.chromium.launch(headless=True, executable_path=executable)
        ctx, page, state, errors = await context_for(browser, width=1440)
        await page.clock.install()
        await page.goto(f"{SITE}/map.html")
        await page.locator('.wrldline-consent [data-choice="denied"]').click(timeout=5000)
        await expect(page.locator("#statEvents")).to_have_text("٢٤")
        await expect(page.locator("#zoomIn")).to_be_enabled()
        await expect(page.locator("#eventList h3").first).to_have_text("خبر حرج مترجم")
        await expect(page.locator("#worldMap path[fill='#7f2753']")).to_have_count(1)
        await expect(page.get_by_text("Publisher Geography Fixture")).to_have_count(0)
        if os.environ.get("WRLDLINE_SCREENSHOTS"):
            await page.screenshot(path="/tmp/wrldline-monitor-desktop.png")
        async with page.expect_popup() as popup:
            await page.locator("#eventList a").first.click()
        original = await popup.value
        await expect(original.locator("body")).to_have_text("Original source fixture")
        await original.close()
        await page.locator("#countryFilter").focus()
        await page.locator("#countryFilter").press("Home")
        await page.locator("#countryFilter").select_option("SAU")
        await expect(page.locator("#statEvents")).to_have_text("٢")
        await expect(page.locator("#countrySummary")).to_contain_text("حرج")
        await expect(page.locator("#worldMap path[fill='#b33f3d']")).to_have_count(0)
        await page.locator("#riskFilter").select_option("low")
        await expect(page.locator("#statHigh")).to_have_text("٠")
        await expect(page.locator("#worldMap path[fill='#3c7b71']")).to_have_count(1)
        await page.locator("#resetFilters").click()
        await page.locator("#timeFilter").select_option("1")
        await expect(page.locator("#statEvents")).to_have_text("٢٣")
        await page.locator("#resetFilters").click()
        await page.locator("#eventTypeFilter").select_option("conflict")
        await expect(page.locator("#eventList h3")).to_have_text(["Report in Japan"])
        await page.locator("#resetFilters").click()
        await page.locator("#worldMap path[fill='#7f2753']").click()
        await expect(page.locator("#countryFilter")).to_have_value("SAU")
        await page.locator("#worldMap path[fill='#7f2753']").click()
        await expect(page.locator("#countryFilter")).to_have_value("all")
        await page.locator("#zoomIn").click()
        await expect(page.locator("#zoomOut")).to_be_enabled()
        await page.locator("#zoomOut").click()
        await expect(page.locator("#zoomOut")).to_be_disabled()
        await page.locator("#zoomIn").click()
        await page.locator("#resetMap").click()
        await expect(page.locator("#zoomOut")).to_be_disabled()
        await page.locator("#showMoreEvents").click()
        await expect(page.locator("#eventList article")).to_have_count(24)
        await page.get_by_role("button", name="Switch to English").click()
        await expect(page.get_by_role("heading", name="World Monitor")).to_be_visible()
        await expect(page.locator("#eventList h3").first).to_have_text("Critical report")
        assert state["requests"] == 1, "A language change should not refetch data"
        await page.get_by_role("button", name="التبديل إلى العربية").click()
        await expect(page.get_by_role("heading", name="مرصد العالم")).to_be_visible()
        await page.set_viewport_size({"width": 375, "height": 812})
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        await expect(page.locator("#zoomIn")).to_be_in_viewport()
        if os.environ.get("WRLDLINE_SCREENSHOTS"):
            await page.screenshot(path="/tmp/wrldline-monitor-mobile.png")
        await page.set_viewport_size({"width": 1440, "height": 870})
        state["feed"] = 503
        await page.clock.fast_forward(61000)
        await expect(page.locator("#updatedAt")).to_contain_text("نعرض آخر بيانات متاحة")
        await expect(page.locator("#eventList article")).to_have_count(24)
        state.update(feed=200, rows=[])
        await page.locator("#retryFeed").click()
        await expect(page.locator("#statEvents")).to_have_text("٠")
        await expect(page.locator("#eventList")).to_contain_text("لا توجد أخبار مصنّفة في الخلاصة")
        assert not errors, errors
        await ctx.close()

        ctx, page, state, errors = await context_for(browser, width=375, fail_map=True, first_feed_failed=True)
        await page.goto(f"{SITE}/map.html?lang=en")
        await page.locator('.wrldline-consent [data-choice="denied"]').click(timeout=5000)
        await expect(page.locator("#mapStatus")).to_contain_text("Map boundaries unavailable")
        await expect(page.locator("#updatedAt")).to_have_text("Classified news could not be loaded.")
        state["feed"] = 200
        await page.locator("#retryFeed").click()
        await expect(page.locator("#statEvents")).to_have_text("24")
        await page.locator("#countryFilter").select_option("JPN")
        await expect(page.locator("#eventList h3")).to_have_text(["Report in Japan"])
        state["fail_map"] = False
        await page.locator("#retryMap").click()
        await expect(page.locator("#mapMessage")).to_be_hidden()
        await expect(page.locator("#countryFilter")).to_have_value("JPN")
        await expect(page.locator("#worldMap path[fill='#b33f3d']")).to_have_count(1)
        assert not errors, errors
        await ctx.close()
        await browser.close()
    print("World Monitor browser QA passed: desktop/mobile, Arabic/English, filters, map, source link, stale feed and independent retries")


if __name__ == "__main__":
    asyncio.run(main())
