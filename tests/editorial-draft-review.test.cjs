const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "editorial-draft-review.js"), "utf8");

function setup(role, rows) {
  const dom = new JSDOM('<!doctype html><body><section id="aiProviderPanel"></section></body>', { url: "https://editor.test/admin.html", runScripts: "outside-only", pretendToBeVisual: true });
  const calls = [];
  dom.window.confirm = () => true;
  dom.window.WRLDLINE_ADMIN_DB = {
    auth: { getSession: async () => ({ data: { session: { user: { app_metadata: { role } } } } }), onAuthStateChange() {} },
    from(table) { calls.push(["from", table]); const q = { select() { return q; }, eq(c, v) { calls.push(["eq", c, v]); return q; }, order() { return q; }, limit: async () => ({ data: rows, error: null }) }; return q; },
    rpc: async (name, args) => { calls.push(["rpc", name, args]); return { error: null }; }
  };
  dom.window.eval(script);
  return { dom, calls };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const rows = [{ id: "p1", section: "hourly", slug: "h1", title: "<img src=x onerror=alert(1)>", status: "draft", generated_by: "gemini", updated_at: "2026-11-24T05:00:00Z", sources: [{ title: "s", publisher: "p", url: "javascript:alert(1)" }, { title: "ok", publisher: "q", url: "https://example.com/a" }], content: { executive_summary: "ملخص" } }];

test("draft review panel is hidden for non-editors and queries nothing", async () => {
  const { dom, calls } = setup("user", rows);
  await wait(900);
  assert.equal(dom.window.document.getElementById("editorialDraftReviewPanel").classList.contains("hidden"), true);
  assert.equal(calls.some(c => c[0] === "from"), false);
});

test("editor sees drafts rendered as text, unsafe links are not clickable, approve requires a note", async () => {
  const { dom, calls } = setup("editor", rows);
  await wait(1200);
  const d = dom.window.document;
  assert.equal(d.getElementById("editorialDraftReviewPanel").classList.contains("hidden"), false);
  assert.ok(calls.some(c => c[0] === "eq" && c[1] === "status" && c[2] === "draft"));
  assert.equal(d.querySelector("#editorialDraftReviewPanelList img"), null, "title must not be parsed as HTML");
  const links = [...d.querySelectorAll("#editorialDraftReviewPanelList a")].map(a => a.href);
  assert.deepEqual([...links], ["https://example.com/a"]);
  const [approve] = d.querySelectorAll("#editorialDraftReviewPanelList button");
  approve.click(); await wait(20);
  assert.equal(calls.some(c => c[0] === "rpc"), false, "no RPC without a note");
  d.querySelector("#editorialDraftReviewPanelList textarea").value = "راجعت المصدرين وتطابقت الوقائع";
  approve.click(); await wait(50);
  const rpc = calls.find(c => c[0] === "rpc");
  assert.equal(rpc[1], "review_editorial_publication");
  assert.deepEqual(JSON.parse(JSON.stringify(rpc[2])), { p_id: "p1", p_decision: "approve", p_note: "راجعت المصدرين وتطابقت الوقائع" });
});

test("the autopublisher stores AI output as drafts and never publishes or creates newsroom articles", () => {
  const src = fs.readFileSync(path.join(root, "supabase/functions/editorial-autopublisher/index.ts"), "utf8");
  assert.match(src, /status: "draft"/);
  assert.doesNotMatch(src, /status: "published", content/);
  assert.doesNotMatch(src, /from\("articles"\)\.insert/);
  assert.match(src, /obj\.action !== "publish"/);
});
