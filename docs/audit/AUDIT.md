# Worldline News — Platform Audit (25 Nov 2026)

Scope: static review of the repository at `ba7cfa6` plus a local test run. No production systems were touched and no secrets were read.

## Architecture
- Static multi-page frontend (no build step; ~511 tracked files, 2.3 MB of top-level JS), Supabase (Postgres/RLS/Edge Functions, 22 functions, ~dozens of migrations), Cloudflare Workers (`wrldline-public` rendering, `wrldline-jobs` scheduler, `news-global-api`), GitHub Actions (12 workflows).
- Arabic-first, bilingual; history encyclopedia, map, markets, shorts, daily briefing, audience analytics, notifications, Stripe billing and rights desk already exist.

## Verified
- No credential-shaped strings found in tracked files (pattern scan for OpenAI/Google/Groq/service-role shapes).
- Legacy ingestion stays stopped: `wrldline-jobs` README documents general/breaking queues as paused; `breaking.yml` and `bot.yml` are diagnostic only; no workflow schedules ingestion. Scheduled workflows are only CodeQL, design discovery and an opt-in freshness monitor.
- Tests: with CI tooling installed, 216 pass / 4 fail on local Node 20. The 4 failures need Node 22.23 (CI pin) for native TypeScript stripping (`stripTypeScriptTypes`, `.ts` import); they are an environment mismatch, not confirmed product bugs. DB-backed tests and `deno check` were not run locally (no Postgres/Deno).

## Findings
| # | Area | Finding | Severity |
|---|------|---------|----------|
| 1 | AI | Each Edge Function implements its own provider calls, retry and JSON parsing; classifier uses only Groq+NVIDIA+BazaarLink (documented). No shared backoff, Retry-After handling, circuit breaker or cost/usage ledger. Observed production quota/429/401 failures cascade. | High |
| 2 | AI | `ai-provider-healthcheck` cron path returns 401 (documented, unresolved). | Medium |
| 3 | AI | Reader-impact fields empty for published articles because providers are rate limited. | Medium |
| 4 | Ops | 206 of 476 sources need attention (47 errors, 158 stale); admin alerting not configured. | High |
| 5 | Ops | Real production restore never drilled (only synthetic). | Medium |
| 6 | Frontend | Very large monolithic scripts (`history-*.js`, `script.js`, `admin.js`), 100+ `innerHTML` uses across pages; each needs escaping review. | Medium |
| 7 | SEO | Many static pages (about, contact, privacy, map, markets…) lack JSON-LD; article pages are Worker-rendered with NewsArticle. | Low |
| 8 | Content | Only 15,599 of 35,533 published articles have original images (documented); no fabricated images. | Info |
| 9 | Email | Newsletter sending disabled (`email_ready=false`) until a verified sender exists. | Info |
| 10 | Tests | Browser/DB tests exist but local developer ergonomics are poor (Node pin, Deno, Postgres required). | Low |

## Not verifiable here
Live site behaviour, Supabase RLS in production, Stripe webhook behaviour, Lighthouse/accessibility scores, mobile rendering. These need staging access and are listed in the backlog rather than claimed.
