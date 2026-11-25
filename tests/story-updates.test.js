"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = f => fs.readFileSync(require("node:path").join(__dirname, "..", f), "utf8");

test("story updates: table is editor-only and public RPC is gated to published public-lane stories", () => {
  const sql = read("supabase/migrations/20261125170000_story_updates.sql");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /private\.trust_is_editor\(\)/);
  assert.doesNotMatch(sql, /grant [^;]*on public\.article_updates to[^;]*anon/);
  assert.match(sql, /editorial_status = 'published'/);
  assert.match(sql, /audience_lane in \('arabic','world'\)/);
  assert.match(sql, /grant execute on function public\.public_article_updates\(uuid\) to anon/);
});
test("story updates: public script renders text only", () => {
  const js = read("story-updates.js");
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.match(read("article-trust.js"), /story-updates\.js/);
});
test("story updates: admin panel is wired", () => {
  assert.match(read("admin.html"), /admin-updates\.js/);
  assert.doesNotMatch(read("admin-updates.js"), /\.rpc\(/);
});
