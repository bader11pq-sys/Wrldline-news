"""Browser test: coverage map in Arabic RTL / English LTR on desktop and mobile (network mocked)."""
import json, sys, re, os
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__) + "/lib")
from pw_site import *

def check(cond, msg):
    if not cond: raise AssertionError(msg)

NOW = datetime.now(timezone.utc)
def row(i, country, cat, trust, hours, title=None):
    return {"id": f"00000000-0000-4000-8000-{i:012d}", "title": title or f"Fixture story {i}", "summary": "s", "category": cat, "country": "Publisher Geography Fixture", "event_country": country,
            "source_name": "Fixture Wire", "url": "https://source.example/" + str(i), "published_at": (NOW - timedelta(hours=hours)).isoformat(),
            "editorial_trust_status": trust, "content_type": "news", "article_translations": []}
ROWS = [row(1, "SAU", "politics", "confirmed", 2), row(2, "SAU", "economy", "unconfirmed", 5), row(3, "USA", "politics", "unconfirmed", 30),
        row(4, "FRA", "tech", "confirmed", 24 * 6), row(5, "JPN", "politics", "confirmed", 24 * 20), row(6, "", "politics", "confirmed", 3, "No country story"),
        *[row(10 + n, "GBR", "society", "confirmed", 10 + n) for n in range(25)]]
MON = [{"id": "00000000-0000-4000-8000-000000000999", "title": "Machine classified item", "ai_country_code": "SAU", "ai_risk_level": "high", "ai_risk_score": 60,
        "ai_event_type": "diplomacy", "published_at": (NOW - timedelta(hours=1)).isoformat(), "summary": "x", "url": "https://source.example/m", "source_name": "Fixture Wire"}]

def handler(wb="ok", monitor="ok"):
    def extra(route, request):
        url = request.url
        if "/rpc/public_world_monitor_feed" in url:
            if monitor == "down": route.fulfill(status=503, body="{}"); return True
            route.fulfill(status=200, content_type="application/json", body=json.dumps(MON)); return True
        if "api.worldbank.org" in url:
            if wb == "down": route.fulfill(status=503, body="x"); return True
            data = [{"id": "SAU", "iso2Code": "SA", "name": "Saudi Arabia", "region": {"value": "Middle East, North Africa, Afghanistan & Pakistan"}, "incomeLevel": {"value": "High income"}},
                    {"id": "USA", "iso2Code": "US", "name": "United States", "region": {"value": "North America"}, "incomeLevel": {"value": "High income"}},
                    {"id": "WLD", "iso2Code": "1W", "name": "World", "region": {"value": "Aggregates"}, "incomeLevel": {"value": "Aggregates"}}]
            route.fulfill(status=200, content_type="application/json", body=json.dumps([{"page": 1}, data])); return True
        return False
    return extra

def run():
    with serve() as base, sync_playwright() as p:
        b = browser(p)
        for lang in ("ar", "en"):
            for vp_name, vp in VIEWPORTS.items():
                tag = f"{lang}/{vp_name}"
                ctx = b.new_context(viewport=vp); install_routes(ctx, rows=ROWS, extra=handler()); page = ctx.new_page(); errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto(f"{base}/news-map.html?lang={lang}"); page.on("console", lambda m: print("C", m.text)); page.wait_for_selector("html[data-news-map-state]", state="attached", timeout=8000)
                page.wait_for_selector("html[data-news-map=ready]", timeout=20000)
                check(page.evaluate("document.documentElement.dir") == ("rtl" if lang == "ar" else "ltr"), "dir " + tag)
                check(page.locator("#newsMap path.leaflet-interactive").count() > 100, "map polygons " + tag)
                check(page.evaluate("document.documentElement.dataset.newsMapState") == "coverage:30", "7 day default excludes old: " + page.evaluate("document.documentElement.dataset.newsMapState"))
                check(page.locator("#fTopic option").count() >= 10, "topic options")
                check(page.locator("#nApp table tbody tr").count() >= 4, "tables")
                check(page.locator("a[href^='/news/']").count() >= 5, "article links")
                check(page.locator(".wp-badge.developing").count() >= 1 and page.locator(".wp-badge.confirmed").count() >= 1, "both trust badges")
                body = page.locator("#nApp").inner_text()
                check("Middle East" in body or "الشرق الأوسط" in body, "region table from World Bank")
                check(not re.search(r"(^|\s)(null|undefined)(\s|$)", body), "stray null")
                check(no_horizontal_overflow(page), "overflow " + tag)
                # trust filter
                page.select_option("#fTrust", "confirmed")
                check(page.locator(".wp-list .wp-badge.developing").count() == 0, "confirmed-only hides developing")
                page.select_option("#fTrust", "developing")
                page.wait_for_function("document.documentElement.dataset.newsMapState == 'coverage:2'")
                check("trust=developing" in page.url, "state in URL")
                page.select_option("#fTrust", "all")
                # date filter
                page.select_option("#fDays", "30")
                page.wait_for_function("document.documentElement.dataset.newsMapState == 'coverage:31'")
                page.select_option("#fDays", "1")
                page.wait_for_function("document.documentElement.dataset.newsMapState == 'coverage:" + str(sum(1 for r in ROWS if (NOW - datetime.fromisoformat(r['published_at'])).total_seconds() < 86400)) + "'")
                page.select_option("#fDays", "7")
                # topic filter
                page.select_option("#fTopic", "tech")
                page.wait_for_function("document.documentElement.dataset.newsMapState == 'coverage:1'")
                page.select_option("#fTopic", "all")
                # country selection from table
                page.locator("section[aria-labelledby=nCt] .wp-linkbtn").first.click()
                check(page.locator("a[href^='country.html?c=']").count() == 1, "country profile link")
                check("c=" in page.url, "country in URL")
                page.locator("section[aria-labelledby=nAr] button", has_text=re.compile("Clear|إلغاء")).click()
                # show more
                page.locator("section[aria-labelledby=nAr] .wp-btn", has_text=re.compile("Show more|عرض المزيد")).click()
                # risk layer
                page.select_option("#fLayer", "risk")
                page.wait_for_selector("section[aria-labelledby=nAr] .wp-badge", timeout=10000)
                check(page.locator("#nApp .wp-notice.warn").count() >= 1, "risk layer disclaimer")
                check("Machine classified item" in page.locator("section[aria-labelledby=nAr]").inner_text(), "risk item shown")
                check(page.locator("section[aria-labelledby=nAr] .wp-badge", has_text=re.compile("Automated|آلي")).count() >= 1, "automated label")
                check(no_horizontal_overflow(page), "overflow risk " + tag)
                check(not errors, errors)
                if lang == "en" and vp_name == "mobile": page.screenshot(path="/tmp/map-en-mobile.png", full_page=True)
                if lang == "ar" and vp_name == "desktop": page.screenshot(path="/tmp/map-ar-desktop.png", full_page=True)
                ctx.close()
        # World Bank down: map and articles still work, region note disclosed
        ctx = b.new_context(viewport=VIEWPORTS["desktop"]); install_routes(ctx, rows=ROWS, extra=handler(wb="down")); page = ctx.new_page()
        page.goto(f"{base}/news-map.html?lang=en"); page.wait_for_selector("html[data-news-map-state]", timeout=20000)
        check("Region classification could not load" in page.locator("section[aria-labelledby=nRg]").inner_text(), "region outage disclosed"); ctx.close()
        # monitor down: coverage unaffected, risk layer says so
        ctx = b.new_context(viewport=VIEWPORTS["desktop"]); install_routes(ctx, rows=ROWS, extra=handler(monitor="down")); page = ctx.new_page()
        page.goto(f"{base}/news-map.html?lang=en&layer=risk"); page.wait_for_selector("html[data-news-map-state]", timeout=20000)
        page.wait_for_selector("section[aria-labelledby=nAr] .wp-notice.warn", timeout=10000)
        check("risk layer could not load" in page.locator("section[aria-labelledby=nAr]").inner_text(), "risk outage disclosed"); ctx.close()
        # news service down: no substitute data
        ctx = b.new_context(viewport=VIEWPORTS["desktop"])
        def down(route, request):
            if "public_home_news_recent" in request.url: route.fulfill(status=503, body="x"); return True
            return False
        install_routes(ctx, rows=ROWS, extra=down); page = ctx.new_page()
        page.goto(f"{base}/news-map.html?lang=en"); page.wait_for_selector("#nApp .wp-notice.warn", timeout=20000)
        check("No substitute data" in page.locator("#nApp").inner_text() and page.locator("#newsMap").count() == 0, "total outage"); ctx.close()
        b.close()
    print("News map browser QA passed: AR/EN x desktop/mobile, filters, trust separation, risk layer, outages")
run()
