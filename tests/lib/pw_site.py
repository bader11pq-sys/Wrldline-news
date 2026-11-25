"""Shared Playwright helpers: static server, Supabase interception, layout assertions."""
import contextlib, http.server, json, os, socketserver, threading
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
import glob
def _find_chromium():
    if os.environ.get("CHROMIUM_PATH"): return os.environ["CHROMIUM_PATH"]
    for pattern in ("~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"):
        found = sorted(glob.glob(os.path.expanduser(pattern)))
        if found: return found[-1]
    return None  # fall back to Playwright's own managed browser
CHROMIUM = _find_chromium()

class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass

@contextlib.contextmanager
def serve():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try: yield f"http://127.0.0.1:{httpd.server_address[1]}"
    finally: httpd.shutdown()

def iso(hours_ago):
    return (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")

def news_rows():
    base = dict(summary="", image_url=None, lang="ar", source_language="ar", source_scope="international", language_detection="declared",
                url=None, source_url=None, is_breaking=False, verification=None, media_type="text", content_type="news",
                article_translations=[], editorial_trust_status="unconfirmed", newsdata_only=False)
    spec = [
        ("اتفاق جديد حول النفط وأسعار الطاقة", "economy", "Saudi Arabia", "وكالة أ", 1, "confirmed"),
        ("Central bank holds interest rate steady as inflation cools", "economy", "United States", "Wire B", 2, "unconfirmed"),
        ("انتخابات رئاسية في البرازيل", "politics", "Brazil", "وكالة ج", 3, "unconfirmed"),
        ("Football: cup final ends in dramatic penalty shootout", "sports", "France", "Sport D", 4, "unconfirmed"),
        ("علماء يعلنون اكتشافاً جديداً في الفضاء", "science", "", "وكالة هـ", 5, "confirmed"),
        ("New AI model released by research lab", "tech", "United States", "Tech F", 6, "unconfirmed"),
        ("فيضانات تضرب مناطق واسعة", "environment", "Pakistan", "وكالة ز", 30, "disputed"),
        ("Archive: older budget story", "economy", "Egypt", "Wire H", 24 * 12, "unconfirmed"),
    ]
    rows = []
    for i, (title, cat, country, src, hrs, trust) in enumerate(spec):
        r = dict(base); ar = any("\u0600" <= c <= "\u06ff" for c in title)
        r.update(id=f"00000000-0000-4000-8000-{i+1:012d}", title=title, category=cat, country=country, event_country=country,
                 source_name=src, published_at=iso(hrs), lang="ar" if ar else "en", source_language="ar" if ar else "en",
                 editorial_trust_status=trust, url=f"https://example.org/{i}", is_breaking=(i == 0))
        rows.append(r)
    return rows

def install_routes(context, rows=None, extra=None):
    rows = rows if rows is not None else news_rows()
    calls = []
    def handler(route, request):
        url = request.url; calls.append((request.method, url))
        if extra:
            res = extra(route, request)
            if res: return
        if "/rest/v1/rpc/public_home_news_recent_v" in url:
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(rows))
        if "/rest/v1/rpc/public_news_article" in url:
            pid = json.loads(request.post_data or "{}").get("p_id")
            return route.fulfill(status=200, content_type="application/json", body=json.dumps([r for r in rows if r["id"] == pid]))
        if "/auth/v1/" in url:
            return route.fulfill(status=200, content_type="application/json", body=json.dumps({"data": {"session": None}}))
        if "supabase.co" in url:
            return route.fulfill(status=200, content_type="application/json", body="[]")
        if url.startswith("https://fonts.") or "googleapis" in url or "gstatic" in url:
            return route.fulfill(status=200, content_type="text/css", body="")
        if not url.startswith("http://127.0.0.1"):
            return route.fulfill(status=204, body="")
        return route.continue_()
    context.route("**/*", handler)
    return calls

VIEWPORTS = {"desktop": dict(width=1280, height=900), "mobile": dict(width=375, height=740)}

def no_horizontal_overflow(page):
    return page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")

def browser(p):
    kw = dict(headless=True, args=["--no-sandbox"])
    if CHROMIUM: kw["executable_path"] = CHROMIUM
    return p.chromium.launch(**kw)
