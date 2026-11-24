# Analysis Desk release and verification

## Daily briefing

- `/daily-briefing.html` now uses the same Supabase Auth project as the account page. An authenticated read requests explicit fields from `daily_news_briefings`; an anonymous visitor never queries the table. The date allowlist only accepts completed UTC days. Account navigation is an explicit, same-origin return link, not an open redirect.
- The anonymous selection comes from a bounded query to `public_home_news_recent_v3` and is not the full briefing. It labels items that still lack independent verification and omits disputed, conflicting, retracted and sponsored items. The page distinguishes an older full edition from the latest completed day and does not cache account content. The countdown marks the next UTC cycle, not a delivery guarantee.
- This release does not change RLS, cron, or Edge Functions. After deployment, verify one guest view and one signed-in view with an existing authorized account. If no dated full edition is available, check scheduler/function run history in Supabase without copying credentials into logs. An empty authenticated result is distinct from broken authentication.

## Markets, World Monitor and newsletter

- Markets label browser response time separately from observation time; the FX feed uses the provider's explicit UTC `asOf`, not the gateway timestamp. The observation-age thresholds are editorial reference windows, not an exchange calendar. Quotes are not investment advice. External TradingView charts load on demand.
- The comparison uses `byCountry` from the same classified feed snapshot and ignores just the main country selector. Counts indicate matching news entries, not safety. Different publisher names do not imply independent reporting.
- Web editions and preference preview do not send email. Real delivery remains gated by `notification-client.js` and the existing confirmation and unsubscribe workflow. Operators should use the existing notification runbook and verify the email channel, a verified Resend sender (`NEWSLETTER_FROM`), and server-side `RESEND_API_KEY`; never add those secrets to frontend assets.

## Release steps

1. Run `node scripts/build-dossiers.mjs` whenever dossier JSON or generated templates change. Do not hand-edit generated dossiers or the front-page markers.
2. Run `NODE_PATH="$PWD/tests/reliability-tooling/node_modules" node --test tests/*.test.js tests/*.test.mjs tests/*.test.cjs` after installing the locked test tooling as in `.github/workflows/code-quality.yml`.
3. A static preview does not own the production Worker’s `/news/` routes or production account sessions. On the production domain, smoke test these integrations separately after any approved GitHub Pages merge. Roll back the frontend via a revert of the release merge if needed; no database rollback is required.
