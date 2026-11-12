# WRLDLINE AI classification and risk map setup

The `classify-news` Supabase Edge Function is deployed with JWT verification enabled. It only accepts authenticated users whose trusted Supabase `app_metadata.role` is `editor` or `admin`.

## Enable AI classification

1. Open Supabase Dashboard → Project Settings → Edge Functions → Secrets.
2. Add a secret named `OPENAI_API_KEY` with an API key from your OpenAI Platform project.
3. Do not commit the key, place it in browser JavaScript, or send it in chat.
4. Open `/admin.html`, sign in as an editor/admin, then use **تحليل 10 أخبار بالذكاء الاصطناعي**. Each run classifies up to ten published, non-Telegram articles.

The classifier uses the OpenAI Responses API with structured JSON output. It classifies category, country, ISO alpha-3 country code, event type, summary, confidence, and event-level risk. Precise coordinates are returned only when the location is explicitly identified. Low-confidence results are marked for editorial review.

## Telegram source handling

Published rows whose source URL, article URL, or source name identifies Telegram are copied to `telegram_breaking_items`. The public article policies exclude those rows from ordinary article feeds; the dedicated ticker table is the only public reader path. A database trigger keeps the ticker synchronized when Telegram article metadata changes.

## Risk map

The map at `/map.html` uses only published, AI-classified, non-Telegram stories with confidence >= 0.68 from the last seven days. Country shading reflects the highest event-level risk signal in recent coverage; it is not a country-wide safety rating or official travel advisory. Event coordinates are shown only when the classifier identifies a precise place.

## Cost and operations

The admin action processes up to ten articles per request. Each article is a separate model request and incurs API usage. Monitor usage and set budget limits in the OpenAI Platform. Re-run only pending, failed, or review-needed stories as editorially appropriate.
