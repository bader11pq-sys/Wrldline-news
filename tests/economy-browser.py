"""Browser test: economic dashboards in Arabic RTL / English LTR on desktop and mobile (network mocked)."""
import json, sys, re, os, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__) + "/lib")
from pw_site import *

def check(cond, msg):
    if not cond: raise AssertionError(msg)

def handler(wb="ok", markets="ok", seen=None):
    def extra(route, request):
        url = request.url
        if "functions/v1/market-data" in url:
            if seen is not None: seen.append(url)
            if markets == "down": route.fulfill(status=502, body="bad"); return True
            now = int(time.time() * 1000)
            if "mode=fx" in url:
                body = {"ok": True, "quote": {"price": 3.75, "change": 0, "changePercent": 0, "timestamp": now, "asOf": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(time.time() - 600)), "timeZone": "UTC", "from": "USD", "to": "SAR", "provider": "Mock FX", "label": "USD / SAR", "labelAr": "الدولار / الريال", "category": "forex", "currency": "SAR", "ok": True}}
            else:
                q = lambda s, c, p, ago: {"ok": True, "symbol": s, "price": p, "currency": "USD", "provider": "Mock Provider", "label": s + " label", "labelAr": s + " ar", "category": c, "change": 1.0, "changePercent": 0.25, "timestamp": now - ago * 3600 * 1000}
                body = {"ok": True, "quotes": [q("SPX", "index", 5000.5, 1), q("BTC", "crypto", 60000.0, 30), q("GOLD", "metals", 2300.0, 2)]}
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body)); return True
        if "api.worldbank.org" not in url: return False
        if wb == "down": route.fulfill(status=503, body="down"); return True
        m = re.search(r"/country/([A-Za-z;]+)/indicator/([A-Za-z0-9_.]+)", url)
        if not m: route.fulfill(status=404, body="{}"); return True
        codes, ind = m.group(1).split(";"), m.group(2)
        if "ATA" in codes:
            route.fulfill(status=200, content_type="application/json", body=json.dumps([{"message": [{"id": "120", "key": "Invalid value"}]}])); return True
        rows = []
        for ci, c in enumerate(codes):
            for yi in range(2010, 2026):
                if yi == 2023 and ci == 1: continue  # a real-world style gap
                rows.append({"indicator": {"id": ind, "value": ind}, "country": {"id": c[:2], "value": c}, "countryiso3code": c, "date": str(yi), "value": float(ci * 3 + (yi - 2010) * 0.5)})
        route.fulfill(status=200, content_type="application/json", body=json.dumps([{"page": 1, "pages": 1, "per_page": 1000, "total": len(rows), "lastupdated": "2026-11-11"}, rows])); return True
    return extra

def run():
    with serve() as base, sync_playwright() as p:
        b = browser(p)
        for lang in ("ar", "en"):
            for vp_name, vp in VIEWPORTS.items():
                tag = f"{lang}/{vp_name}"
                ctx = b.new_context(viewport=vp); install_routes(ctx, extra=handler()); page = ctx.new_page(); errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto(f"{base}/economy.html?lang={lang}&c=SAU,USA,CHN"); page.wait_for_selector("html[data-economy-ready]", timeout=20000)
                check(page.evaluate("document.documentElement.dir") == ("rtl" if lang == "ar" else "ltr"), "dir " + tag)
                check(page.locator("#matrixBody tbody tr").count() >= 10, "matrix rows " + tag)
                check(page.locator("#matrixBody thead th").count() == 4, "matrix columns")
                check(page.locator("#historyBody svg").count() == 1 and page.locator("#compareBody .wp-bars li").count() == 3, "chart and bars")
                check("2026" in page.locator("#matrixBody [data-stamp=wb]").inner_text(), "update date shown")
                page.wait_for_selector("#marketsBody .wp-market-group", timeout=10000)
                check(page.locator("#marketsBody .wp-market-group").count() >= 3, "market groups")
                check("Mock Provider" in page.locator("#marketsBody").inner_text(), "provider shown")
                check(page.locator("#marketsBody .wp-footnote").count() >= 3, "freshness label shown")
                check(no_horizontal_overflow(page), "overflow " + tag)
                # change indicator: chart title and URL follow
                page.select_option("#indicatorSel", "FP.CPI.TOTL.ZG")
                page.wait_for_function("document.querySelector('#historyBody h3').textContent.includes('%s')" % ("التضخم" if lang == "ar" else "Inflation"))
                check("i=FP.CPI.TOTL.ZG" in page.url, "state in URL")
                # the 2023 gap for the second country is a gap, not a zero
                tbl = page.locator("#historyBody .wp-sr tr", has=page.locator("th", has_text="2023")).first.inner_text()
                check("—" in tbl, f"gap kept as gap: {tbl!r}")
                # add and remove countries
                page.select_option("#addCountry", "FRA"); page.wait_for_function("document.querySelectorAll('#matrixBody thead th').length === 5")
                check(page.locator(".wp-chips li").count() == 4, "chip added")
                page.select_option("#addCountry", "ATA"); page.wait_for_function("document.querySelectorAll('#matrixBody thead th').length === 6")
                check("ATA" in page.url, "invalid-for-api country kept in URL")
                check(page.locator("#historyBody .wp-footnote", has_text=re.compile("Antarctica|أنتاركتيكا|القطب")).count() >= 1, "per-country failure disclosed")
                page.reload(); page.wait_for_selector("html[data-economy-ready]", timeout=20000)
                check(page.locator(".wp-chips li").count() == 5, "state restored from URL")
                ctx.close()
                # outages: no substitute numbers
                ctx = b.new_context(viewport=vp); install_routes(ctx, extra=handler(wb="down", markets="down")); page = ctx.new_page()
                page.goto(f"{base}/economy.html?lang={lang}"); page.wait_for_selector("html[data-economy-ready]", timeout=30000)
                check("null" not in page.locator("#controls").inner_text(), "no stray null text")
                check(page.locator("#matrixBody table").count() == 0 and page.locator("#historyBody svg").count() == 0, "no numbers when World Bank is down")
                check(page.locator("#matrixBody .wp-notice.warn").count() == 1, "error shown")
                page.wait_for_selector("#marketsBody .wp-notice.warn", timeout=10000)
                check(page.locator("#marketsBody table").count() == 0, "no prices when market feed is down")
                check(not errors, f"page errors {errors}")
                ctx.close()
        for lang, vp_name in (("ar", "desktop"), ("en", "mobile")):
            ctx = b.new_context(viewport=VIEWPORTS[vp_name]); install_routes(ctx, extra=handler()); page = ctx.new_page()
            page.goto(f"{base}/economy.html?lang={lang}"); page.wait_for_selector("html[data-economy-ready]", timeout=20000); page.wait_for_selector("#marketsBody .wp-market-group")
            page.screenshot(path=f"/tmp/economy-{lang}-{vp_name}.png", full_page=True); ctx.close()
        b.close()
    print("Economic dashboards browser QA passed: AR/EN x desktop/mobile, matrix, history, comparison, markets, URL state, partial and total outages")

if __name__ == "__main__": run()
