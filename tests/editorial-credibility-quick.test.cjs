"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const html = read("admin.html");
const js = read("admin.js");
const migration = read("supabase/migrations/20261126120000_editor_credibility_quick_switch.sql");

const STATUSES = ["unconfirmed", "single", "multi", "confirmed", "field_confirmed", "official_confirmed", "disputed", "corrected", "retracted"];

test("the editorial dashboard exposes one immediate credibility selector", () => {
  const fieldset = html.match(/<fieldset class="credibility-quick" id="credibilityQuick">[\s\S]*?<\/fieldset>/);
  assert.ok(fieldset, "quick credibility fieldset exists");
  const options = [...fieldset[0].matchAll(/<option value="([a-z_]+)">/g)].map(match => match[1]);
  assert.deepEqual(options.sort(), STATUSES.slice().sort(), "every supported status stays available");
  assert.match(fieldset[0], /id="credibilitySaveState"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.doesNotMatch(fieldset[0], /type="url"|required/, "the quick switch never requires evidence URLs");
  assert.match(html, /credibility-advanced[\s\S]*trustStoryStatus/, "the strict evidence review is still available below");
});

test("the quick switch saves on change without a mandatory note or source", () => {
  const handler = js.match(/let credibilityWriting=false;[\s\S]*?\n\}\);/);
  assert.ok(handler, "change handler exists");
  assert.doesNotMatch(handler[0], /trustClaimNote|trustEvidenceUrl|trustReviewNote/);
  assert.match(handler[0], /p_note:note\|\|null/, "the note is optional");
  assert.match(handler[0], /set_article_credibility/);
  assert.match(handler[0], /state\.classList\.add\("is-saved"\)/);
  assert.match(handler[0], /select\.value=previous/, "a failed save reverts the control");
  assert.match(js, /CREDIBILITY_VALUES\.includes\(story\.verification\)/, "the selector restores the saved granular status");
});

test("the database keeps the audit trail and every existing credibility level", () => {
  for (const status of STATUSES) assert.ok(migration.includes(`'${status}'`), status);
  assert.match(migration, /create or replace function public\.set_article_credibility/);
  assert.match(migration, /private\.trust_is_editor\(\)/);
  assert.match(migration, /set_config\('wrldline\.credibility_override','on',true\)/);
  assert.match(migration, /trust_reviewed_by:=auth\.uid\(\)/);
  assert.match(migration, /trust_review_note=coalesce\(nullif\(btrim\(p_note\),''\),a\.trust_review_note\)/);
  assert.match(migration, /p_note text default null/, "the note parameter stays optional");
  assert.match(migration, /revoke all on function public\.set_article_credibility\(uuid,text,text\) from public,anon/);
});
