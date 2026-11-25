"""Pointer target size QA (WCAG 2.2 SC 2.5.8) across Arabic/English, phone/desktop.

Runs against the local static site. Fails when an interactive control renders
smaller than 24x24 CSS px without a larger wrapper (an ancestor link, button or
label) and without being an inline link inside running prose.

Run: python tests/touch-targets-browser.py
"""
import asyncio
import json
import os
import sys

from playwright.async_api import async_playwright

SITE = os.environ.get("WRLDLINE_TEST_SITE", "http://127.0.0.1:4173")
# CI installs Playwright's own Chromium; local runs can point at a system build.
CHROMIUM = os.environ.get("CHROMIUM_PATH")
PAGES = ["index.html", "markets.html", "about.html", "markets.html?lang=en", "about.html?lang=en"]
VIEWPORTS = {"phone": {"width": 375, "height": 740}, "desktop": {"width": 1280, "height": 900}}
MIN = 24

MEASURE = """
() => {
  const MIN = 24;
  const out = [];
  const visible = (el) => {
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) !== 0;
  };
  const isProseLink = (el) => {
    // Inline links inside a paragraph of running text are exempt in WCAG 2.2.
    const block = el.closest("p, li, figcaption, blockquote");
    if (!block) return false;
    const words = (block.innerText || "").trim().split(/\\s+/).filter(Boolean).length;
    return words > 12 && getComputedStyle(el).display === "inline";
  };
  const controls = document.querySelectorAll(
    'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  for (const el of controls) {
    if (!visible(el)) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    if (el.tagName === "INPUT" && ["checkbox", "radio"].includes(el.type)) continue; // the label is the target
    if (isProseLink(el)) continue;
    if (rect.width >= MIN && rect.height >= MIN) continue;
    const wrapper = el.closest("a, button, label");
    if (wrapper && wrapper !== el) {
      const wr = wrapper.getBoundingClientRect();
      if (wr.width >= MIN && wr.height >= MIN) continue;
    }
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === "string" ? el.className : "").trim().slice(0, 40),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30),
    });
  }
  return out;
}
"""


async def main():
    failures = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROMIUM) if CHROMIUM else await p.chromium.launch()
        for vp_name, viewport in VIEWPORTS.items():
            for page_path in PAGES:
                context = await browser.new_context(viewport=viewport, locale="ar-SA")
                page = await context.new_page()

                async def route(route, request=page):
                    url = route.request.url
                    if "supabase.co" in url:
                        body = json.dumps([])
                        return await route.fulfill(status=200, content_type="application/json", body=body)
                    if "googleapis" in url or "gstatic" in url or "fonts." in url:
                        return await route.fulfill(status=200, content_type="text/css", body="")
                    if not url.startswith(SITE):
                        return await route.fulfill(status=204, body="")
                    return await route.continue_()

                await context.route("**/*", route)
                await page.goto(f"{SITE}/{page_path}", wait_until="load")
                await page.wait_for_timeout(1200)
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(600)
                await page.evaluate("window.scrollTo(0, 0)")

                small = await page.evaluate(MEASURE)
                overflow = await page.evaluate(
                    "() => document.documentElement.scrollWidth - window.innerWidth"
                )
                if overflow > 0:
                    failures.append(f"{vp_name} {page_path}: horizontal overflow {overflow}px")
                for item in small:
                    failures.append(
                        f"{vp_name} {page_path}: <{item['tag']}> {item['w']}x{item['h']} "
                        f"({item['cls'] or 'no class'}) {item['text']!r}"
                    )
                print(f"{vp_name} {page_path}: {len(small)} undersized target(s), overflow {overflow}px")
                await context.close()
        await browser.close()

    if failures:
        print("\nFAIL")
        for line in failures:
            print(" -", line)
        return 1
    print("\nOK: every interactive target is at least 24x24 CSS px")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
