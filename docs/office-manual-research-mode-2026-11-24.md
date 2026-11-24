# Worldline News Office — manual research mode

Date: 2026-11-24

## Scope

This change is limited to the Worldline News Office Worker and its employee/task records. It does not re-enable or modify the general news-ingestion pipeline, external RSS/news collectors, classification, translation, or public news queues.

## Production changes applied

- Removed every Cron trigger from `worldline-news-office`.
- Replaced the Worker scheduled handler with a no-op. Scheduled invocations cannot gather sources or advance tasks.
- Changed `GET /api/office/sources/status` to a read-only status response. It no longer calls source gathering.
- Removed source gathering from morning reports. Reports no longer collect headlines.
- Preserved the sole source-gathering call inside Khalid's research execution path. It is reachable only through a manually assigned office task advanced by an explicit office action.
- Changed manual assignments addressed to Khalid to create a research-only task, rather than classifying them as a breaking-news workflow.
- Changed Khalid's role to Researcher & Source Analyst and removed RSS/news API tools from his static role metadata.
- Corrected Sara's static role label to Arabic Copy Editor.
- Changed AI prompt resolution to read `system_prompt` from `wrldline_office_employees` at runtime.
- Changed office persistence to write the database-backed prompts back unchanged, rather than overwriting them with stale bundled prompt text.
- Updated Khalid's database role and system prompt to prohibit background or scheduled collection and to require evidence before a task can be marked complete.
- Corrected a historical Khalid research task that had been marked Done despite zero sources. It is now Blocked, with an audit log entry; no retry was triggered.
- Added a distinct `research` intent: manually addressing Khalid creates only a Khalid research task, not a breaking-news workflow or a morning briefing.
- Added evidence gates so a research task is Blocked when it has no usable briefs, no sources, or fewer than two independent source groups. Fact-checking cannot mark a zero-evidence research dependency Done.

## Verification

- Cloudflare Worker content upload succeeded.
- All existing Worker bindings remained present after upload, including secrets, assets, and rate-limit binding.
- Worker Cron schedule list is empty.
- Static inspection of the deployed Worker confirms exactly one `await gather(...)` call remains, inside `research(...)`.
- The sources status endpoint no longer calls `gather`.
- The scheduled handler is a no-op.
- Explicitly addressing Khalid routes to a research-only task.
- Research completion requires usable briefs and at least two independent source groups; a fact-check task cannot complete a dependency without that evidence.
- Supabase shows all eight employees present; Khalid's role/prompt are updated and Sara's role remains Arabic Copy Editor.
- The previously false-completed Khalid task is Blocked and has zero sources.

## Important operational behavior

Khalid searches only when the CEO explicitly assigns a research task and the task is advanced through the office's explicit action. There is no office Cron that performs research or advances tasks automatically.

## Remaining work

- Reconstruct and check in maintainable Worker source modules. The repository did not expose the original TypeScript source during this audit; the retained file is a compiled production bundle.
- Run authenticated end-to-end task tests for all eight roles, including Gemini/Groq provider behavior and approval enforcement.
- Complete a staging service integration for Noura before treating staging/release tasks as functional.

This Worker backup is the deployed bundled entrypoint captured immediately before the change. It is retained for rollback/audit; it is not a substitute for reconstructing and maintaining the original TypeScript source modules.
