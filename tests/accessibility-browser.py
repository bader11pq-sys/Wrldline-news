"""Accessibility regression: rendered pages, Arabic RTL / English LTR, desktop and mobile.

Uses the vendored axe-core 4.14.1 and fails on any serious or critical violation.
Moderate/minor issues are reported for tracking but do not fail the build, so the
gate is strict where it matters and stable against cosmetic rules.
Network is mocked through the shared pw_site helpers; nothing leaves the machine.
"""
import json, os, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__) + "/lib")
from pw_site import serve, browser, VIEWPORTS, install_routes, no_horizontal_overflow

AXE = open(os.path.join(os.path.dirname(__file__), "vendor", "axe.min.js"), encoding="utf-8").read()
PAGES = [
    "index.html", "sections.html", "countries.html", "country.html?c=SAU",
    "economy.html", "news-map.html", "for-you.html", "markets.html", "account.html",
]
FAIL_IMPACTS = {"serious", "critical"}


def audit(page):
    page.add_script_tag(content=AXE)
    return page.evaluate("""async () => {
      const r = await axe.run(document, {resultTypes: ['violations']});
      return r.violations.map(v => ({
        id: v.id, impact: v.impact, help: v.help,
        nodes: v.nodes.slice(0, 4).map(n => ({target: n.target.join(' '), html: n.html.slice(0, 140)}))
      }));
    }""")


def run():
    failures, notes = [], []
    with serve() as base, sync_playwright() as p:
        b = browser(p)
        for lang in ("ar", "en"):
            for vp_name, vp in VIEWPORTS.items():
                ctx = b.new_context(viewport=vp, locale="ar-SA" if lang == "ar" else "en-GB")
                install_routes(ctx)
                page = ctx.new_page()
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                for spec in PAGES:
                    url = f"{base}/{spec}" + ("&" if "?" in spec else "?") + f"lang={lang}"
                    tag = f"{spec} [{lang}/{vp_name}]"
                    page.goto(url, wait_until="load", timeout=30000)
                    page.wait_for_timeout(900)
                    if spec == "for-you.html":
                        page.wait_for_selector("#forYouApp .wp-card, #forYouApp .wp-notice", timeout=15000)
                    for v in audit(page):
                        line = f"{tag} {v['impact']} {v['id']}: {v['help']} -> " + \
                               "; ".join(n["target"] for n in v["nodes"])
                        (failures if v["impact"] in FAIL_IMPACTS else notes).append(line)
                    if no_horizontal_overflow(page) is False:
                        failures.append(f"{tag} horizontal overflow")
                ctx.close()
        b.close()
    for n in notes:
        print("NOTE", n)
    if failures:
        print("\n".join("FAIL " + f for f in failures))
        raise SystemExit(f"{len(failures)} serious/critical accessibility violations")
    print(f"Accessibility QA passed: {len(PAGES)} pages x AR/EN x desktop/mobile, no serious or critical axe violations ({len(notes)} moderate notes)")


if __name__ == "__main__":
    run()
