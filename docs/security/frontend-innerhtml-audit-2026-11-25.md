# Frontend HTML-sink audit (2026-11-25)

Scope: all first-party browser JS (about 139 sink statements across 26 files: innerHTML, outerHTML, insertAdjacentHTML).

Method: manual review of every file that renders API or user-derived data (script.js, home.js, shorts.js, daily-briefing.js, briefing-model.js, intelligence-sources.js, history-europeana.js, dossier.js, review.js, newsroom-page.js) plus a repeatable scanner (`node scripts/scan-html-sinks.mjs .`).

Findings:
- No verified exploitable sink. API-derived text (titles, summaries, source names) is passed through per-file escape helpers; URLs pass through scheme-checked helpers (safeURL, M.link, safeUrl); article ids used in links are UUID-validated (shorts.js, briefing-model.js).
- Hardening applied in home.js for first-party static data that was concatenated raw: context id and promise id now URL-encoded, promise status escaped, progress clamped to a number 0-100.
- The scanner still reports about 60 statements; nearly all are translated UI strings, fixed markup helpers or pre-built fragments. It is a triage aid and is not wired into CI as a blocking check.

Not done: a Content-Security-Policy review of production response headers (requires deployed headers); sanitising markdown/HTML article bodies, if any, server-side.
