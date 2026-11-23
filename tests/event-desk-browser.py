"""Event-first homepage and dossier browser regression with a controlled feed."""
import asyncio
import os
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

SITE = os.environ.get("WRLDLINE_TEST_SITE", "http://127.0.0.1:4173")
OPEC = "/dossier/opec-plus-december-2026.html"
BAB = "/dossier/bab-al-mandab-2026.html"
QUESTIONS = ["ما الجديد منذ آخر تحديث؟", "ما الذي تأكد؟", "متى نعرف التطور التالي؟"]


def row(i, title, **overrides):
    return {
        "id": f"00000000-0000-4000-8000-{i:012d}", "title": title,
        "summary": "This is a fictional fixture about the global news desk.",
        "published_at": f"2026-11-22T10:{59-i:02d}:00Z",
        "url": f"https://publisher.example/{i}", "source_name": "Fixture Journal",
        "source_language": "en", "category": "economy", "content_type": "news",
        "editorial_status": "published", **overrides,
    }


FIRST = [
    row(1, "OPEC+ keeps December output targets steady"),
    row(2, "Gulf shipping update", summary="OPEC+ keeps December output targets steady"),
    row(3, "أوبك+ تناقش حصص الإنتاج في ديسمبر", source_language="ar"),
    row(4, "OPEC+ keeps December output steady amid Strait of Hormuz closure"),
    row(5, "Interview with the finance minister", url="editorial-1795361533409", source_name="WRLDLINE NEWS"),
    row(6, "Rail traffic rises in the capital", content_type="analysis"),
    *[row(i, f"Coverage of technology workshop {i}") for i in range(7, 25)],
]
OLDER = [row(25, "OPEC+ December production targets draw response"), row(26, "Local teams win the finals")]


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get("WRLDLINE_CHROMIUM_PATH") or None)
        for width in [1440, 375]:
            context = await browser.new_context(viewport={"width": width, "height": 880}, service_workers="block")
            page = await context.new_page()
            errors = []
            page.on("pageerror", lambda err: errors.append(str(err)))
            feed = {"fail": False}

            async def respond(route):
                url = urlparse(route.request.url)
                if url.netloc == urlparse(SITE).netloc:
                    await route.continue_()
                elif url.path.endswith("/public_home_news_recent_v3"):
                    data = route.request.post_data_json
                    if any(data.get(k) for k in ("p_is_breaking", "p_is_exclusive", "p_newsdata_only")):
                        await route.fulfill(json=[])
                    elif feed["fail"]:
                        await route.fulfill(status=503, json={"message": "fixture outage"})
                    else:
                        await route.fulfill(json=OLDER if data["p_offset"] else FIRST)
                else:
                    await route.fulfill(status=200, body="")

            await context.route("**/*", respond)
            await page.goto(f"{SITE}/index.html?lang=ar")
            deny = page.locator('.wrldline-consent [data-choice="denied"]')
            if await deny.is_visible():
                await deny.click()
            picks = page.locator("#heroLayout .front-pick-link")
            await expect(picks).to_have_count(5)
            await expect(page.locator("#frontEditionTitle")).to_have_text("اختيار المحرر", use_inner_text=True)
            paths = await picks.evaluate_all("(links) => links.map(a => new URL(a.href).pathname)")
            assert len(set(paths)) == 5 and paths[0] == OPEC
            await page.locator("#languageButton").click()
            await expect(page.locator("#frontEditionTitle")).to_have_text("Editor’s picks", use_inner_text=True)
            await expect(picks.first).to_contain_text("Open the dossier ↗ · Arabic")
            assert (await picks.nth(4).get_attribute("href")).endswith("?lang=en")
            assert paths == await picks.evaluate_all("(links) => links.map(a => new URL(a.href).pathname)")
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            grid = page.locator("#newsGrid")
            stack = grid.locator(".event-stack")
            await expect(stack).to_have_count(1)
            await expect(stack.locator(".event-stack-link")).to_have_attribute("href", OPEC)
            await expect(stack.locator(".reader-card")).to_have_count(2)
            await expect(grid.locator(":scope > .reader-card")).to_have_count(22)
            await expect(grid.locator(".content-original")).to_have_text("WRLDLINE original reporting")
            await expect(grid.locator(".content-analysis")).to_have_text("Analysis")
            await expect(stack.locator(".content-reported").first).to_have_text("Attributed summary")
            await stack.locator("summary").click()
            trigger = stack.locator(".reader-story-link").first
            await trigger.click()
            dialog = page.locator("#articleModal")
            await expect(dialog.locator("h1")).to_have_text(FIRST[0]["title"])
            await expect(dialog.locator(f'.edition-related a[href="{OPEC}"]')).to_be_visible()
            await page.keyboard.press("Escape")
            await expect(trigger).to_be_focused()
            await page.locator("#loadMoreButton").click()
            await expect(stack.locator(".reader-card")).to_have_count(3)
            await expect(stack.locator("details")).to_have_attribute("open", "")
            await expect(stack.locator(".reader-story-link").last).to_be_focused()
            await page.locator("#formatFilter").select_option("news")
            await expect(stack).to_have_count(0)
            await expect(grid.locator(".reader-story-link").filter(has_text=OLDER[0]["title"])).to_be_visible()

            feed["fail"] = True
            await page.goto(f"{SITE}/index.html?lang=en")
            await expect(grid.get_by_role("button", name="Retry", exact=True)).to_be_visible()
            await expect(picks).to_have_count(5)
            await expect(picks.first).to_have_attribute("href", OPEC)
            feed["fail"] = False
            await picks.first.click()
            await expect(page.locator("#reader-brief dt")).to_have_text(QUESTIONS)
            await expect(page.locator("#relatedGrid a")).to_have_count(2)
            await expect(page.locator("#relatedGrid a").first).to_have_attribute("href", f"/news/{FIRST[0]['id']}")
            await expect(page.locator("#reader-brief time[data-dossier-schedule]")).to_have_attribute("datetime", "2026-11-29")
            await page.clock.set_fixed_time(1796054400000)  # 30 November 2026, after the announced date in Riyadh.
            await page.reload()
            await expect(page.locator("[data-schedule-label]")).to_contain_text("مرّ تاريخ الموعد")
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            assert not errors, errors
            await context.close()

        context = await browser.new_context(java_script_enabled=False, viewport={"width": 375, "height": 780})
        page = await context.new_page()
        await page.goto(f"{SITE}/index.html")
        await expect(page.locator("#heroLayout .front-pick-link")).to_have_count(5)
        await expect(page.locator("#frontEditionTitle")).to_have_text("اختيار المحرر", use_inner_text=True)
        await page.locator(f"#heroLayout a[href='{BAB}']").click()
        await expect(page.locator("#reader-brief dt")).to_have_text(QUESTIONS)
        await expect(page.locator("#reader-brief dd").last).to_contain_text("لا يوجد موعد معلن")
        await expect(page.locator("#related a[href='#timeline']")).to_be_visible()
        assert await page.locator("#related .related-card a").count() >= 2
        await context.close()
        await browser.close()
    print("Event desk QA passed: five persistent picks, own and reported labels, visible and grouped coverage, pagination/focus, failure, bilingual and no-script links, and sourced dates.")


if __name__ == "__main__":
    asyncio.run(main())
