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
