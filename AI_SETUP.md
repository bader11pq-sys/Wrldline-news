# WRLDLINE AI classification and risk map

## Automatic background classification

The repository includes a background worker (`classify-pending.js`) and GitHub Actions workflow. It checks newly published non-Telegram articles every 10 minutes and also runs after the regional/world ingestion workflows. It only sends rows whose AI status is empty or pending; low-confidence stories remain in editorial review and are not repeatedly billed.

### Required secrets — never commit or paste keys into chat

**Supabase Dashboard → Project Settings → Edge Functions → Secrets**
- `NVIDIA_API_KEY` — NVIDIA API Catalog key. This is read only by the server-side classification and provider-healthcheck functions.
- At least one fallback provider key: `GOOGLE_API_KEY` or `GEMINI_API_KEY`, `GROQ_API_KEY`, and/or `OPENROUTER_API_KEY`.
- The integration uses the tested model `nvidia/nemotron-3.5-lightning-30b-a3b`.

**GitHub repository → Settings → Secrets and variables → Actions**
- Store only the server-side credentials required by the relevant workflows, such as `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL`. GitHub Actions secrets do not automatically become Supabase Edge Function secrets.
- Never commit provider keys or put service-role keys in browser JavaScript.

The Edge Function reads provider keys from the Supabase Edge Function environment. They are never returned to the browser. The classifier supports editor/admin sessions and its trusted server-side worker.

## Operation

Supabase Cron invokes the classification worker. It selects only published, non-Telegram articles from the last hour and sends up to ten IDs per run. The worker authenticates server-to-server and calls `classify-news`.

Provider fallback order: Gemini → Groq → NVIDIA → OpenRouter. NVIDIA requests use the OpenAI-compatible `/v1/chat/completions` endpoint with JSON output and disabled reasoning mode for predictable structured classification. The provider-healthcheck tests classification/translation-shaped JSON and reports the overall service healthy when at least one configured provider passes.

## Risk map

The map at `/map.html` uses published, AI-classified, non-Telegram stories with confidence >= 0.68 from the last seven days. Country shading reflects the highest event-level risk signal in recent coverage; it is not a country-wide safety rating or official travel advisory.

Each story uses one successful model request; failed providers fall through to the next configured provider. Monitor each provider's quota and usage limits. GitHub scheduled workflows can start late during platform load; ingestion workflows also trigger classification directly after fetching.

## Automatic Arabic/English translation

- Supabase Cron invokes the `wrldline-news-ingest` Edge Function in `translation` mode every minute. Translation no longer waits for the GitHub Actions ingestion workflow to finish.
- The worker scans published stories newest-first in pages of 500, continuing through the backlog as needed. Each run selects up to 20 untranslated stories, balanced to a maximum of ten per direction.
- The `translate-articles` Edge Function processes up to two stories concurrently within a run, while a database lease prevents overlapping cron workers. A failure is isolated to its story; provider backoff pauses the remaining batch so those stories can be retried on the next scheduled run.
- Gemini quota cooldown is persisted in `gemini_rate_limits` and respected on subsequent runs. Groq, NVIDIA Nemotron 3.5, and OpenRouter remain fallback providers when configured.
- Each completed translation is upserted independently into `article_translations`. The table is published to Supabase Realtime, and the frontend refreshes when a translation is inserted or updated.
- The public cron endpoint validates its header against the existing secret stored in Supabase Vault; the service-role key remains server-side.

Required configuration:
- Supabase Vault: existing project URL, publishable key, and `wrldline_news_cron_secret_20261113` entries.
- Supabase Edge Function secrets: at least one of `GEMINI_API_KEY`, `GROQ_API_KEY`, or `NVIDIA_API_KEY`. To enable OpenRouter as an additional fallback, set both `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` to a paid model your account can use; `openrouter/free` and `:free` models are skipped for this high-volume queue.
- Keep `SUPABASE_SERVICE_ROLE_KEY` only in the Edge Function environment. Never place it in browser code or GitHub-tracked files.
- The GitHub Actions news-ingestion workflow is no longer the translation scheduler; Supabase Cron owns the one-minute translation cadence.

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
