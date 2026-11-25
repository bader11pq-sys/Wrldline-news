"""Rights desk, reader-first homepage, and opt-in preview fetches."""
import asyncio
import os
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE = os.environ.get("WRLDLINE_TEST_SITE", "http://127.0.0.1:4173").rstrip("/")
SOURCE = "https://www.coe.int/en/web/octopus/-/jordan"


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=os.environ.get("WRLDLINE_CHROMIUM_PATH") or None)
        for width in (375, 1440):
            context = await browser.new_context(viewport={"width": width, "height": 900}, service_workers="block",
                                                has_touch=width == 375, reduced_motion="reduce")

            async def route_fixture(route):
                req = route.request
                target = urlparse(req.url)
                if target.netloc == urlparse(BASE).netloc:
                    await route.continue_()
                elif req.url == SOURCE:
                    await route.fulfill(status=200, content_type="text/plain", body="Council of Europe test endpoint")
                elif target.hostname and target.hostname.endswith(".supabase.co"):
                    cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*"}
                    await route.fulfill(status=204 if req.method == "OPTIONS" else 200, headers=cors,
                                        content_type="application/json", body="[]")
                else:
                    await route.abort()

            await context.route("**/*", route_fixture)
            page = await context.new_page()
            page.set_default_timeout(10000)
            errors, requests = [], []
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.on("request", lambda req: requests.append(req.url))
            await page.goto(f"{BASE}/index.html", wait_until="load")
            decline = page.locator(".wrldline-consent [data-choice=denied]")
            if await decline.is_visible():
                await decline.click()
            await expect(page.locator(".rf-intro h1")).to_have_text("الأخبار من أجل الإنسان.", use_inner_text=True)
            await page.wait_for_function("""() => {
                const mark = document.querySelector('header .wl-brand-mark img');
                return mark?.complete && mark.naturalWidth === 132 && mark.currentSrc.endsWith('.webp');
            }""")
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            assert await page.locator("#newsSection").evaluate("(e) => e.getBoundingClientRect().top < 620")
            await expect(page.locator("#heroLayout .front-pick-link")).to_have_count(5)
            assert await page.locator("#heroLayout").evaluate(
                """(picks) => !!(picks.compareDocumentPosition(document.querySelector('#newsSection'))
                & Node.DOCUMENT_POSITION_PRECEDING)"""
            )
            preview_paths = ("/watch-strip.js", "/editorial-publications.js", "/dossier/index.json")
            assert not any(urlparse(u).path.endswith(preview_paths) for u in requests)
            await page.locator('.rf-start a[href="#newsSection"]').click()
            await expect(page.locator("#newsSection")).to_be_focused()
            await page.locator("#languageButton").click()
            await expect(page.locator(".rf-intro h1")).to_have_text("News for people.", use_inner_text=True)

            if width == 375:
                # The chips mirror the registry primary bar and the Sections tab opens
                # the shared registry drawer, which is the only all-sections sheet.
                chips = page.locator(".wlm-chips")
                await expect(chips.locator('a[href="/section/rights"]')).to_have_text("Rights & Freedoms")
                await expect(chips.locator('a[href="/section/politics"]')).to_have_text("Politics & World")
                await expect(chips.locator('a[href="sections.html"]')).to_have_count(1)
                sections_tab = page.locator('.wlm-tab[aria-controls="siteDrawer"]')
                await sections_tab.click()
                drawer = page.locator("#siteDrawer")
                await expect(drawer.locator('summary', has_text="Rights & Freedoms")).to_be_visible()
                await drawer.locator('summary', has_text="Rights & Freedoms").click()
                await expect(drawer.locator('a[href="/section/rights"]').first).to_be_visible()
                directory = drawer.locator('a[href="sections.html"]')
                await expect(directory).to_be_visible()
                await expect(directory.locator('span[lang="en"]')).to_have_text("Open the full sections directory")
                await page.keyboard.press("Escape")
                await expect(sections_tab).to_be_focused()

            extras_summary = page.locator("#homeExtras > summary")
            async def toggle_extras():
                # Scroll into the usable viewport, not underneath the sticky header or mobile dock.
                await extras_summary.evaluate("(el) => el.scrollIntoView({block:'center',behavior:'instant'})")
                if width == 375:
                    await extras_summary.tap()
                else:
                    await extras_summary.click()
            async with page.expect_request(lambda req: urlparse(req.url).path.endswith("/dossier/index.json")):
                await toggle_extras()
            await expect(page.locator("#dossierStripGrid .dossier-strip-card").first).to_be_visible()
            await toggle_extras()
            assert not await page.locator("#homeExtras").evaluate("(e) => e.open")
            await page.goto(f"{BASE}/index.html#contextBand")
            await expect(page.locator("#contextBand")).to_be_visible()

            desk_requests = []
            page.on("request", lambda req: desk_requests.append(req.url)
                    if req.is_navigation_request() or urlparse(req.frame.url).path.endswith("/rights.html") else None)
            await page.locator(".rf-desk").click()
            await expect(page.locator("#rightsTitle")).to_be_visible()
            await page.wait_for_function("document.querySelector('.rd-hero img')?.naturalWidth > 0")
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            assert await page.evaluate("document.documentElement.dir === 'rtl'")
            await expect(page.locator('meta[name="referrer"]')).to_have_attribute("content", "no-referrer")
            assert desk_requests and all(urlparse(u).netloc == urlparse(BASE).netloc for u in desk_requests), desk_requests
            await expect(page.locator(".rd-files article")).to_have_count(3)
            await expect(page.locator(".rd-guide:visible")).to_have_count(9)
            await page.locator('.rd-jumps a[href="#rightsGuides"]').click()
            await expect(page.locator("#rightsGuides")).to_be_focused()
            await page.locator("#rightsTopic").select_option("political")
            await expect(page.locator(".rd-guide:visible")).to_have_count(2)
            await expect(page.locator("#rightsCount")).to_have_text("٢ من ٩")
            await page.locator("#rightsReset").click()
            await expect(page.locator("#rightsTopic")).to_be_focused()
            await expect(page.locator(".rd-guide:visible")).to_have_count(9)
            await page.locator('#expression a[href="#jordan-expression"]').click()
            await expect(page.locator("#jordan-expression details[open]")).to_be_visible()
            async with page.expect_request(SOURCE) as source_request:
                await page.locator(f'#jordan-expression a[href="{SOURCE}"]').click()
            assert "referer" not in (await source_request.value).headers
            await expect(page.locator("body")).to_have_text("Council of Europe test endpoint")
            assert page.url == SOURCE
            assert not errors, errors
            await context.close()

        context = await browser.new_context(java_script_enabled=False, color_scheme="dark",
                                            viewport={"width": 320, "height": 740},
                                            service_workers="block")
        page = await context.new_page()
        await page.goto(f"{BASE}/rights.html")
        await expect(page.locator("#rightsFilter")).to_be_hidden()
        await expect(page.locator(".rd-guide:visible")).to_have_count(9)
        await page.locator("#qatar-wages summary").press("Enter")
        await expect(page.locator("#qatar-wages details[open] dt")).to_have_count(3)
        await expect(page.locator("#qatar-wages details[open] .rd-sources a").first).to_be_visible()
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        await page.locator(".rd-nav a[href='sections.html']").click()
        await expect(page.locator(".hn-desk")).to_have_count(6)
        for slug in ["politics", "economy", "world", "rights", "society", "health", "culture", "tech", "science"]:
            await expect(page.locator(f'.hn-desk a[href="/section/{slug}"]')).to_be_visible()
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        await page.locator(".hn-desk a[href='rights-cases/index.html']").click()
        await expect(page.locator("#files .hn-card")).to_have_count(6)
        await expect(page.locator("#labels .hn-badge")).to_have_count(6)
        await page.locator(".hn-card a[href='qatar-wages.html']").click()
        await page.locator('.hn-jumps a[href="#evidence"]').click()
        assert page.url.endswith("#evidence")
        await expect(page.locator("#followup .hn-badge[data-kind=official]")).to_be_visible()
        await expect(page.locator("#sources .hn-source-link").first).to_have_attribute("rel", "noreferrer")
        await expect(page.locator("#evidence .hn-badge[data-kind=official]")).to_have_count(0)
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        await page.locator(".hn-foot-nav a[href='index.html']").click()
        await page.locator(".hn-note a").click()
        await expect(page.locator('meta[name="robots"]')).to_have_attribute("content", "noindex,follow")
        await expect(page.locator("header.hn-head")).to_contain_text("مثال تعليمي، ليس خبرًا")
        await expect(page.locator("#evidence [data-kind=unverified]")).to_be_visible()
        await expect(page.locator("#sources a")).to_have_count(0)
        await context.close()
        await browser.close()
        print("PASS: light homepage, bilingual navigation, disclosure-only requests, rights filters, coverage map, attributed dossier labels, no-JS and no third-party desk requests")


if __name__ == "__main__":
    asyncio.run(main())
