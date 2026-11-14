# WRLDLINE AI classification and risk map

## Automatic background classification

The repository includes a background worker (`classify-pending.js`) and GitHub Actions workflow. It checks newly published non-Telegram articles every 10 minutes and also runs after the regional/world ingestion workflows. It only sends rows whose AI status is empty or pending; low-confidence stories remain in editorial review and are not repeatedly billed.

### Required secrets — never commit or paste keys into chat

**Supabase Dashboard → Project Settings → Edge Functions → Secrets**
- `NVIDIA_API_KEY` — NVIDIA API Catalog key.
- `GONKA_BROKER_API_KEY` — Gonka Broker key (starts with `gnk-prx-`), read only by server-side classification, translation, and provider-healthcheck functions. Optional `GONKA_MODEL` pins an exact model ID returned by Gonka `/v1/models`; otherwise the function selects the first currently available model.
- `GEMINI_API_KEY` — preferred Gemini credential. Runtime functions select it first. `GOOGLE_API_KEY` is retained only as a legacy fallback when `GEMINI_API_KEY` is absent.
- Optional fallback providers: `GROQ_API_KEY`, `NVIDIA_API_KEY`, `GONKA_BROKER_API_KEY`, and/or `OPENROUTER_API_KEY`.
- The integration uses the tested model `nvidia/nemotron-3.5-lightning-30b-a3b`.

**GitHub repository → Settings → Secrets and variables → Actions**
- Store only the server-side credentials required by the relevant workflows, such as `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL`. GitHub Actions secrets do not automatically become Supabase Edge Function secrets.
- Never commit provider keys or put service-role keys in browser JavaScript.

The Edge Function reads provider keys from the Supabase Edge Function environment. They are never returned to the browser. The classifier supports editor/admin sessions and its trusted server-side worker.

## Operation

Supabase Cron invokes the classification worker. It selects only published, non-Telegram articles from the last hour and sends up to ten IDs per run. The worker authenticates server-to-server and calls `classify-news`.

Provider fallback order: Gemini → Groq → NVIDIA → Gonka → OpenRouter. Gonka uses `https://proxy.gonkabroker.com/v1`, discovers available models through `/models`, and sends JSON-only prompts because Gonka Broker does not currently support JSON mode / structured outputs. Healthcheck attempts `/test-auth` when the broker exposes it, discovers models, and verifies the credential with a real small classification+translation generation (the live `/chat/completions` response is the definitive auth check). NVIDIA requests use the OpenAI-compatible `/v1/chat/completions` endpoint with JSON output and disabled reasoning mode for predictable structured classification. The provider-healthcheck tests classification/translation-shaped JSON and reports the overall service healthy when at least one configured provider passes.

## Risk map

The map at `/map.html` uses published, AI-classified, non-Telegram stories with confidence >= 0.68 from the last seven days. Country shading reflects the highest event-level risk signal in recent coverage; it is not a country-wide safety rating or official travel advisory.

Each story uses one successful model request; failed providers fall through to the next configured provider. Monitor each provider's quota and usage limits. GitHub scheduled workflows can start late during platform load; ingestion workflows also trigger classification directly after fetching.

## Archived: automatic Arabic/English translation

Automatic AI translation was retired on 14 November 2026 because provider quotas made live bilingual delivery unreliable. The Supabase cron job `wrldline-translation-worker` is disabled. The frontend now uses reviewed rows in `article_translations` when available and otherwise displays the original source-language story with a clear label. AI provider keys remain relevant only to editorial classification and other explicitly enabled workflows; they are not required for language switching.

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
