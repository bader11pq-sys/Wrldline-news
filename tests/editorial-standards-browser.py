"""Isolated checks for bilingual standards and the existing correction transport."""
import asyncio
from datetime import datetime, timedelta, timezone
import os
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect


SITE = os.environ.get("WRLDLINE_TEST_SITE", "http://127.0.0.1:4173")
ID = "00000000-0000-4000-8000-000000000017"
PUBLIC_STORY = "https://al-ghaib.us.ci/news/" + ID
TITLE = "Synthetic transit briefing"
STORY = {
    "id": ID, "title": TITLE, "summary": "Example text for the browser checks.",
    "published_at": (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat(),
    "source_name": "Example Journal", "source_language": "en", "lang": "en",
    "event_country": "Saudi Arabia", "category": "economy", "editorial_status": "published",
    "url": "https://publisher.example.test/story",
}


async def test_static(browser):
    ctx = await browser.new_context(java_script_enabled=False, viewport={"width": 360, "height": 800},
                                    reduced_motion="reduce", service_workers="block")

    async def local_only(route):
        if urlparse(route.request.url).netloc == urlparse(SITE).netloc:
            return await route.continue_()
        return await route.abort()

    await ctx.route("**/*", local_only)
    p = await ctx.new_page()
    p.set_default_timeout(10000)
    await p.goto(f"{SITE}/about.html")
    await expect(p.get_by_role("heading", level=1)).to_have_text("المعايير التحريرية")
    await p.keyboard.press("Tab")
    await expect(p.get_by_role("link", name="تجاوز إلى المحتوى")).to_be_focused()
    await p.keyboard.press("Enter")
    await expect(p.locator("main")).to_be_focused()
    await p.get_by_role("link", name="English", exact=True).click()
    await expect(p.locator("html")).to_have_attribute("lang", "en")
    await expect(p.get_by_role("heading", level=1)).to_have_text("Editorial standards")
    await p.get_by_role("link", name="Source policy", exact=True).click()
    assert p.url.endswith("#sources")
    await expect(p.get_by_role("link", name="source directory", exact=True)).to_have_attribute("href", "/sources.html")
    await p.get_by_role("link", name="How we review corrections").click()
    await expect(p.get_by_role("heading", level=1)).to_have_text("Corrections and right of reply")
    assert await p.locator("body").evaluate("(el) => el.scrollWidth === innerWidth")
    await p.get_by_role("link", name="العربية").click()
    await expect(p.locator("html")).to_have_attribute("dir", "rtl")
    await expect(p.get_by_role("heading", level=1)).to_have_text("التصحيحات وحق الرد")
    await p.get_by_role("link", name="افتح نموذج التصحيح").click()
    await expect(p.locator("#contactForm button")).to_be_disabled()
    for width in (320, 375, 390):
        await p.set_viewport_size({"width": width, "height": 844})
        for section in ("about.html", "about-en.html", "corrections.html", "corrections-en.html", "contact.html"):
            response = await p.goto(f"{SITE}/{section}", wait_until="domcontentloaded")
            assert response.ok and await p.locator("body").evaluate("(el) => el.scrollWidth <= innerWidth"), (width, section)
            if os.environ.get("WRLDLINE_SCREENSHOTS") and width == 375:
                await p.screenshot(path=f"/tmp/wrldline-standards-{section}.png")
    await ctx.close()


async def test_handoff(browser):
    ctx = await browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block",
                                    reduced_motion="reduce")
    p = await ctx.new_page()
    p.set_default_timeout(10000)
    requests, errors = [], []
    p.on("pageerror", lambda error: errors.append(str(error)))

    async def net(route):
        request = route.request
        url = urlparse(request.url)
        if url.netloc == urlparse(SITE).netloc:
            if url.path != "/news/" + ID:
                return await route.continue_()
            # Only the public page shell; the network still serves the actual local JavaScript.
            return await route.fulfill(content_type="text/html", body=f"""<!doctype html><html lang="en"><head>
              <link rel="canonical" href="{PUBLIC_STORY}"></head><body>
              <article data-public-article data-article-id="{ID}" data-source-language="en">
              <h1>{TITLE}</h1><div class="public-news-summary"><p>Original article.</p></div>
              <div class="public-news-actions"><a href="{PUBLIC_STORY}">Permanent article link</a></div>
              </article><script src="/public-news.js" defer></script></body></html>""")
        if url.path.endswith("/rpc/public_home_news_recent_v3"):
            primary = not any(route.request.post_data_json.get(name) for name in ("p_newsdata_only", "p_is_breaking", "p_is_exclusive"))
            return await route.fulfill(json=[STORY] if primary else [])
        if url.path.endswith("/functions/v1/contact-submit"):
            headers = {"access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS",
                       "access-control-allow-headers": "apikey,content-type"}
            if request.method == "OPTIONS":
                return await route.fulfill(status=204, headers=headers)
            requests.append(request.post_data_json)
            return await route.fulfill(status=503 if len(requests) == 1 else 200, headers=headers, json={})
        return await route.fulfill(status=200, json=[])

    await ctx.route("**/*", net)
    await p.goto(f"{SITE}/contact.html?lang=en")
    await expect(p.get_by_role("dialog", name="Measurement and privacy settings")).to_have_attribute("lang", "en")
    await p.get_by_role("button", name="Decline or withdraw").click()
    await p.goto(f"{SITE}/?lang=en")
    await expect(p.locator('a[data-editorial-page="about"]')).to_have_attribute("href", "/about-en.html")
    # Registry links carry both languages; the English span is the visible label on /?lang=en.
    await expect(p.locator('a[data-editorial-page="about"] span[lang="en"]')).to_have_text("Editorial standards")
    await p.locator("#newsGrid .reader-story-link").first.click()
    await expect(p.locator("#articleModal h1")).to_have_text(TITLE)
    await p.get_by_role("link", name="Report an error", exact=True).click()
    await expect(p.get_by_role("heading", level=1)).to_have_text("Contact us")
    await expect(p.get_by_label("Topic")).to_have_value("correction")
    await expect(p.get_by_role("link", name="View the linked story")).to_have_attribute("href", "/news/" + ID)
    draft = "The quoted figure appears to be incorrect."
    await p.get_by_label("Name", exact=True).fill("Fixture Reader")
    await p.get_by_label("Email address").fill("reader@example.test")
    await p.get_by_label("Message", exact=True).fill(draft)
    await p.get_by_role("button", name="Send message").click()
    assert not await p.get_by_role("checkbox").evaluate("(el) => el.validity.valid")
    assert not requests
    await p.get_by_role("checkbox").check()
    await p.get_by_role("button", name="Send message").click()
    await expect(p.locator("#contactStatus")).to_contain_text("Your draft is still here")
    await expect(p.get_by_label("Message", exact=True)).to_have_value(draft)
    await p.get_by_role("button", name="Send message").click()
    await expect(p.locator("#contactStatus")).to_contain_text("Message received")
    await expect(p.locator("#contactArticle")).to_be_hidden()
    assert len(requests) == 2 and requests[0] == requests[1]
    assert requests[0]["message"] == PUBLIC_STORY + "\n\n" + draft
    assert requests[0]["page_path"] == "/contact.html" and requests[0]["consent"] is True
    await p.goto(f"{SITE}/contact.html?topic=correction&article=https%3A%2F%2Fexample.test%2F&subject=Bad&lang=en")
    await expect(p.locator("#contactArticle")).to_be_hidden()
    await expect(p.get_by_label("Message", exact=True)).to_have_value("")
    await p.get_by_label("Topic").select_option("general")
    await expect(p.locator("#correctionHelp")).to_be_hidden()
    await p.goto(f"{SITE}/contact.html?topic=correction&article={ID}&article={ID}")
    await expect(p.locator("#contactArticle")).to_be_hidden()
    await p.goto(f"{SITE}/contact.html?topic=correction&topic=general&article={ID}")
    await expect(p.locator("#contactTopic")).to_have_value("general")
    await expect(p.locator("#contactArticle")).to_be_hidden()
    await p.goto(f"{SITE}/contact.html?topic=intelligence&subject=Fixture+Intelligence")
    await expect(p.locator("#contactTopic")).to_have_value("intelligence")
    await expect(p.locator("#contactMessage")).to_have_value("[Fixture Intelligence]\n")
    await p.goto(f"{SITE}/news/{ID}")
    await expect(p.locator('link[rel="canonical"]')).to_have_attribute("href", PUBLIC_STORY)
    await expect(p.get_by_role("link", name="Permanent article link")).to_have_attribute("href", PUBLIC_STORY + "#lang=en")
    await p.get_by_role("link", name="Report an error").click()
    await expect(p.locator("#contactTopic")).to_have_value("correction")
    await expect(p.locator("#contactArticleLink")).to_have_attribute("href", "/news/" + ID)
    assert len(requests) == 2
    assert not errors, errors
    await ctx.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True, executable_path=os.environ.get("WRLDLINE_CHROMIUM_PATH") or None)
        await test_static(browser)
        await test_handoff(browser)
        await browser.close()
    print("Editorial standards QA passed: two languages, keyboard, policy links, correction retry and safe handoff.")


if __name__ == "__main__":
    asyncio.run(main())
