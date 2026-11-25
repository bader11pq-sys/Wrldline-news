"""Exercise the public front page with isolated newsroom and monitor fixtures."""
import asyncio
from datetime import datetime, timedelta, timezone
import os
from urllib.parse import parse_qs, urlparse

from playwright.async_api import Error, async_playwright, expect

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
CURRENT_EXCLUSIVE = story(31, "Transit engineers release original survey", "GBR",
                          is_exclusive=True)
OLDER_EXCLUSIVE = {**story(32, "Earlier report from the transport desk", "GBR", is_exclusive=True),
                   "published_at": (NOW - timedelta(days=3)).isoformat()}
CURRENT_BREAKING = {**story(33, "أعلن مجلس المدينة إغلاق الطريق", "GBR",
                            source_name="Breaking Desk", source_language="ar", is_breaking=True,
                            lang="ar"),
                    "published_at": (NOW - timedelta(minutes=2)).isoformat()}


async def setup(browser, width, *, monitor_mode="ready", home_failure=False):
    context = await browser.new_context(viewport={"width": width, "height": 850},
                                        service_workers="block", reduced_motion="reduce")
    state = {"monitor_mode": monitor_mode, "home_failure": home_failure, "offsets": [], "first": FIRST,
             "sections": {}, "section_requests": [], "section_gates": {}, "measurement": [],
             "source_response": (200, []), "main_gate": None}

    async def section_response(route, name):
        state["section_requests"].append(name)
        status, body = state["sections"].get(name, (200, []))
        gate = state["section_gates"].get(name)
        if gate:
            await gate.wait()
        await route.fulfill(status=status, json=body)

    async def route_request(route):
        url = urlparse(route.request.url)
        if url.netloc == urlparse(SITE).netloc:
            await route.continue_()
        elif "/audience-collector" in url.path or "analytics" in url.netloc:
            state["measurement"].append(url.path)
            await route.fulfill(status=200, json={})
        elif url.path.endswith("/rpc/public_source_directory"):
            status, body = state["source_response"]
            await route.fulfill(status=status, json=body)
        elif url.path.endswith("/rpc/public_world_monitor_feed"):
            unavailable = state["monitor_mode"] == "error"
            await route.fulfill(status=503 if unavailable else 200,
                                json=MONITOR if state["monitor_mode"] == "ready" else [])
        elif url.path.endswith("/rpc/public_breaking_feed"):
            await section_response(route, "breaking")
        elif url.path.endswith("/rpc/public_exclusive_feed"):
            await section_response(route, "exclusive")
        elif url.path.endswith("/rpc/public_home_news_recent_v3"):
            args = route.request.post_data_json
            name = next((label for key, label in (("p_newsdata_only", "dedicated"),
                                                 ("p_is_breaking", "breaking"),
                                                 ("p_is_exclusive", "exclusive")) if args.get(key)), None)
            if name:
                await section_response(route, name)
            else:
                state["offsets"].append(args["p_offset"])
                if state["main_gate"]:
                    await state["main_gate"].wait()
                    try:
                        await route.abort()
                    except Error:
                        pass  # Chrome already cancelled this timed-out request.
                    return
                await route.fulfill(status=503 if state["home_failure"] else 200,
                                    json=OLDER if args["p_offset"] else state["first"])
        elif url.path.endswith("/rpc/public_top_read_articles"):
            await section_response(route, "popular")
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


async def check_cold_home_and_sources(browser):
    for width in (320, 375, 390, 1440):
        context, page, state, errors = await setup(browser, width)
        gate = asyncio.Event()
        state["main_gate"] = gate
        state["sections"].update(exclusive=(200, [CURRENT_EXCLUSIVE, {**OLDER_EXCLUSIVE, "audience_lane": "excluded"}]),
                                 breaking=(200, [CURRENT_BREAKING]), popular=(200, [FIRST[1]]))
        try:
            await page.goto(f"{SITE}/?lang=en", wait_until="domcontentloaded")
            starter = page.locator("#newsStarter")
            consent = page.locator("#homePrivacyControls .wrldline-consent")
            await expect(starter.locator("a")).to_have_count(3)
            assert await starter.locator("a").first.get_attribute("href") == "/dossier/opec-plus-december-2026.html"
            await expect(consent).to_have_css("position", "static")
            assert await page.evaluate("!document.activeElement.closest('.wrldline-consent')")
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            await expect(page.locator("#breakingNewsGrid")).to_contain_text(CURRENT_BREAKING["title"])
            if width != 320:
                continue
            retry = page.locator("#newsGrid [data-reader-action=retry]")
            await expect(retry).to_be_visible(timeout=12000)
            assert state["offsets"] == [0, 0], state["offsets"]
            await expect(page.locator("#newsGrid")).to_have_attribute("aria-busy", "false")
            await expect(page.locator("#exclusiveNewsGrid")).to_contain_text(CURRENT_EXCLUSIVE["title"])
            await expect(page.locator("#exclusiveNewsGrid")).not_to_contain_text(OLDER_EXCLUSIVE["title"])
            await expect(page.locator("#popularStoriesGrid")).to_contain_text(FIRST[1]["title"])
            await expect(page.locator("#coverageGapGrid")).to_contain_text("تعذر تحميل عينة الأخبار")
            await expect(starter).to_be_visible()
            assert not state["measurement"], state["measurement"]
            state["main_gate"] = None
            gate.set()
            await retry.focus()
            await retry.press("Enter")
            await expect(page.locator("#newsSection")).to_be_focused()
            await expect(starter).to_be_hidden()
            privacy = page.locator(".wrldline-privacy-settings")
            await privacy.click()
            await page.keyboard.press("Escape")
            await expect(privacy).to_be_focused()
            await privacy.click()
            await page.locator('.wrldline-consent [data-choice="denied"]').click()
            await expect(privacy).to_be_focused()
            assert not state["measurement"], state["measurement"]
            assert not errors, errors
        finally:
            gate.set()
            await context.close()

    context, page, state, errors = await setup(browser, 320)
    try:
        state["source_response"] = (503, {})
        await page.goto(f"{SITE}/sources.html")
        await expect(page.locator("#sourceStats")).to_contain_text("تعذر تحميل دليل المصادر")
        await expect(page.locator("#sourceGrid a")).to_have_attribute("href", "/news/")
        await expect(page.locator("#sourceSearch")).to_be_disabled()
        state["source_response"] = (200, [
            {"source_name": "الأخبار التجريبية", "source_language": "ar", "source_scope": "regional",
             "article_count": 2, "latest_published_at": NOW.isoformat(), "source_url": "https://publisher.example/feed"},
            {"source_name": "Example Journal", "source_language": "en", "source_scope": "local",
             "article_count": 1, "latest_published_at": "not-a-timestamp"},
            {"source_name": "Future Desk", "latest_published_at": (NOW + timedelta(days=2)).isoformat()},
        ])
        await page.locator("#sourceRetry").click()
        await expect(page.locator("#sourceSearch")).to_be_focused()
        await expect(page.locator(".source-card")).to_have_count(3)
        await expect(page.locator(".source-card time")).to_have_count(1)
        await expect(page.locator("#sourceStats")).to_contain_text("آخر فحص للعينة (الرياض)")
        await page.locator("#sourceSearch").fill("العَرَبيَّة")
        await expect(page.locator(".source-card h2")).to_have_text("الأخبار التجريبية")
        await expect(page.locator(".source-card a")).to_have_attribute("href", "https://publisher.example/feed")
        await page.locator("#sourceScope").select_option("local")
        await expect(page.locator("#sourceStats")).to_contain_text("لا توجد مصادر تطابق التصفية")
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not errors, errors
    finally:
        await context.close()


async def check_supplemental_sections(browser):
    context, page, state, errors = await setup(browser, 390)
    try:
        state["sections"].update(breaking=(503, []),
                                 exclusive=(200, [CURRENT_EXCLUSIVE, OLDER_EXCLUSIVE,
                                                  {**FIRST[0], "is_exclusive": True},
                                                  {**story(34, "Alternate title for first-batch coverage", "GBR", is_exclusive=True),
                                                   "published_at": NOW.isoformat(), "url": FIRST[1]["url"] + "#details"}]),
                                 popular=(200, [FIRST[1]]))
        state["section_gates"]["exclusive"] = asyncio.Event()
        await open_home(page, "?lang=en")
        await expect(page.locator("#newsGrid .reader-story-link")).to_have_count(24)
        await expect(page.locator("#popularStoriesGrid")).to_contain_text("Saudi trade report", timeout=2000)
        await expect(page.locator("#exclusiveNewsGrid")).to_have_text("Loading exclusive stories…")
        await expect(page.locator("#breakingFeedNotice")).to_contain_text("This section could not load.")
        state["section_gates"].pop("exclusive").set()
        await expect(page.locator("#exclusiveNewsGrid")).to_contain_text(CURRENT_EXCLUSIVE["title"])
        missed = page.locator("#missedNewsGrid")
        await expect(missed).to_contain_text("This list may be incomplete.")
        await expect(missed.locator("h3")).to_have_text([CURRENT_EXCLUSIVE["title"]])
        assert "dedicated" not in state["section_requests"], state["section_requests"]

        state["sections"]["breaking"] = (200, [CURRENT_BREAKING])
        retry = page.locator("#breakingFeedNotice button")
        state["section_gates"]["breaking"] = asyncio.Event()
        await retry.focus()
        await retry.press("Enter")
        await expect(retry).to_have_attribute("aria-disabled", "true")
        await retry.press("Enter")
        state["section_gates"].pop("breaking").set()
        await expect(page.locator("#breakingNewsGrid")).to_contain_text(CURRENT_BREAKING["title"])
        await expect(page.locator("#breakingFeedNotice")).to_be_hidden()
        await expect(page.locator("#breakingHeading")).to_be_focused()
        await expect(missed).not_to_contain_text("This list may be incomplete.")
        assert state["offsets"] == [0], state["offsets"]
        assert state["section_requests"].count("breaking") == 2, state["section_requests"]

        state["sections"]["popular"] = (200, {"unexpected": "not an array"})
        await page.locator("#feedRefreshButton").click()
        await expect(page.locator("#popularFeedNotice")).to_contain_text("Showing available stories.")
        await expect(page.locator("#popularStoriesGrid")).to_contain_text("Saudi trade report")
        await expect(page.locator("#connectionLabel")).to_have_text("News feed loaded")
        state["sections"]["popular"] = (200, [])
        await page.locator("#popularFeedNotice button").click()
        await expect(page.locator("#popularStoriesGrid")).to_have_text("Not enough reading data yet.")
        await expect(page.locator("#popularFeedNotice")).to_be_hidden()

        state["sections"]["exclusive"] = (503, [])
        await open_home(page, "?lang=ar")
        await expect(page.locator("#exclusiveFeedNotice button")).to_have_text("إعادة محاولة تحميل القسم")
        await expect(page.locator("#exclusiveFeedNotice")).to_contain_text("تعذّر تحميل هذا القسم.")
        await expect(page.locator("#exclusiveNewsGrid")).to_be_empty()
        assert not errors, errors
    finally:
        for gate in state["section_gates"].values():
            gate.set()
        await context.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=os.environ.get("WRLDLINE_CHROMIUM_PATH") or None)
        await check_cold_home_and_sources(browser)
        await check_supplemental_sections(browser)
        context, page, state, errors = await setup(browser, 1440)
        await open_home(page, "?lang=en")
        cards = page.locator("#newsGrid .reader-story-link")
        await expect(cards).to_have_count(24)
        await expect(page.locator("#connectionLabel")).to_have_text("News feed loaded")
        await expect(page.locator("#lastUpdated")).to_contain_text("Latest story in the feed:")
        await expect(page.locator("#lastUpdated")).to_contain_text("Last successful load:")
        await expect(page.locator(".wl-nav-scroll a[href='sections.html']")).to_have_text("Explore", use_inner_text=True)
        await expect(page.locator("#moreMenu a[href='analysis.html']")).to_have_text("الفهم والتحليل")
        await expect(page.locator("#moreButton")).to_have_text("More", use_inner_text=True)
        await expect(page.get_by_role("button", name="Load older news")).to_be_enabled()
        if os.environ.get("WRLDLINE_SCREENSHOTS"):
            await page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
            await page.screenshot(path="/tmp/wrldline-edition-home-desktop.png")
        await expect(page.locator("#homeExtras .edition-monitor")).to_be_hidden()
        await expect(page.locator('#signalHub a[href="analysis.html#tools"]')).to_be_visible()
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
        await expect(dialog.locator("[data-reader-step] > h2")).to_have_text(
            ["What happened?", "What do we know?", "What is the source?", "Further details and references"])
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
            extras = page.locator("#homeExtras > summary")
            await extras.evaluate("(el) => el.scrollIntoView({block:'center',behavior:'instant'})")
            await extras.click()
            await page.locator(".edition-monitor").scroll_into_view_if_needed()
            await expect(page.locator("#editionMonitorStatus")).to_contain_text(text)
            if mode == "error":
                await expect(page.locator("#editionMonitorMetrics")).to_be_hidden()
                state["monitor_mode"] = "ready"
                await page.locator("#editionMonitorRetry").click()
                await expect(page.locator("#editionMonitorTime")).to_contain_text("Feed checked (Riyadh)")
                await expect(page.locator("#editionMonitorLink")).to_be_focused()
            else:
                await expect(page.locator("#editionReportCount")).to_have_text("0")
            if mode == "empty":
                await expect(page.locator("#heroLayout .front-pick-link")).to_have_count(5)
                await expect(page.locator("#newsGrid")).to_contain_text("We could not load the news")
                await expect(page.locator("#lastUpdated")).to_have_text("Update unavailable")
                state["home_failure"] = False
                await page.locator("#newsGrid [data-reader-action=retry]").click()
            await expect(page.locator("#newsGrid .reader-story-link")).to_have_count(24)
            await page.get_by_role("button", name="التبديل إلى العربية").click()
            await expect(page.locator("#editionMonitorTitle")).to_have_text("مرصد العالم")
            if mode == "empty":
                await expect(page.locator("#editionReportCount")).to_have_text("0")
            await page.locator("#themeButton").click()
            await expect(page.locator("html")).to_have_attribute("data-theme", "dark")
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            if os.environ.get("WRLDLINE_SCREENSHOTS") and mode == "error":
                await page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
                await page.screenshot(path="/tmp/wrldline-edition-home-mobile.png")
            assert not errors, errors
            await context.close()

        context, page, state, errors = await setup(browser, 375)
        state["first"] = [{**FIRST[0], "published_at": (NOW - timedelta(hours=9)).isoformat()}]
        await open_home(page, "?lang=en")
        cards = page.locator("#newsGrid .reader-story-link")
        refresh = page.locator("#feedRefreshButton")
        meta = page.locator("#lastUpdated")
        await expect(cards).to_have_count(1)
        await expect(meta).to_contain_text("No new stories in the past 6 hours.")
        old_meta = await meta.text_content()
        await expect(refresh).not_to_have_attribute("aria-busy", "true")
        state["home_failure"] = True
        await refresh.click()
        await expect(meta).to_have_text("Refresh failed; showing last loaded news. " + old_meta)
        await expect(cards).to_have_count(1)
        await expect(refresh).not_to_have_attribute("aria-busy", "true")

        state["home_failure"], state["first"] = False, []
        await refresh.click()
        await expect(meta).to_contain_text("The feed contains no stories")
        await expect(cards).to_have_count(0)
        await expect(refresh).not_to_have_attribute("aria-busy", "true")
        state["first"] = [{**FIRST[0], "published_at": None}]
        await refresh.click()
        await expect(meta).to_contain_text("Latest publication date unavailable")
        await expect(cards).to_have_count(1)
        await expect(refresh).not_to_have_attribute("aria-busy", "true")
        state["first"] = FIRST
        await refresh.click()
        await expect(meta).to_contain_text("Latest story in the feed:")
        await expect(meta).not_to_contain_text("No new stories")
        await page.get_by_role("button", name="التبديل إلى العربية").click()
        await expect(meta).to_contain_text("أحدث مادة في الموجز:")
        await expect(meta).to_contain_text("آخر تحميل ناجح:")
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not errors, errors
        await context.close()
        await browser.close()
    print("Newsroom edition QA passed: filters, pagination, sources, search, languages, mobile, and recent/quiet/empty/undated/failing feeds with recovery")


if __name__ == "__main__":
    asyncio.run(main())
