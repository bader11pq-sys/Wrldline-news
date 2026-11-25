"""Browser test: personalised feed in Arabic RTL / English LTR on desktop and mobile (network mocked)."""
import json, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, __import__("os").path.dirname(__file__) + "/lib")
from pw_site import *

def check(cond, msg):
    if not cond: raise AssertionError(msg)

def run():
    with serve() as base, sync_playwright() as p:
        b = browser(p)
        for lang in ("ar", "en"):
            for vp_name, vp in VIEWPORTS.items():
                ctx = b.new_context(viewport=vp, locale="ar-SA" if lang == "ar" else "en-GB")
                calls = install_routes(ctx)
                page = ctx.new_page(); errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto(f"{base}/for-you.html?lang={lang}"); page.wait_for_selector(".wp-article")
                check(page.evaluate("document.documentElement.dir") == ("rtl" if lang == "ar" else "ltr"), "dir")
                check(page.evaluate("document.documentElement.lang") == lang, "lang")
                check(no_horizontal_overflow(page), f"overflow {lang} {vp_name}")
                # anonymous: guest notice, public feed, no personalisation reasons yet
                check(page.locator(".wp-notice").first.inner_text().strip() != "", "anon notice")
                check(page.locator(".wp-article").count() >= 6, "articles shown")
                # follow economy via the Following tab; ranking must react and explain itself
                page.locator("#tab-follows").click()
                page.locator("fieldset .wp-chip", has_text="اقتصاد" if lang == "ar" else "Economy").first.click()
                stored = page.evaluate("JSON.parse(localStorage.getItem('wl:follows:v1'))")
                check(stored["category"] == ["economy"], f"follow stored locally {stored}")
                page.locator("#tab-feed").click(); page.wait_for_selector(".wp-article")
                first = page.locator(".wp-article").first
                check(first.locator(".wp-reasons li").count() >= 1, "reason chips on top card")
                # followed-only filter keeps only economy stories
                page.get_by_role("button", name="ما أتابعه فقط" if lang == "ar" else "Followed only").click()
                cats = page.locator(".wp-article .wp-meta").all_inner_texts()
                check(len(cats) >= 2 and all(("اقتصاد" in c if lang == "ar" else "Economy" in c) for c in cats), f"followed only {cats}")
                # sort oldest puts the 12-day-old story first
                page.get_by_role("button", name="ما أتابعه فقط" if lang == "ar" else "Followed only").click()
                page.select_option("#fSort", "oldest")
                check("Archive" in page.locator(".wp-article h3").first.inner_text(), "oldest first")
                # save, then see it in the saved tab
                page.select_option("#fSort", "relevance")
                page.locator(".wp-article .wp-btn").first.click()
                saved = page.evaluate("JSON.parse(localStorage.getItem('wrldline:saved'))")
                check(len(saved) == 1, "saved locally")
                page.locator("#tab-saved").click(); check(page.locator(".wp-article").count() == 1, "saved tab")
                # reading history is off by default and records nothing until opted in
                page.locator("#tab-feed").click()
                page.locator(".wp-article a").first.evaluate("a => a.addEventListener('click', e => e.preventDefault(), {once:true})")
                page.locator(".wp-article h3").first.click()
                check(page.evaluate("localStorage.getItem('wl:reading:v1')") is None, "no history without consent")
                page.locator("#tab-follows").click()
                page.locator("input[type=checkbox]").check()
                page.locator("#tab-feed").click()
                page.locator(".wp-article a").first.evaluate("a => a.addEventListener('click', e => e.preventDefault(), {once:true})")
                page.locator(".wp-article h3").first.click()
                hist = page.evaluate("JSON.parse(localStorage.getItem('wl:reading:v1'))")
                check(len(hist) == 1 and set(hist[0]) == {"id", "category", "country", "source", "at"}, f"history shape {hist}")
                page.locator("#tab-follows").click(); page.locator("input[type=checkbox]").uncheck()
                check(page.evaluate("localStorage.getItem('wl:reading:v1')") is None, "history wiped on opt-out")
                check(no_horizontal_overflow(page), "overflow after interactions")
                page.screenshot(path=f"/tmp/for-you-{lang}-{vp_name}.png")
                check(not errors, f"page errors {errors}")
                ctx.close()
        # failure state is graceful
        ctx = b.new_context(); install_routes(ctx, rows=[])
        ctx.route("**/rest/v1/rpc/public_home_news_recent_v4", lambda r, q: r.fulfill(status=500, body="{}"))
        page = ctx.new_page(); page.goto(f"{base}/for-you.html?lang=en")
        page.wait_for_selector("[role=alert]"); check("Could not load" in page.locator("[role=alert]").inner_text(), "error state")
        b.close()
    print("for-you browser tests passed")

if __name__ == "__main__": run()
