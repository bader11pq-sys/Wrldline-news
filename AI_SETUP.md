# WRLDLINE AI classification and risk map

## Automatic background classification

The repository includes a background worker (`classify-pending.js`) and GitHub Actions workflow. It checks newly published non-Telegram articles every 10 minutes and also runs after the regional/world ingestion workflows. It only sends rows whose AI status is empty or pending; low-confidence stories remain in editorial review and are not repeatedly billed.

### Required secrets — never commit or paste keys into chat

1. In Supabase Dashboard → Project Settings → Edge Functions → Secrets, add `OPENAI_API_KEY`.
2. In GitHub repository Settings → Secrets and variables → Actions, add `SUPABASE_SERVICE_ROLE_KEY` using the project's service-role/secret key. This is used only by the server-side GitHub Actions worker and is never placed in browser code.
3. Keep the existing `SUPABASE_URL` and `SUPABASE_KEY` secrets for the news ingestion bots. Never place a service key in frontend JavaScript.

The Edge Function accepts either a real authenticated editor/admin session or an exact server-side service-role token. The key is checked server-side and never returned to the browser.

## Operation

Each background run processes up to 30 pending stories in batches of ten. Telegram items are excluded from ordinary classification and remain ticker-only. The admin page retains a retry action for pending work; normal operation does not require pressing it.

## Risk map

The map at `/map.html` uses published, AI-classified, non-Telegram stories with confidence >= 0.68 from the last seven days. Country shading reflects the highest event-level risk signal in recent coverage; it is not a country-wide safety rating or official travel advisory.

Each story uses one model request. Monitor OpenAI usage and set a budget limit. GitHub scheduled workflows can start late during platform load; ingestion workflows also trigger classification directly after fetching.

## Automatic Arabic/English translation

- Supabase Cron invokes the `wrldline-news-ingest` Edge Function in `translation` mode every minute. Translation no longer waits for the GitHub Actions ingestion workflow to finish.
- The worker scans published stories newest-first in pages of 500, continuing through the backlog as needed. Each run selects up to 20 untranslated stories, balanced to a maximum of ten per direction.
- The `translate-articles` Edge Function processes up to two stories concurrently within a run, while a database lease prevents overlapping cron workers. A failure is isolated to its story; provider backoff pauses the remaining batch so those stories can be retried on the next scheduled run.
- Gemini quota cooldown is persisted in `gemini_rate_limits` and respected on subsequent runs. Groq and OpenRouter remain fallback providers when configured.
- Each completed translation is upserted independently into `article_translations`. The table is published to Supabase Realtime, and the frontend refreshes when a translation is inserted or updated.
- The public cron endpoint validates its header against the existing secret stored in Supabase Vault; the service-role key remains server-side.

Required configuration:
- Supabase Vault: existing project URL, publishable key, and `wrldline_news_cron_secret_20261113` entries.
- Supabase Edge Function secrets: at least one of `GEMINI_API_KEY` or `GROQ_API_KEY`. To enable OpenRouter as an additional fallback, set both `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` to a paid model your account can use; `openrouter/free` and `:free` models are skipped for this high-volume queue.
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
