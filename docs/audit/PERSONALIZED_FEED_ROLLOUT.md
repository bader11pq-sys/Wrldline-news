# Personalized feed: backend rollout plan

Status: **not applied in production.** This document is the approval package for
`supabase/migrations/20261126010000_personalized_feed.sql`. Nothing here has been applied to any
project, and no production data has been touched.

## 1. What is missing, measured

Probed read-only against the production project (`vmaxbnogmmfyrcucapnq.supabase.co`) with the
publishable key on 2026-11-25. Reproduce with `node scripts/verify-feed-backend.mjs`.

| Object | Result | Evidence |
| --- | --- | --- |
| `public.user_reading_history` | MISSING | `PGRST205`: not in schema cache |
| `public.record_article_read(uuid)` | MISSING | `PGRST202`: not in schema cache |
| `public.clear_reading_history()` | MISSING | `PGRST202`: not in schema cache |
| `user_preferences.personalize_from_history` | MISSING | `42703`: column does not exist |

Consequence for a signed-in reader on the deployed site today:

- the personalise switch cannot be saved — the `upsert` writes a column that does not exist, so the
  write fails and the UI shows a sync error;
- reading history is never recorded (the RPC failure is swallowed on purpose in `for-you.js`, so the
  page still renders);
- "clear history" reports a sync error instead of clearing.

The signed-out page is unaffected: it returns 200 and renders the standard feed.

## 2. What the migration adds

`20261126010000_personalized_feed.sql`, one transaction:

- `user_follows`: new target types plus a 200-follow cap enforced by a trigger;
- `user_preferences.personalize_from_history boolean not null default false` (opt-in, so no reader
  starts sharing history because of this deploy);
- `user_reading_history`: `primary key (user_id, article_id)`, `read_count` bounded 1–1000,
  indexes `(user_id, last_read_at desc)` and `(article_id)`;
- RLS enabled with **select and delete policies only** — no insert/update policy, so writes can only
  happen through the RPCs;
- `record_article_read(uuid)` and `clear_reading_history()`: `security definer`, `set search_path=''`,
  execute granted to `authenticated` only, 500-row retention cap;
- trigger that wipes stored history when consent is withdrawn (`personalize_from_history` → false).

Rollback: `supabase/rollbacks/20261126010000_personalized_feed.down.sql` (drops the objects; the only
data lost is reading history, which is derived and opt-in).

## 3. Preflight (staging, not production)

1. Confirm a staging project exists and is a copy of production schema. **Blocker:** this
   environment has no `SUPABASE_ACCESS_TOKEN`, database URL or service key, so the migration cannot
   be pushed from here. It needs either a staging project reference plus a token, or someone running
   the SQL in the staging SQL editor.
2. Confirm prerequisites are present in the target: `public.user_preferences`, `public.user_follows`,
   `public.articles(id)`, `gen_random_uuid()` (pgcrypto), roles `authenticator/anon/authenticated/
   service_role`.
3. Take a restore point / confirm PITR on the target before applying.
4. Apply, then re-run `SUPABASE_URL=https://<staging>.supabase.co SUPABASE_PUBLISHABLE_KEY=<anon key> node scripts/verify-feed-backend.mjs`; every row must read
   `PRESENT (blocked for anon)`.

Lock analysis: the new column has a constant default (`false`), which PostgreSQL 11+ adds without a
table rewrite. Everything else is `CREATE TABLE`/`CREATE INDEX`/`CREATE FUNCTION` on new objects.
The follow-limit trigger adds a small per-row count on insert into `user_follows`; it is bounded by
the 200-row cap.

## 4. Verification SQL

```sql
-- table, column and RLS state
select relrowsecurity from pg_class where oid = 'public.user_reading_history'::regclass;
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema='public' and table_name='user_preferences' and column_name='personalize_from_history';
select indexname from pg_indexes where tablename='user_reading_history';

-- policies: exactly two (select, delete), nothing for insert/update
select policyname, cmd, roles::text, qual, with_check from pg_policies
 where tablename='user_reading_history' order by policyname;

-- function shape and grants: authenticated only, anon excluded, definer + empty search_path
select p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('anon', p.oid, 'execute') as anon_can,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_can
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('record_article_read','clear_reading_history');

-- consent-withdrawal trigger present
select tgname from pg_trigger where tgrelid='public.user_preferences'::regclass and not tgisinternal;
```

Expected: `relrowsecurity = true`; column `boolean not null default false`; both indexes; two policies;
`prosecdef = true`, `proconfig = {search_path=""}`, `anon_can = false`, `auth_can = true`; trigger present.

## 5. Functional test (staging, signed in)

1. Sign in, open any article, wait a second, then check
   `select * from user_reading_history where user_id = auth.uid() order by last_read_at desc limit 5;`
   — one row, `read_count = 1`.
2. Re-open the same article: `read_count` becomes 2 on the same row (no duplicate).
3. Open 505 distinct articles: the table holds at most 500 rows for that user.
4. Turn the personalise switch on: `personalize_from_history = true`, and the feed reorders.
5. Turn it off: history rows are deleted (trigger) and the switch reads back false.
6. "Clear history": rows gone, no error toast.
7. Signed out: `/for-you.html` renders the standard feed, and the RPCs are rejected for `anon`
   (`permission denied`, not empty success).

## 6. Production apply

1. Same migration, same order, during a low-traffic window; it is one transaction and re-runnable
   only by restoring from backup, so take the restore point first.
2. Re-run the verifier against production; all four rows must be `PRESENT`.
3. Signed-in smoke test on `https://al-ghaib.us.ci/for-you.html`.
4. If anything fails: run the down script, re-run the verifier, expect `MISSING` and a page that still
   serves signed-out readers.

## 7. Approval needed

Deploying this requires Supabase credentials for a staging project (and then production) that are not
present in this environment. The SQL, tests and verifier are ready; the apply step is gated on
someone with database access.
