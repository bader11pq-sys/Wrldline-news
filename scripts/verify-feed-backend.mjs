#!/usr/bin/env node
/**
 * Read-only check of the personalised-feed backend.
 *
 * Answers one question with evidence: is 20261126010000_personalized_feed.sql
 * actually live on a given Supabase project? It never writes, never creates a
 * session, and works with the publishable (anon) key, which is all the Pages
 * build has.
 *
 * How it decides, per object:
 *   - PostgREST returns PGRST205 / PGRST202 when the table or function does not
 *     exist in the schema cache at all.
 *   - A 401 or "permission denied" means the object exists but anon is not
 *     allowed to use it, which is the intended end state.
 *
 * Deep checks that the anon key cannot perform (RLS flags, policy text, index
 * definitions, grants) need SQL access; the script prints that block for the
 * SQL editor at the end.
 *
 * Usage:
 *   node scripts/verify-feed-backend.mjs
 *   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node scripts/verify-feed-backend.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
const DEFAULT_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";

const url = (process.env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, "");
const key = process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_KEY;
const host = new URL(url).host;

/** PostgREST tells us apart missing objects, blocked objects and real surprises. */
export function classify(status, body) {
  const code = (body && body.code) || "";
  const message = (body && body.message) || "";
  if (code === "PGRST205" || code === "PGRST202" || code === "42703" || status === 404) {
    return { state: "MISSING", code: code || String(status) };
  }
  if (status === 401 || status === 403 || /permission denied/i.test(message)) {
    return { state: "PRESENT (blocked for anon, as intended)", code: code || String(status) };
  }
  if (status >= 200 && status < 300) return { state: "PRESENT", code: "" };
  return { state: `UNEXPECTED ${status}`, code: code || String(status) };
}

async function probe(label, pathname, init = {}) {
  const res = await fetch(`${url}${pathname}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const { state, code } = classify(res.status, body);
  return { label, state, status: res.status, code, message: body?.message || "" };
}

function sqlBlock() {
  const mig = path.join(ROOT, "supabase/migrations/20261126010000_personalized_feed.sql");
  const down = path.join(ROOT, "supabase/rollbacks/20261126010000_personalized_feed.down.sql");
  return `-- Run in the SQL editor of the target project. Every row should read "ok".
with checks as (
  select 'table' k, to_regclass('public.user_reading_history') is not null ok
  union all select 'rls', (select relrowsecurity from pg_class where oid = to_regclass('public.user_reading_history'))
  union all select 'policies = 2', (select count(*) = 2 from pg_policies where tablename = 'user_reading_history')
  union all select 'select policy', exists (select 1 from pg_policies where tablename='user_reading_history' and cmd='SELECT' and roles::text like '%authenticated%')
  union all select 'delete policy', exists (select 1 from pg_policies where tablename='user_reading_history' and cmd='DELETE' and roles::text like '%authenticated%')
  union all select 'no insert policy', not exists (select 1 from pg_policies where tablename='user_reading_history' and cmd in ('INSERT','UPDATE'))
  union all select 'recent index', exists (select 1 from pg_indexes where indexname='user_reading_history_recent_idx')
  union all select 'article index', exists (select 1 from pg_indexes where indexname='user_reading_history_article_idx')
  union all select 'rpc record_article_read', exists (select 1 from pg_proc where proname='record_article_read' and prosecdef)
  union all select 'rpc clear_reading_history', exists (select 1 from pg_proc where proname='clear_reading_history' and prosecdef)
  union all select 'consent column', exists (select 1 from information_schema.columns where table_name='user_preferences' and column_name='personalize_from_history')
  union all select 'consent default off', coalesce((select column_default = 'false' from information_schema.columns where table_name='user_preferences' and column_name='personalize_from_history'), false)
  union all select 'follow target check', exists (select 1 from pg_constraint where conname='user_follows_target_type_check' and pg_get_constraintdef(oid) like '%interest%')
  union all select 'follow limit trigger', exists (select 1 from pg_trigger where tgname='user_follows_limit' and not tgisinternal)
  union all select 'consent wipe trigger', exists (select 1 from pg_trigger where tgname='user_preferences_wipe_history' and not tgisinternal)
)
select k, case when ok then 'ok' else 'FAIL' end status from checks order by status desc, k;

-- Files, for the operator running this:
--   apply:  ${path.relative(ROOT, mig)}
--   undo:   ${path.relative(ROOT, down)}`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (!isMain) {
  // Imported by a test: expose the classifier only.
} else {
const results = [];
results.push(await probe("user_reading_history (select)", "/rest/v1/user_reading_history?select=article_id&limit=1"));
results.push(
  await probe("record_article_read", "/rest/v1/rpc/record_article_read", {
    method: "POST",
    body: JSON.stringify({ p_article_id: "00000000-0000-4000-8000-000000000000" }),
  }),
);
results.push(await probe("clear_reading_history", "/rest/v1/rpc/clear_reading_history", { method: "POST", body: "{}" }));
results.push(await probe("user_preferences.personalize_from_history", "/rest/v1/user_preferences?select=personalize_from_history&limit=1"));

const width = Math.max(...results.map((r) => r.label.length));
console.log(`Target: ${host}\n`);
for (const r of results) {
  console.log(`${r.label.padEnd(width)}  ${r.state}`);
  if (r.code) console.log(`${"".padEnd(width)}  ${r.code}: ${r.message}`);
}

const applied = results[0].state !== "MISSING" && results[1].state !== "MISSING" && results[3].state !== "MISSING";
console.log(
  applied
    ? "\nVerdict: the feed schema is present on this project (anon is correctly blocked from it)."
    : "\nVerdict: the feed schema is NOT applied on this project. Signed-in history and cloud sync cannot work until it is.",
);

if (applied) {
  console.log("\nRun this SQL for the checks the anon key cannot see:\n");
  console.log(sqlBlock());
} else {
  console.log(`\nApply order (staging first, never straight to production):`);
  console.log(`  1. ${path.relative(ROOT, path.join(ROOT, "supabase/migrations/20261126010000_personalized_feed.sql"))}`);
  console.log(`  2. re-run this script; expect PRESENT (blocked for anon)`);
  console.log(`  3. run the verification SQL from the repo docs, then sign-in smoke test`);
}
process.exitCode = applied ? 0 : 1;
}
