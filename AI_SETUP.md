# WRLDLINE AI classification and risk map

## Automatic background classification

The production scheduler is the deployed Cloudflare Worker `wrldline-jobs`. Its `* * * * *` Cron Trigger enqueues one classification message; the `wrldline-news-classification` Queue has one serialized consumer that calls Supabase `classify-news-worker`. The duplicate Supabase classifier Cron was explicitly removed after the Cloudflare route and consumer were verified. `ai-backlog.yml` is a manual classification fallback. `bot.yml` is a status diagnostic only: legacy RSS collection stays disabled. Classification is strictly limited to stories published within the previous 60 minutes (with a five-minute future-clock tolerance); older stories are marked `expired` and must never be sent to an LLM.

### Required secrets — never commit or paste keys into chat

**Supabase Dashboard → Project Settings → Edge Functions → Secrets**
- `NVIDIA_API_KEY` — NVIDIA API Catalog key.
- `GONKA_BROKER_API_KEY` — Gonka Broker key (starts with `gnk-prx-`), read only by server-side classification, translation, and provider-healthcheck functions. Optional `GONKA_MODEL` pins an exact model ID returned by Gonka `/v1/models`; otherwise the function selects the first currently available model.
- `GEMINI_API_KEY` — preferred Gemini credential. Runtime functions select it first. `GOOGLE_API_KEY` is retained only as a legacy fallback when `GEMINI_API_KEY` is absent.
- Optional fallback providers: `GROQ_API_KEY`, `NVIDIA_API_KEY`, `GONKA_BROKER_API_KEY`, and/or `OPENROUTER_API_KEY`.
- Optional `OPENROUTER_MODEL` pins the OpenRouter model used by the daily briefing and translation fallback; otherwise the safe default is `openrouter/free`.
- The integration uses the tested model `nvidia/nemotron-3.5-lightning-30b-a3b`.

**GitHub repository → Settings → Secrets and variables → Actions**
- Store only the server-side credentials required by the relevant workflows, such as `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL`. GitHub Actions secrets do not automatically become Supabase Edge Function secrets.
- Never commit provider keys or put service-role keys in browser JavaScript.

The Edge Function reads provider keys from the Supabase Edge Function environment. They are never returned to the browser. The classifier supports editor/admin sessions and its trusted server-side worker.

## Operation

Cloudflare `wrldline-jobs` triggers the classification queue every minute. The database queue claims at most ten published, non-Telegram articles from the last 60 minutes; the Edge Function independently enforces the same 60-minute ceiling, so no request flag or manual caller can widen the window. Items older than one hour are marked `expired`. The Cloudflare consumer authenticates to the Edge Function with the publishable key plus the Vault-backed cron secret; no service-role key is stored in Cloudflare.

**Actual classifier routing in the deployed code:** Groq and NVIDIA are called in parallel for separate responsibilities (editorial topic/reader-impact analysis and risk/geography/exclusivity analysis). If one or both primary results are missing, BazaarLink is the configured fallback for the missing task(s). The classifier does not currently route requests through Gemini, Gonka, or OpenRouter, even if those credentials are present. Do not describe those three providers as active classifier fallbacks unless the code is changed, deployed, and tested. Gemini/Groq/NVIDIA/Gonka/OpenRouter/BazaarLink are used by other AI paths, including the translation draft generator; the daily global briefing has its own provider path and must be validated separately.

Gonka uses `https://proxy.gonkabroker.com/v1` for model discovery and JSON-only generation where enabled by the calling path. NVIDIA uses the OpenAI-compatible `/v1/chat/completions` endpoint. The protected `ai-provider-healthcheck` tests configured providers with small real inference requests; an `ok` result means at least one configured provider passed, while `all_configured_passed` is the stricter field. Never treat a provider as healthy based only on a stored key or a successful HTTP preflight.

**Translation draft path:** Cloudflare triggers the existing `translation` mode every five minutes. It scans only stories published in the previous 60 minutes; `translate-articles` independently enforces the same ceiling. DeepL is attempted first, then configured AI providers are used in round-robin fallback. Generated machine translations are stored with `translation_status='review'` and `translation_source='machine_draft'`; they are not automatically published. A human editor must review and publish them. This is different from auto-publishing translated news.

**Observed production provider issues at the 15 November 2026 review:** Groq returned a daily token quota 429; NVIDIA returned a response without valid JSON content; BazaarLink returned a 429 concurrency/rate-limit response; Gonka returned 401; OpenRouter's free-model daily quota was exhausted; Gemini entered quota cooldown; and Firecrawl returned 402 (zero credits) and 429 (per-minute rate limit). DeepL's quota was exhausted. These are observed errors, not proof that every credential is invalid. The classifier continued to defer work rather than publish incomplete AI output. Re-run health tests after provider quotas recover or credentials/plans are corrected. The current health-check endpoint's cron-style request still returned 401 in the deployment test; fix its authorization path without weakening the internal role/secret checks.

Firecrawl is not an LLM: it is an optional server-side article-text extractor and cache. When it is unavailable or out of credits, classification can use the summary already stored with the article. `NEWSDATA_API_KEY` is a news-data ingestion key rather than an AI key.

## Risk map

The map at `/map.html` uses published, AI-classified, non-Telegram stories with confidence >= 0.68 from the last seven days. Country shading reflects the highest event-level risk signal in recent coverage; it is not a country-wide safety rating or official travel advisory.

Each story uses the configured classifier route described above; failed or incomplete provider output is deferred and retried only while the story remains inside the one-hour window. Monitor each provider's quota and usage limits. Cloudflare Queues provide the scheduled classifier triggers and serialized consumers; the legacy GitHub RSS workflow does not ingest or schedule news.

## Arabic/English translation and editorial control

Automatic publication of AI translations is disabled, but the draft-generation pipeline is active through Cloudflare every five minutes. It handles only the previous 60 minutes of published news, stores generated translations as `review` / `machine_draft`, and waits for an editor to approve them. The public frontend displays only translations whose `translation_status='published'`; otherwise it shows the original source-language story with a clear label. Do not enable an automatic publish shortcut. AI provider keys are used by the draft-generation path as well as the explicitly enabled briefing/classification paths described above.

## Evidence-based story reliability

The public story panel derives reliability from editor-recorded evidence in `article_evidence`. Supported evidence types include independent reporting, official statements, field reports, primary documents, contradictions, corrections, and retractions. A database trigger recalculates the public status and counters after every evidence change; the main site subscribes to article updates through Supabase Realtime.

Statuses:
- Unverified: no corroborating evidence is recorded.
- Single source: one independent publisher is recorded.
- Multiple independent sources: at least two distinct publishers.
- Corroborated: at least three distinct independent publishers.
- Official + independent confirmation: an official statement plus at least two independent publishers.
- Field + independent confirmation: field reporting plus at least two independent publishers.
- Disputed: contradictory evidence has been recorded.
- Corrected / Retracted: an editorial correction or retraction has been recorded.

A source is not counted as independent merely because it republishes another outlet's report. Editors must record the publisher, URL, evidence type, and whether the source is independent. The site starts new stories as unverified rather than assuming confirmation.
