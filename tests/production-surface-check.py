#!/usr/bin/env python3
"""Read-only production surface check across the whole reader-facing site.

Checks each surface in both languages and at both breakpoints for the things a
reader would notice: does it load, does it render text, is the direction right,
is there a canonical and hreflang set, is structured data present, does anything
overflow horizontally, and does the console stay clean.

No writes, no logins, no clicks that mutate state. Output is JSON plus a table,
so the same run can feed a report and a CI job.

Usage:
  python3 tests/production-surface-check.py
  python3 tests/production-surface-check.py --json /tmp/surface.json
"""
import argparse
import json
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "https://al-ghaib.us.ci"
SAMPLE_ARTICLE = "08067519-0f33-46ef-820d-fb98e751c234"

# (label, path, viewport, expectations)
TARGETS = [
    ("home/ar/mobile", "/", (390, 844), {"feed": True}),
    ("home/en/desktop", "/?lang=en", (1440, 900), {}),
    ("article/ar/mobile", f"/news/{SAMPLE_ARTICLE}", (390, 844), {"article": True}),
    ("article/en/desktop", f"/news/{SAMPLE_ARTICLE}?lang=en", (1440, 900), {"article": True}),
    ("section/ar/mobile", "/section/politics", (390, 844), {"links": True}),
    ("section/en/desktop", "/section/economy?lang=en", (1440, 900), {"links": True}),
    ("countries/ar/mobile", "/countries.html", (390, 844), {"links": True}),
    ("country/ar/desktop", "/country.html?c=SAU", (1440, 900), {}),
    ("economy/ar/mobile", "/economy.html", (390, 844), {}),
    ("map/ar/desktop", "/news-map.html", (1440, 900), {}),
    ("feed/signed-out/mobile", "/for-you.html", (390, 844), {}),
    ("desk/signed-out/desktop", "/admin.html?lang=en", (1440, 900), {"desk": True}),
    ("dossier/ar/mobile", "/dossier/bab-al-mandab-2026.html", (390, 844), {}),
]


def audit(page, response, label, path, expect):
    html = page.content()
    body_text = page.inner_text("body")
    metrics = page.evaluate("""() => {
      const de = document.documentElement;
      return {
        scrollWidth: de.scrollWidth,
        clientWidth: de.clientWidth,
        scrollHeight: de.scrollHeight,
        title: document.title,
        lang: de.getAttribute('lang') || '',
        dir: de.getAttribute('dir') || getComputedStyle(de).direction,
        canonical: (document.querySelector('link[rel=canonical]') || {}).href || '',
        hreflang: document.querySelectorAll('link[rel=alternate][hreflang]').length,
        jsonld: Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
                  .map(s => { try { return JSON.parse(s.textContent)['@type'] || '' } catch (e) { return 'invalid' } }),
        headings: document.querySelectorAll('h1').length,
        links: document.querySelectorAll('a[href]').length,
        images: document.querySelectorAll('img').length,
        brokenImages: Array.from(document.querySelectorAll('img')).filter(i => i.complete && i.naturalWidth === 0).length,
        qualityCss: !!document.querySelector('link[href*="quality.css"]'),
        skeletons: document.querySelectorAll('[aria-hidden="true"][class*="skeleton"]').length,
      };
    }""")
    metrics.update({
        "label": label,
        "path": path,
        "status": response.status if response else None,
        "textLength": len(body_text.strip()),
        "overflowPx": max(0, metrics["scrollWidth"] - metrics["clientWidth"]),
        "titleLength": len(metrics["title"]),
        "rtl": metrics["dir"].lower() == "rtl",
    })
    # Surface-specific facts a reader would notice.
    if expect.get("feed"):
        metrics["cards"] = page.eval_on_selector_all(
            "#newsGrid a[href*='/news/'], #newsGrid article", "els => els.length")
        metrics["earlyFeed"] = page.evaluate("() => !!window.__wlEarlyFeed")
    if expect.get("article"):
        metrics["paragraphs"] = page.eval_on_selector_all("article p, main p", "els => els.length")
        metrics["hasNewsArticle"] = "NewsArticle" in metrics["jsonld"]
        metrics["qualityCssOnArticle"] = metrics["qualityCss"]
    if expect.get("links"):
        metrics["contentLinks"] = page.eval_on_selector_all("main a[href], .grid a[href], #countries a[href]", "els => els.length")
    if expect.get("desk"):
        metrics["deskHidden"] = page.evaluate("""() => {
          const el = document.querySelector('#newsroomDesk');
          if (!el) return null;
          const style = getComputedStyle(el);
          return el.hidden || style.display === 'none' || style.visibility === 'hidden';
        }""")
    return metrics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", default="/tmp/production-surface.json")
    parser.add_argument("--executable", default="/home/user/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome")
    args = parser.parse_args()

    rows = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=args.executable, args=["--no-sandbox"])
        for label, path, viewport, expect in TARGETS:
            page = browser.new_page(viewport={"width": viewport[0], "height": viewport[1]})
            console_errors, failed_requests, rpc_calls = [], [], []
            page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
            page.on("requestfailed", lambda r: failed_requests.append(r.url) if r.url.startswith(BASE) else None)
            page.on("request", lambda r: rpc_calls.append(r.url.split("/rest/v1/")[-1].split("?")[0])
                    if "/rest/v1/" in r.url else None)
            try:
                response = page.goto(BASE + path, wait_until="networkidle", timeout=45000)
            except Exception as error:  # networkidle can time out on live polling
                response = None
                console_errors.append(f"navigation: {str(error)[:120]}")
            row = audit(page, response, label, path, expect)
            row["consoleErrors"] = console_errors[:5]
            row["failedRequests"] = failed_requests[:5]
            row["rpc"] = rpc_calls[:6]
            rows.append(row)
            page.close()
        browser.close()

    failures = []
    for r in rows:
        if r["status"] not in (200, None):
            failures.append(f"{r['label']}: HTTP {r['status']}")
        if r["textLength"] < 400:
            failures.append(f"{r['label']}: only {r['textLength']} chars of text")
        if r["overflowPx"] > 2:
            failures.append(f"{r['label']}: horizontal overflow {r['overflowPx']}px")
        if r["consoleErrors"]:
            failures.append(f"{r['label']}: console errors")
        if r["titleLength"] == 0:
            failures.append(f"{r['label']}: no title")
        if r["canonical"] == "":
            failures.append(f"{r['label']}: no canonical")

    payload = {"base": BASE, "checked_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
               "rows": rows, "failures": failures}
    with open(args.json, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)

    header = f"{'surface':28} {'status':6} {'text':>6} {'links':>5} {'hre':>3} {'jsonld':22} {'ovf':>4} {'err':>3}"
    print(header)
    for r in rows:
        jsonld = ",".join(t for t in r["jsonld"] if t)[:22]
        print(f"{r['label']:28} {str(r['status']):6} {r['textLength']:>6} {r['links']:>5} {r['hreflang']:>3} {jsonld:22} {r['overflowPx']:>4} {len(r['consoleErrors']):>3}")
    print()
    for f in failures:
        print("FAIL", f)
    print(f"\n{len(rows)} surfaces checked, {len(failures)} problem(s) — details in {args.json}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
