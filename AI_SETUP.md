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

The `translate-articles` Edge Function uses the Responses API with strict structured output to translate story headlines, summaries, and AI context summaries. `translate-pending.js` checks published stories every ten minutes and runs after each regional/world ingestion workflow. It fills the opposite language in `article_translations`; Telegram ticker-only items also receive a separate public-safe ticker translation row. Source URLs and publisher names remain original.

Required secrets:
- Supabase Edge Function secret: `OPENAI_API_KEY`.
- GitHub Actions secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
The service key is used only by GitHub Actions and server-side Edge Functions. It must never be added to browser JavaScript.

The site language selector persists the reader's Arabic/English choice across pages. If a translation has not completed yet, the interface explicitly labels the original-language fallback.

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
