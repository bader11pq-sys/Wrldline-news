# WRLDLINE — Classification & Language Fix Worklog

## Task
Fix the issues in the attached audit report for WRLDLINE NEWS (repo `bader11pq-sys/Wrldline-news`):
1. Source language inferred from headline instead of source contract.
2. Original text shown without a clear source-language label; disclaimer called it a translation.
3. `category: "world"` and `country: "دولي"` used as ingestion defaults.
4. Frontend normalized unknown categories to `world`.
5. Classification worker duplicated between Supabase Cron and GitHub Actions.

## Production project
- Supabase project ref: `vmaxbnogmmfyrcucapnq`
- API URL: `https://vmaxbnogmmfyrcucapnq.supabase.co`
- Live site: `https://al-ghaib.us.ci`

## Key findings before changes
- `articles.category` default was `world`; `feeds.category` default was `world`.
- `bot-ingest.js` hardcoded `category:"world"`, `country:feed.country`, and inferred `lang` from the title.
- `wrldline-news-ingest` Edge Function used `feed.category` but fell back to `world`; country was always `غير محدد`.
- `script.js` mapped unknown category to `world` and defaulted country to `دولي`; the modal always called the text a translation.
- `article_translations` had no status/source columns.
- `classify-news-worker` processed only last hour, max 10, no atomic claim; `classify-pending.js` + GitHub Actions processed 1 pending + 1 failed every 30 min; Supabase cron ran every minute. Duplicate paths.
- Classification queue before backfill: 10,292 pending + 1,080 failed; 933 pending older than 48h; most pending were 6–48h old.
- `articles.category` counts before backfill: world 6,653 (6,066 pending), uncategorized 4,369, sports 231, politics 229, economy 221, culture 135, security 131, tech 127, health 52.
- `feeds.category` counts before backfill: world 126, sports 7, economy 6, politics 5, tech 4, culture 2, health 2.
- `article_translations` had 2,838 rows, all created 2026-11-12..14, no status.

## Files changed (in repo)
- `taxonomy.js` (new): browser/CommonJS shared taxonomy, category list, language resolver, source scope, translation labels.
- `supabase/functions/_shared/taxonomy.ts` (new): Edge Function mirror of the taxonomy.
- `script.js`: taxonomy-backed categories; unknown → `uncategorized`; country no longer defaults to `دولي`; source-language badge; translation status/source badge; provenance disclaimer; query includes new columns; saved-articles query updated; filter chips support science/environment/society/uncategorized.
- `index.html`: loads `taxonomy.js` before `language.js`/`script.js`; added filter chips; cache-busting `20261114-contract1`.
- `language.js`: locale resolver priority URL → stored → account (`wrldline:account-language`) → browser → Arabic; sets `lang`/`dir` immediately; browser suggestion is not persisted.
- `site-shell.js`: bilingual header/footer, sets `lang`/`dir` from URL/stored language; reloads on later language change.
- `bot-ingest.js`: requires `taxonomy.js`; loads `feeds` registry from Supabase; passes `feed.lang`/`feed.category`/`feed.source_scope`; no `world`/`دولي` defaults; writes `source_language`, `language_detection`, `source_scope`, `source_country`, `event_country`, `classification_reason`, `taxonomy_version`; exports functions for tests.
- `supabase/functions/wrldline-news-ingest/index.ts`: imports `_shared/taxonomy.ts`; no world fallback; writes source language/scope/category contract; uses `resolution=ignore-duplicates`; feed health writes category/lang/source_scope; translation completeness requires published status.
- `supabase/functions/classify-news/index.ts`: imports taxonomy; new schema fields `topic`, `secondary_topics`, `geographic_scope`, `topic_confidence`, `topic_reason`; prompt rules for topic/scope; high-confidence topic accepted (≥0.72), medium (≥0.55) suggestion, else uncategorized; writes `event_country`, `category`, `topics`, `geographic_scope`, `classification_confidence`, `classification_reason`, `classification_model_version`, `taxonomy_version`, clears claim; retries/dead-letter; `allow_backlog` up to 48h; expired/skipped statuses.
- `supabase/functions/classify-news-worker/index.ts` (rewritten): calls `expire_stale_classification_queue`, `release_stale_classification_claims`, `claim_classification_batch` (20/run), then `classify-news` in batches of 10 with `allow_backlog:true`; releases claims on failure; logs `classification_queue_stats`.
- `supabase/functions/translate-articles/index.ts`: machine translations saved as `translation_status:"review"`, `translation_source:"machine_draft"`, provider/model; not auto-published.
- `classify-pending.js`: manual fallback aligned to 48h window, retry_after filter, `allow_backlog:true`, handles expired/skipped.
- `supabase/migrations/20261114150000_classification_language_contract.sql` (new): DDL for article/feed/translation contract, category normalization triggers, audit table, queue RPCs, translation RLS, single classification cron job.
- `supabase/migrations/20261114151000_classification_language_backfill.sql` (new): feed language/scope/category remap, article source language/scope/country/category backfill, expire >48h queue; all changes audited.

## Migration status
- [x] `20261114150000_classification_language_contract.sql` applied.
- [x] `classification_status_constraint_fix` applied (expanded `ai_classification_status` to include `processing`, `expired`, `skipped`).
- [x] `20261114151000_classification_language_backfill.sql` applied after the constraint fix.
- [x] `20261114152000_article_source_contract_guard.sql` applied; insert test confirmed `world/غير محدد/ar` becomes `uncategorized/null/en/international`.
- [ ] Edge functions not yet deployed: `wrldline-news-ingest`, `classify-news`, `classify-news-worker`, `translate-articles`. The DB guard protects inserts from the old clients until deployment.
- [ ] Git commit/push not yet done.

## Backfill result (production)
- Articles: uncategorized 9,546; world 1,482; economy 346; sports 257; politics 250; culture 136; security 136; tech 130; health 50.
- Feeds: uncategorized 83; world 36; economy 10; sports 7; politics 7; tech 3; health 2; culture 2; environment 1; science 1.
- Source language: en 6,735; ar 5,950; null 47 (new rows from the old Edge Function before the guard; will be filled on next ingest).
- Source scope: international 7,830; national 3,200; unknown 1,702. No `دولي` pseudo-country remains.
- Queue: pending 9,783; failed 1,061; classified 771; expired 719; needs_review 15.
- Audit rows: source language 12,685; country/scope 12,685; source scope 10,027; category 5,487; expired 972; feed scope 129; feed category 91.

## Remaining steps
1. Deploy edge functions via Supabase CLI or MCP `deploy_edge_function`:
   ```bash
   supabase db push
   supabase functions deploy wrldline-news-ingest --no-verify-jwt
   supabase functions deploy classify-news --no-verify-jwt
   supabase functions deploy classify-news-worker --no-verify-jwt
   supabase functions deploy translate-articles --no-verify-jwt
   ```
2. After deploying, run one manual worker invocation and verify the backlog drops:
   ```bash
   curl -X POST "$SUPABASE_URL/functions/v1/classify-news-worker" \
     -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
     -H "x-wrldline-cron-secret: $CRON_SECRET"
   ```
3. Backfill the 47 null `source_language` rows after the new ingestion function is live.
4. Commit/push the repo changes.

## Completed in repo
- [x] `taxonomy.js` shared browser/CommonJS module.
- [x] `supabase/functions/_shared/taxonomy.ts` Edge mirror.
- [x] Frontend language/source/translation labels and category filters.
- [x] Ingestion and classification contract changes.
- [x] Single atomic classification worker.
- [x] GitHub workflows converted to manual `workflow_dispatch` only.
- [x] `tests/taxonomy.test.js` (8 tests passing).
- [x] `docs/classification-language-contract.md`.
- [x] Admin translation review section (publish/reject; machine translations stay hidden until published).
- [x] Service worker cache bumped to v55 and includes `taxonomy.js`.

## Verification queries / notes
- `feeds` category remap preview: uncategorized 83, world 36, economy 10, sports 7, politics 7, tech 3, culture 2, health 2, environment 1, science 1.
- Arabic-named feeds: 49, all already `lang='ar'`.
- `world` category before backfill: 6,076 pending + 468 failed + 117 classified + 8 needs_review.
- Queue age buckets: 0–1h pending 109/failed 35; 1–6h pending 708/failed 194; 6–24h pending 4,256/failed 676; 24–48h pending 4,299/failed 178; >48h pending 933.
- `article_translations` total 2,838, one per article, created 2026-11-12..14.
- RLS: public translations currently only require published article; migration changes to require `translation_status='published'`.
- The classification cron job is `wrldline-ai-classification-worker`, every minute. Migration unschedules all matching jobs and reschedules one.
- Ingestion cron jobs: `wrldline-general-ingestion` (every minute) and `wrldline-breaking-ingestion` (every minute, flags breaking) both call `wrldline-news-ingest`; not duplicates of the same mode.
- `bot.yml` GitHub Action also ingests every 5 minutes; make manual to avoid duplication.

## Useful commands
```bash
cd /home/ubuntu/Wrldline-news
node --check script.js
node --check bot-ingest.js
node --check language.js
node --check site-shell.js
node --check taxonomy.js
node --check classify-pending.js
```

## Commit attribution
Read `/home/ubuntu/skills/git-attribution/SKILL.md` before committing.
