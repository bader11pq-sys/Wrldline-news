"""Verify WRLDLINE Shorts against isolated news and native browser audio."""
import asyncio
import os
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

SITE = os.environ.get("WRLDLINE_TEST_SITE", "http://127.0.0.1:4173").rstrip("/")
ORIGIN = urlparse(SITE).netloc
TRACKS = ["tension-theme", "briefing-pulse", "analysis-desk", "world-in-focus"]
STORIES = [
    {
        "id": f"10000000-0000-4000-9000-{index + 1:012}",
        "title": f"عنوان الخبر {index + 1}",
        "summary": "ملخص الخبر من غرفة الأخبار وشرح موجز للسياق.",
        "source_name": "WRLDLINE NEWS",
        "source_url": "https://news.example.test/source",
        "image_url": "https://media.example.test/video.webm" if index == 1 else
                     "https://media.example.test/missing.webp" if index == 0 else None,
        "media_type": "video" if index == 1 else "image",
        "lang": "ar",
        "category": "world",
        "is_breaking": index == 0,
        "published_at": f"2026-11-21T10:{59 - index:02}:00Z",
        "article_translations": [
            {"lang": "en", "title": "Human-edited headline", "summary": "A reviewed edition.",
             "translation_status": "published", "translation_source": "editorial"}
            if index == 0 else
            {"lang": "en", "title": "Unapproved automatic copy", "summary": "Should never appear.",
             "translation_status": "published", "translation_source": "ai"}
        ],
    }
    for index in range(26)
]

INIT = """
  localStorage.setItem('wrldline:analytics-consent-v2',
    JSON.stringify({version: 2, state: 'denied', expires: Date.now() + 86400000}));
  window.Audio = new Proxy(Audio, {
    construct(NativeAudio, options) {
      return window.testAudio = Reflect.construct(NativeAudio, options);
    }
  });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: async (data) => { window.sharedArticle = data.url; }
  });
"""


def fixture(requests, *, unavailable=None, fail_first=False, fail_more=False):
    async def route_request(route):
        target = urlparse(route.request.url)
        path = target.path
        if target.netloc == ORIGIN:
            if unavailable and path.endswith(f"shorts-news-{unavailable}.mp3"):
                return await route.fulfill(status=404, body="")
            return await route.continue_()
        if path == "/rest/v1/rpc/public_home_news_recent_v3":
            if route.request.method == "OPTIONS":
                return await route.fulfill(status=204, headers={
                    "access-control-allow-origin": "*", "access-control-allow-methods": "POST",
                    "access-control-allow-headers": "apikey,content-type",
                })
            data = route.request.post_data_json
            requests.append(data)
            offset, limit = data["p_offset"], data["p_limit"]
            if (fail_first and len(requests) == 1) or (
                fail_more and offset == 24 and sum(r["p_offset"] == 24 for r in requests) == 1
            ):
                return await route.fulfill(status=503, json={}, headers={"access-control-allow-origin": "*"})
            return await route.fulfill(json=STORIES[offset:offset + limit],
                                       headers={"access-control-allow-origin": "*"})
        await route.fulfill(status=404 if target.hostname == "media.example.test" else 200, body="")
    return route_request


async def wait_track(page, name):
    await page.wait_for_function(
        """name => window.testAudio && testAudio.currentSrc.includes(name)
          && testAudio.readyState >= 2 && !testAudio.paused && testAudio.currentTime > 0""", arg=name,
    )


async def finish_track(page):
    await page.wait_for_function("""() => Number.isFinite(testAudio.duration) && testAudio.seekable.length
        && testAudio.seekable.end(testAudio.seekable.length - 1) > testAudio.duration - 0.3""")
    await page.evaluate("testAudio.currentTime = testAudio.duration - 0.11")


async def mobile_flow(browser):
    context = await browser.new_context(viewport={"width": 375, "height": 812}, is_mobile=True, has_touch=True,
                                        reduced_motion="reduce", service_workers="block")
    requests, audio_requests, errors = [], [], []
    await context.route("**/*", fixture(requests, fail_more=True))
    await context.add_init_script(INIT)
    page = await context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda r: audio_requests.append(r.url) if ".mp3" in r.url else None)
    await page.goto(f"{SITE}/shorts.html")
    counter = page.locator("#shortsCounter")
    await expect(counter).to_have_text("1 / 24")
    await expect(page.locator(".shorts-slide").first.locator("img")).to_be_hidden()
    assert len(requests) == 1 and requests[0]["p_limit"] == 24, requests
    assert not audio_requests and not await page.evaluate("Boolean(window.testAudio)")
    assert await page.evaluate("document.documentElement.scrollWidth === innerWidth")
    assert await page.locator("#shortsNavigation").evaluate("el => innerHeight - el.getBoundingClientRect().bottom < 2")

    english, theme, music = (page.locator("#shortsLanguage"), page.locator("#shortsTheme"),
                            page.locator("#shortsMusic"))
    await english.tap()
    await expect(page.locator("html")).to_have_attribute("dir", "ltr")
    await expect(page.locator(".shorts-slide.is-active h2")).to_have_text("Human-edited headline")
    await theme.tap()
    await expect(page.locator("html")).to_have_attribute("data-theme", "light")
    async def touch_swipe_up():
        session = await context.new_cdp_session(page)
        await session.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": 180, "y": 345}]})
        for y in range(319, 94, -20):
            await session.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": 180, "y": y}]})
        await session.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        await session.detach()
    await touch_swipe_up()
    await expect(counter).to_have_text("2 / 24")
    await expect(page.locator(".shorts-slide.is-active h2")).to_have_attribute("lang", "ar")
    assert await page.locator(".shorts-slide.is-active h2").text_content() == STORIES[1]["title"]
    await page.locator("#shortsPrevious").tap()
    await expect(counter).to_have_text("1 / 24")
    first = page.locator(".shorts-slide").first
    await expect(first.locator(".shorts-read")).to_have_attribute("href", f"/news/{STORIES[0]['id']}#lang=en")
    await expect(first.locator(".shorts-source")).to_have_attribute("href", STORIES[0]["source_url"])
    await first.locator(".shorts-save").tap()
    await expect(first.locator(".shorts-save")).to_have_attribute("aria-pressed", "true")
    await first.locator(".shorts-share").tap()
    await page.wait_for_function("url => window.sharedArticle === url", arg=f"{SITE}/news/{STORIES[0]['id']}")
    await english.tap()
    await expect(first.locator(".shorts-save")).to_have_attribute("aria-pressed", "true")
    await first.locator(".shorts-save").tap()
    await expect(first.locator(".shorts-save")).to_have_attribute("aria-pressed", "false")
    assert not audio_requests, audio_requests

    await music.tap()
    await wait_track(page, TRACKS[0])
    await expect(music).to_have_attribute("aria-pressed", "true")
    for track in TRACKS[1:] + TRACKS[:1]:
        await finish_track(page)
        await wait_track(page, track)
    await music.tap()
    await expect(music).to_have_attribute("aria-pressed", "false")
    assert await page.evaluate("testAudio.paused")
    await music.tap()
    await wait_track(page, TRACKS[0])

    await page.locator("#shortsNext").tap()
    await expect(counter).to_have_text("2 / 24")
    # Feed a native video element via a local MediaStream without a fixture binary.
    await page.locator(".shorts-slide.is-active video").evaluate("""video => {
        const image = document.createElement('canvas');
        image.width = 120; image.height = 80;
        const g = image.getContext('2d');
        video.srcObject = image.captureStream(15);
        window.videoFrames = setInterval(() => {
          g.fillStyle = '#315674'; g.fillRect(0, 0, 120, 80);
        }, 66);
    }""")
    await page.locator(".shorts-slide.is-active .shorts-video-play").tap()
    await page.wait_for_function("testAudio.paused && !document.querySelector('.is-active video').paused")
    await expect(page.locator("#shortsMusicStatus")).to_be_visible()
    paused_at = await page.evaluate("testAudio.currentTime")
    await page.locator("#shortsNext").tap()
    await expect(counter).to_have_text("3 / 24")
    await wait_track(page, TRACKS[0])
    assert paused_at <= await page.evaluate("testAudio.currentTime") < paused_at + 2
    await page.evaluate("""() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }""")
    assert await page.evaluate("testAudio.paused")
    await page.evaluate("""() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    }""")
    await wait_track(page, TRACKS[0])
    await music.tap()

    # Reopen through a saved Shorts fragment, then check paging and the retry.
    prior_requests = len(requests)
    await page.goto(f"{SITE}/shorts.html?qa=direct#{STORIES[23]['id']}")
    await expect(counter).to_have_text("24 / 24")
    page_anchor = requests[prior_requests]["p_before"]
    await page.locator("#shortsNext").tap()
    await expect(page.locator("#shortsLoadMore")).to_contain_text("أعد المحاولة")
    await expect(page.locator("#shortsNextLabel")).to_have_text("إعادة المحاولة")
    await expect(counter).to_have_text("24 / 24")
    await page.locator("#shortsNext").tap()
    await expect(counter).to_have_text("25 / 26")
    page_requests = [r for r in requests if r["p_offset"] == 24]
    assert len(page_requests) == 2 and all(r["p_before"] == page_anchor for r in page_requests), requests
    await page.keyboard.press("ArrowDown")
    await expect(counter).to_have_text("26 / 26")
    await expect(page.locator("#shortsNext")).to_have_attribute("aria-disabled", "true")
    await page.keyboard.press("ArrowUp")
    await expect(counter).to_have_text("25 / 26")
    assert not errors, errors
    await context.close()


async def desktop_flow(browser):
    context = await browser.new_context(viewport={"width": 1366, "height": 768}, service_workers="block")
    await context.add_init_script(INIT)
    await context.route("**/*", fixture([], unavailable=TRACKS[1], fail_first=True))
    page = await context.new_page()
    await page.goto(f"{SITE}/shorts.html")
    await page.locator("#shortsRetry").click()
    await expect(page.locator("#shortsCounter")).to_have_text("1 / 24")
    await page.locator("#shortsNext").click()
    await expect(page.locator("#shortsCounter")).to_have_text("2 / 24")
    await page.locator("#shortsPrevious").click()
    await expect(page.locator("#shortsCounter")).to_have_text("1 / 24")
    await page.locator("#shortsMenuToggle").click()
    await page.locator("[data-analytics-settings]").click()
    await expect(page.locator(".wrldline-consent")).to_be_visible()
    await page.locator(".wrldline-consent [data-close]").click()
    await page.locator("#shortsMusic").click()
    await wait_track(page, TRACKS[0])
    await finish_track(page)
    await wait_track(page, TRACKS[2])
    await context.close()


async def main():
    async with async_playwright() as p:
        executable = os.environ.get("WRLDLINE_CHROMIUM_PATH") or None
        browser = await p.chromium.launch(headless=True, channel="chromium", executable_path=executable,
                                         args=["--mute-audio"])
        await asyncio.gather(mobile_flow(browser), desktop_flow(browser))
        await browser.close()
    print("Shorts QA passed: native MP3 rotation and skip, video/tab suspension, browsing, retries, and bilingual controls")


asyncio.run(main())
