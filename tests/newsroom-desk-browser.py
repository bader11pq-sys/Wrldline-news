"""Browser test: newsroom desk in admin (network mocked, editor session seeded in storage)."""
import json, sys, re, os, time, base64
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__) + "/lib")
from pw_site import *

def check(cond, msg):
    if not cond: raise AssertionError(msg)

def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
UID = "11111111-1111-4111-8111-111111111111"
def session(role):
    exp = int(time.time()) + 3600
    jwt = ".".join([b64({"alg": "HS256", "typ": "JWT"}), b64({"sub": UID, "exp": exp, "role": "authenticated", "app_metadata": {"role": role}}), "sig"])
    return json.dumps({"access_token": jwt, "refresh_token": "r", "expires_in": 3600, "expires_at": exp, "token_type": "bearer",
                       "user": {"id": UID, "aud": "authenticated", "role": "authenticated", "email": "ed@example.com", "app_metadata": {"role": role}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"}})
aid = lambda n: f"00000000-0000-4000-8000-{n:012d}"
QUEUE = [{"id": aid(1), "title": "Draft awaiting review", "editorial_status": "draft", "trust_status": "unconfirmed", "trust_needs_review": True, "audience_lane": "world", "source_name": "Wire B",
          "published_at": None, "last_change_at": "2026-11-24T10:00:00Z", "change_count": 2, "correction_count": 0, "update_count": 0, "note_count": 1, "last_note_kind": "request_changes"},
         {"id": aid(2), "title": "عنوان منشور بالعربية", "editorial_status": "published", "trust_status": "confirmed", "trust_needs_review": False, "audience_lane": "arabic", "source_name": "Wire A",
          "published_at": "2026-11-24T08:00:00Z", "last_change_at": "2026-11-24T09:00:00Z", "change_count": 3, "correction_count": 1, "update_count": 1, "note_count": 0, "last_note_kind": None}]
OVERVIEW = {"generated_at": "2026-11-25T12:00:00Z", "window_days": 30, "by_status": {"draft": 4, "review": 2, "published": 90}, "review_backlog": 6, "needs_trust_review": 3,
            "published_by_trust": {"confirmed": 40, "unconfirmed": 50}, "published_by_day": [{"day": "2026-11-23", "count": 5}, {"day": "2026-11-24", "count": 9}],
            "changes_by_type": {"correction": 2, "updated": 8}, "story_updates_by_kind": {"update": 3}, "translations_awaiting_review": 4, "open_review_requests": 1}
SOURCES = [{"source_name": "Wire A", "policy_tier": "priority", "articles": 10, "published": 9, "confirmed": 5, "needs_review": 2, "corrections": 1, "last_published_at": "2026-11-24T08:00:00Z"}]

def handler(calls, notes, fail=None):
    def extra(route, request):
        url = request.url
        if "/rest/v1/rpc/editor_newsroom_overview" in url:
            calls.append("overview"); route.fulfill(status=200, content_type="application/json", body=json.dumps(OVERVIEW)); return True
        if "/rest/v1/rpc/editor_article_queue" in url:
            body = json.loads(request.post_data or "{}"); calls.append(("queue", body))
            if fail == "queue": route.fulfill(status=403, content_type="application/json", body=json.dumps({"message": "Editor/admin required"})); return True
            rows = [r for r in QUEUE if (not body.get("p_status") or r["editorial_status"] == body["p_status"])]
            route.fulfill(status=200, content_type="application/json", body=json.dumps(rows)); return True
        if "/rest/v1/rpc/editor_source_summary" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps(SOURCES)); return True
        if "/rest/v1/article_review_notes" in url:
            if request.method == "POST":
                notes.append(json.loads(request.post_data)); route.fulfill(status=201, body=""); return True
            route.fulfill(status=200, content_type="application/json", body=json.dumps([{"id": aid(50), "kind": "request_changes", "body": "Needs a second source", "created_at": "2026-11-24T11:00:00Z"}])); return True
        if "/rest/v1/" in url and "supabase.co" in url:
            route.fulfill(status=200, content_type="application/json", body="[]"); return True
        return False
    return extra

def open_admin(b, base, role, lang, vp, calls, notes, fail=None):
    ctx = b.new_context(viewport=vp)
    ctx.add_init_script("localStorage.setItem('sb-vmaxbnogmmfyrcucapnq-auth-token', %s); localStorage.setItem('wrldline:language','%s')" % (json.dumps(session(role)), lang))
    install_routes(ctx, extra=handler(calls, notes, fail)); page = ctx.new_page(); errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(base + "/admin.html"); return ctx, page, errors

def run():
    with serve() as base, sync_playwright() as p:
        b = browser(p)
        for lang in ("ar", "en"):
            for vp_name, vp in VIEWPORTS.items():
                tag = f"{lang}/{vp_name}"; calls, notes = [], []
                ctx, page, errors = open_admin(b, base, "editor", lang, vp, calls, notes)
                page.wait_for_selector("#newsroomDesk .desk-row", timeout=20000)
                check(page.locator("#newsroomDesk .desk-card").count() >= 8, "overview cards " + tag)
                check(page.locator("#newsroomDesk .desk-bar").count() == 2, "published per day bars")
                check(page.locator("#newsroomDesk .desk-row").count() == 2, "queue rows")
                check(page.locator("#deskSources tbody tr").count() == 1, "source table")
                check("priority" in page.locator("#deskSources").inner_text(), "policy tier shown")
                check(page.locator("#newsroomDesk .desk-badge.warn").count() >= 1, "change request flagged")
                # filter by status calls the RPC with the validated argument
                page.select_option("#deskStatusFilter", "published")
                page.wait_for_function("document.querySelectorAll('#newsroomDesk .desk-row').length == 1")
                check(any(isinstance(c, tuple) and c[1].get("p_status") == "published" for c in calls), "status filter sent")
                page.select_option("#deskStatusFilter", "")
                page.wait_for_function("document.querySelectorAll('#newsroomDesk .desk-row').length == 2")
                # internal note
                page.locator("#newsroomDesk .desk-row").first.locator("button[aria-expanded]").click()
                page.wait_for_selector("#newsroomDesk .desk-notes li", timeout=8000)
                check("Needs a second source" in page.locator("#newsroomDesk .desk-notes").inner_text(), "notes listed")
                page.locator("#newsroomDesk .desk-note-form textarea").fill("Please add an official statement")
                page.locator("#newsroomDesk .desk-note-form select").select_option("request_changes")
                page.locator("#newsroomDesk .desk-note-form button").click()
                page.wait_for_function("true"); time.sleep(0.8)
                check(notes and notes[0]["article_id"] == aid(1) and notes[0]["kind"] == "request_changes", "note posted: %s" % notes)
                check("created_by" not in notes[0], "author is set by the database, not the client")
                check(no_horizontal_overflow(page), "overflow " + tag)
                check(not errors, errors)
                if vp_name == "mobile" and lang == "ar": page.screenshot(path="/tmp/desk-ar-mobile.png", full_page=False)
                if vp_name == "desktop" and lang == "en":
                    page.locator("#newsroomDesk").screenshot(path="/tmp/desk-en-desktop.png")
                ctx.close()
        # admin role also works; the desk never offers a publish control
        calls, notes = [], []
        ctx, page, errors = open_admin(b, base, "admin", "en", VIEWPORTS["desktop"], calls, notes)
        page.wait_for_selector("#newsroomDesk .desk-row", timeout=20000)
        check(page.locator("#newsroomDesk button", has_text=re.compile("publish", re.I)).count() == 0, "no publish control in desk"); ctx.close()
        # server denial is shown, not hidden
        ctx, page, errors = open_admin(b, base, "editor", "en", VIEWPORTS["desktop"], [], [], fail="queue")
        page.wait_for_selector("#deskQueue .notice", timeout=20000)
        check("Editor/admin required" in page.locator("#deskQueue").inner_text(), "denial disclosed"); ctx.close()
        # a signed-in account without the editor role never sees the desk
        ctx, page, errors = open_admin(b, base, "subscriber", "en", VIEWPORTS["desktop"], [], [])
        page.wait_for_selector("#accessPanel:not(.hidden)", timeout=20000); time.sleep(0.8)
        check(page.locator("#newsroomDesk").is_hidden(), "desk hidden for non-editors")
        check(page.locator("#newsroomDesk .desk-row").count() == 0, "no desk content for non-editors"); ctx.close()
        b.close()
    print("Newsroom desk browser QA passed: editor/admin access, filters, notes, denial, non-editor hidden, AR/EN x desktop/mobile")
run()
