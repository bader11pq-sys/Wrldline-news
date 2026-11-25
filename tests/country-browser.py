"""Browser test: country directory and profiles, Arabic RTL / English LTR, desktop and mobile (network mocked)."""
import json, sys, re, os
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__) + "/lib")
from pw_site import *

FIX = os.path.join(os.path.dirname(__file__), "fixtures")
META = open(os.path.join(FIX, "worldbank-country-sau.json")).read()

def wb_handler(mode="ok"):
    def extra(route, request):
        url = request.url
        if "api.worldbank.org" not in url: return False
        if mode == "down": route.fulfill(status=503, body="down"); return True
        m = re.search(r"/country/([A-Z]{3})\?format=json", url)
        if m:
            if m.group(1) == "SAU": route.fulfill(status=200, content_type="application/json", body=META)
            else: route.fulfill(status=200, content_type="application/json", body=json.dumps([{"page": 1, "total": 1}, [{"id": m.group(1), "iso2Code": "XX", "name": "Test", "capitalCity": "Testville", "region": {"value": "Europe & Central Asia"}, "incomeLevel": {"value": "High income"}, "latitude": "46.2", "longitude": "2.2"}]]))
            return True
        m = re.search(r"/country/([A-Z]{3})/indicator/([A-Za-z0-9_.]+)", url)
        if m:
            iso, ind = m.groups()
            if ind == "GB.XPD.RSDV.GD.ZS":
                body = [{"page": 1, "lastupdated": "2026-11-11"}, None]
            else:
                rows = [{"indicator": {"id": ind, "value": ind}, "country": {"id": iso[:2], "value": "T"}, "countryiso3code": iso, "date": str(2019 + i), "value": 10.0 + i * 1.5 if i != 3 else None} for i in range(6)]
                body = [{"page": 1, "pages": 1, "per_page": 1000, "total": 6, "lastupdated": "2026-11-11"}, rows]
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body)); return True
        route.fulfill(status=404, body="{}"); return True
    return extra

def check(cond, msg):
    if not cond: raise AssertionError(msg)

def run():
    with serve() as base, sync_playwright() as p:
        b = browser(p)
        for lang in ("ar", "en"):
            for vp_name, vp in VIEWPORTS.items():
                tag = f"{lang}/{vp_name}"
                ctx = b.new_context(viewport=vp, locale="ar-SA" if lang == "ar" else "en-GB")
                install_routes(ctx, extra=wb_handler()); page = ctx.new_page(); errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                # ---- directory ----
                page.goto(f"{base}/countries.html?lang={lang}"); page.wait_for_selector("#countryList li")
                check(page.evaluate("document.documentElement.dir") == ("rtl" if lang == "ar" else "ltr"), "dir " + tag)
                check(page.locator("#countryList li").count() > 200, "directory size " + tag)
                page.fill("#countrySearch", "فرنسا" if lang == "ar" else "France")
                check(page.locator("#countryList li").count() == 1, "search narrows " + tag)
                page.fill("#countrySearch", ""); page.check("#atlasOnly")
                n = page.locator("#countryList li").count(); check(n == 38, f"atlas-only count {n}")
                check(no_horizontal_overflow(page), "dir overflow " + tag)
                # ---- profile with atlas data ----
                page.goto(f"{base}/country.html?c=SAU&lang={lang}"); page.wait_for_selector("html[data-country-ready]", timeout=20000)
                check(page.locator("#cTitle").inner_text().strip().endswith("السعودية" if lang == "ar" else "Saudi Arabia"), "title " + tag)
                check(page.locator("#overview dd", has_text="الرياض" if lang == "ar" else "Riyadh").count() == 1, "capital shown in reader language")
                check(page.locator("#economy .wp-stat").count() >= 5, "economy stats " + tag)
                check(page.locator("#economy svg title").count() == 1, "economy chart")
                check("2026" in page.locator("#economy .wp-footnote").first.inner_text(), "source update date shown")
                check(page.locator("#economy .wp-footnote a[href*='data.worldbank.org']").count() == 1, "source link")
                check(page.locator("#science").inner_text().count("R&D") + page.locator("#science").inner_text().count("البحث") >= 1, "missing indicator is reported as missing")
                check(page.locator("#news .wp-item").count() == 1, "one Saudi article from public feed")
                check(page.locator("#news .wp-badge.confirmed").count() >= 1, "verification status visible")
                check(page.locator("#timeline .wp-timeline li").count() >= 5, "atlas timeline")
                check(page.locator("#sources a[href^='https://']").count() >= 3, "sources listed")
                page.wait_for_function("document.documentElement.hasAttribute('data-map-ready')", timeout=15000)
                check(page.evaluate("document.documentElement.getAttribute('data-map-ready')") == "highlighted", "country highlighted on map")
                check(page.locator("#countryMap .leaflet-tile").count() == 0, "no third-party tiles requested")
                if lang == "ar":
                    check(page.locator("#timeline [lang=ar]").count() >= 3, "arabic narrative tagged lang=ar")
                else:
                    check(page.locator("#overview p[lang=en]").count() == 1, "translated summary is tagged English")
                    check(page.locator("#overview dd[lang=en]").count() >= 1, "english values")
                check(no_horizontal_overflow(page), "profile overflow " + tag)
                check(not re.search(r"(^|\s)(null|undefined)(\s|$)", page.locator("#cApp").inner_text()), "no stray null text")
                # follow stored locally for anonymous visitors
                page.locator("#followBtn").click()
                check(page.evaluate("JSON.parse(localStorage.getItem('wl:follows:v1')).country") == ["SAU"], "follow stored")
                check(page.locator("#followBtn").get_attribute("aria-pressed") == "true", "pressed")
                if lang == "en":
                    page.goto(f"{base}/country.html?c=FRA&lang=en"); page.wait_for_selector("html[data-country-ready]", timeout=20000)
                    check(page.locator("#overview .wp-footnote", has_text="Arabic only").count() == 1, "untranslated narrative disclosed")
                    check(page.locator("#overview p[lang=ar][dir=rtl]").count() == 1, "Arabic fallback is marked rtl")
                # ---- country without atlas profile ----
                page.goto(f"{base}/country.html?c=CHE&lang={lang}"); page.wait_for_selector("html[data-country-ready]", timeout=20000)
                check(page.locator("#timeline .wp-notice").count() == 1, "no invented history for countries without profile")
                check(page.locator("#news .wp-notice").count() == 1, "empty news disclosed")
                # ---- unknown code ----
                page.goto(f"{base}/country.html?c=ZZZ&lang={lang}"); page.wait_for_selector("#cApp .wp-notice.warn")
                ctx.close()
                # ---- World Bank outage: no substitute numbers ----
                ctx = b.new_context(viewport=vp); install_routes(ctx, extra=wb_handler("down")); page = ctx.new_page()
                page.goto(f"{base}/country.html?c=SAU&lang={lang}"); page.wait_for_selector("html[data-country-ready]", timeout=30000)
                check(page.locator(".wp-stat").count() == 0, "no stats when source is down")
                check(page.locator("#economy .wp-notice.warn").count() == 1, "error shown")
                check(not errors, f"page errors {errors}")
                if lang == "ar" and vp_name == "desktop": page.screenshot(path="/tmp/country-down.png")
                ctx.close()
        # screenshots for review
        for lang, vp_name in (("ar", "desktop"), ("en", "mobile")):
            ctx = b.new_context(viewport=VIEWPORTS[vp_name]); install_routes(ctx, extra=wb_handler()); page = ctx.new_page()
            page.goto(f"{base}/country.html?c=SAU&lang={lang}"); page.wait_for_selector("html[data-map-ready]", timeout=20000)
            page.screenshot(path=f"/tmp/country-{lang}-{vp_name}.png", full_page=True); ctx.close()
        b.close()
    print("Country profiles browser QA passed: AR/EN x desktop/mobile, directory, atlas and non-atlas profiles, outage, follow, map")

if __name__ == "__main__": run()
