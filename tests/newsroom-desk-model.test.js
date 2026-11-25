const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../newsroom-desk-model.js");
const id = "00000000-0000-4000-8000-000000000001";

test("capabilities mirror the existing role model", () => {
  for (const cap of ["view_desk", "add_note"]) { assert.equal(D.can("editor", cap), true); assert.equal(D.can("admin", cap), true); assert.equal(D.can("user", cap), false); assert.equal(D.can(undefined, cap), false); }
  assert.equal(D.can("editor", "set_breaking"), false); assert.equal(D.can("admin", "set_breaking"), true);
  assert.equal(D.can("admin", "delete_everything"), false);
});
test("overview normalisation drops unknown keys and coerces bad numbers", () => {
  const o = D.normalizeOverview({ by_status: { draft: 2, review: "x", published: -4, evil: 9 }, review_backlog: "7", window_days: 30, generated_at: "2026-11-25T10:00:00Z",
    published_by_day: [{ day: "2026-11-24", count: 3 }, { day: "bad", count: 1 }, null], changes_by_type: { correction: 2 } });
  assert.deepEqual(o.byStatus, { draft: 2, review: 0, published: 0, rejected: 0 });
  assert.equal(o.reviewBacklog, 7); assert.equal(o.series.length, 1); assert.equal(o.changes.correction, 2);
  assert.equal("evil" in o.byStatus, false);
  assert.equal(D.normalizeOverview(null), null); assert.equal(D.normalizeOverview([]), null);
});
test("bar heights scale to the busiest day and zero stays empty", () => {
  const b = D.barHeights([{ day: "a", count: 0 }, { day: "b", count: 1 }, { day: "c", count: 10 }]);
  assert.deepEqual(b.map((x) => x.pct), [0, 10, 100]);
  assert.deepEqual(D.barHeights([]), []);
});
test("queue arguments are validated and paged", () => {
  assert.deepEqual(D.queueArgs({ status: "published", trust: "x", q: "  oil " }, 2, 25), { p_status: "published", p_trust: null, p_q: "oil", p_limit: 25, p_offset: 50 });
  assert.deepEqual(D.queueArgs({ status: "hacked", q: "   " }, -3, 99999), { p_status: null, p_trust: null, p_q: null, p_limit: 200, p_offset: 0 });
  assert.equal(D.queueArgs({ q: "x".repeat(500) }, 0, 10).p_q.length, 120);
});
test("queue rows with unusable ids are rejected and enums are clamped", () => {
  assert.equal(D.normalizeRow({ id: "not-an-id", title: "t" }), null);
  const r = D.normalizeRow({ id, title: "T", editorial_status: "weird", trust_status: "weird", change_count: "3", last_note_kind: "x" });
  assert.equal(r.status, "draft"); assert.equal(r.trust, "unconfirmed"); assert.equal(r.changes, 3); assert.equal(r.lastNoteKind, null);
});
