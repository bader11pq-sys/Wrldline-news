# Staging migration runbook — three pending editorial migrations

Status: **rehearsed locally, not applied to any hosted project.** Production is untouched.

Scope: `20261126030000_editor_role_helper_execute.sql`, `20261126020000_newsroom_desk.sql`,
`20261126010000_personalized_feed.sql`.

## 1. What is being prepared

| Migration | Objects | Rollback |
| --- | --- | --- |
| `20261126030000` | `GRANT EXECUTE ON FUNCTION private.trust_is_editor() TO authenticated` | revoke |
| `20261126020000` | `editor_newsroom_overview()`, `editor_article_queue()`, `editor_source_summary()`, table `article_review_notes` (RLS) | drop objects |
| `20261126010000` | `get_personalized_feed()`, `record_article_read()`, `clear_reading_history()`, table `user_reading_history` (RLS), `user_preferences.personalize_from_history` / `reading_history_opt_in` | drop objects, restore columns |

Order matters: the grant unblocks the editor RLS policies that the desk objects depend on, and the desk
migration is written against that grant. The feed migration is independent but is applied last so a
failure cannot mask a desk problem.

## 2. Local validation already completed

Run with the repository's Postgres-in-WASM harnesses, which execute the real SQL files:

```bash
NODE_PATH=<pglite modules> node --test tests/feed-db.test.cjs tests/newsroom-desk-db.test.cjs tests/editor-role-helper-grant.test.cjs
```

24 tests pass, covering exactly the questions in the task:

| Concern | Test |
| --- | --- |
| RLS policies | history table guarded by read/delete policies; direct writes blocked; readers see only their own rows |
| Editor permissions | a policy calling a helper revoked from `authenticated` fails with `permission denied for function`; the grant makes it work |
| Feed functions | `get_personalized_feed` returns a bounded, ordered projection; unpublished rows excluded |
| Reading history | recorded only after opt-in; cap keeps newest 500; one row per article; `read_count` caps at 1000 |
| Consent and clear-history | withdrawing consent wipes stored history; `clear_reading_history()` empties only the caller's rows |
| Rollback and re-application | each `.down.sql` restores the prior schema, is idempotent, and re-application succeeds |
| Existing data | the harness seeds rows before migration and asserts they survive, including `user_preferences` follows |

What local validation cannot prove: hosted PostgREST schema-cache behaviour, real JWT claims issued by
Supabase Auth, and timing on production data volumes. Those are the staging project's job.

## 3. Staging project setup (owner action, one time)

1. Create a Supabase project named `wrldline-staging` in the same region.
2. Record its project ref; it must not be `vmaxbnogmmfyrcucapnq`.
3. Build the schema by applying the repository's migrations in order (`supabase db push` against the
   staging project, or `psql -1 -f` each file in lexical order). The repository is the schema source of
   truth; do not clone production data.
4. Add these repository secrets:

| Secret | Value |
| --- | --- |
| `STAGING_SUPABASE_URL` | `https://<staging-ref>.supabase.co` |
| `STAGING_DB_URL` | pooled or direct Postgres URL for the staging project |
| `STAGING_ANON_KEY` | staging publishable/anon key |

5. Create the `supabase-staging` environment (no reviewers needed — it cannot reach production).

## 4. Rehearsal sequence

Each phase is a separate dispatch of `.github/workflows/staging-migrations.yml` with
`acknowledge_staging=STAGING`. The workflow refuses to run otherwise, and the script refuses any URL
containing the production ref.

| Phase | Command it runs | Expected evidence |
| --- | --- | --- |
| `baseline` | `probe-backend.mjs --expect=absent` | five functions `PGRST202`, two tables `PGRST205`, two columns `42703` |
| `up` | `staging-migrations.sh --phase up --confirm` | three files applied in one transaction each |
| `verify` | `probe-backend.mjs --expect=applied` | objects present; anonymous callers refused; no anonymous rows; existing public RPCs still 200 |
| `roundtrip` | `--phase roundtrip` | up → down → up succeeds, proving both scripts and idempotency |
| `down` | `--phase down` | staging left clean |

Manual checks that belong in the `verify` phase but need a signed-in session (do these in the staging
project's SQL editor, using test users whose `app_metadata.role` is `editor`, `admin` and none):

```sql
-- editor can read the desk surfaces, a reader cannot
select count(*) from public.editor_article_queue(20, 0);
select count(*) from public.editor_source_summary();

-- the desk's review note write obeys RLS
insert into public.article_review_notes(article_id, note, created_by)
values ('<published-article-uuid>', 'staging note', auth.uid());

-- feed and history obey consent
select * from public.get_personalized_feed(20, 0);
select public.record_article_read('<published-article-uuid>');   -- must be a no-op before opt-in
update public.user_preferences set personalize_from_history = true, reading_history_opt_in = true where user_id = auth.uid();
select public.record_article_read('<published-article-uuid>');
select count(*) from public.user_reading_history;                 -- 1
select public.clear_reading_history();
select count(*) from public.user_reading_history;                 -- 0
```

## 5. Production application (requires explicit approval)

Not part of this runbook's execution. When approved:

1. Take a database backup and record its identifier.
2. Apply in the same order, one migration per run, verifying with
   `node scripts/probe-backend.mjs --expect=applied` after each step.
3. Confirm the public surfaces are unchanged: `node scripts/verify-deployment.mjs` still passes for the
   static site and Worker routes.
4. If any step fails, run the corresponding `.down.sql`, then re-run the probe.

No production data is rewritten by any of these three migrations: they add functions, one table, two
columns and a grant. The rollback files drop only what they created.

## 6. Known limits

- `private.trust_is_editor()` is not reachable from the public REST API, so the grant itself can only be
  verified from the database side (`has_function_privilege('authenticated', 'private.trust_is_editor()', 'execute')`).
  The staging `verify` phase should record that query's output.
- The desk's editor functions depend on JWT `app_metadata.role`; anonymous probes can only prove they are
  not open to the public, not that an editor succeeds. That is why the manual SQL above exists.
