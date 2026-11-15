# Human-review pipeline integration

These focused function changes address integration-review issues 2 and 3. They require the columns and invalidation triggers in `supabase/migrations/20261115030000_editorial_trust.sql`. Apply/check that migration before deploying the updated daily briefing function; a missing trust projection fails closed rather than falling back to legacy confirmation.

## Translation generation is not publication

`wrldline-news-ingest` and `translate-articles` use the same pure `translationGenerationState` decision:

| Existing target translation | Generation action / result |
| --- | --- |
| Rejected, including incomplete text | Skip; return `rejected`. No automatic regeneration or promotion. |
| Published, including legacy rows without human-review stamps | Preserve; return `already_translated`. No automatic replacement or demotion. |
| Complete nonpublished title and summary | Skip; return `awaiting_human_review`, `generated: false`. |
| Missing row or incomplete nonpublished title/summary | Eligible for machine generation within the existing window/backoff/slot limits. |

Completeness is trimmed title plus summary. Optional `ai_summary` is not a reason to repeatedly replace a complete review draft or a legacy publication. Ingest continues scanning past complete drafts and rejected rows, so they no longer occupy the ten-per-target generation slots.

New machine text remains `translation_status: review`, `translation_source: machine_draft`, with null reviewer stamps and publication date. Its response is `awaiting_human_review`, `generated: true`, never `already_translated`. The run summary exposes `generated`, `awaiting_human_review`, `rejected_ignored`, and `translation_changed`. The existing `translated` summary counter remains a backwards-compatible alias for successful machine generation; it is **not** a publication count. Existing complete drafts are not counted as new generation.

A conditional update matches the previously observed row status and excludes published/rejected rows; a new-row insert ignores conflicting rows rather than overwriting them. A publication/rejection made while a provider request is in flight is preserved. A losing write returns `translation_changed` and does not clear retry metadata. Human approval/rejection remains in the migration's editorial RPCs; this worker does not call them.

## Current human trust in the daily briefing

The service query explicitly selects `lang`, `source_language`, `language_detection`, `editorial_trust_status`, `trust_needs_review`, trust reviewer/time, and applicable article-text translation reviewer/time. It does not select review notes. Briefing source confirmation requires:

1. `editorial_trust_status = confirmed` and `trust_needs_review = false`.
2. A nonempty DB-stamped human trust reviewer and a valid, nonfuture trust timestamp.
3. Recorded, known Arabic/English article and source languages, without unknown/conflicting detection.
4. Either a known-language original (`lang` and `source_language` match, allowing locale variants), or `human_translation_status = reviewed` with reviewer/time, no future timestamp, and translation review no later than the current trust assessment.

A missing source language is **not** inferred from article language. Original-language text does not require translation review merely because the default translation status is `pending`; translated text does. Confirmation depends on the migration's invalidation flags/stamps, not an arbitrary timestamp age. Changing material text/evidence must invalidate current review through the migration's guards.

The briefing consumes the article's title and summary, not its machine `ai_summary` or an unreviewed parallel translation. Therefore the applicable translation guard covers the article text actually supplied to the model. It does not imply that the generated Arabic briefing itself has been human reviewed.

Every cited source for a merged story must have current qualifying human review before its returned confidence can be `confirmed`. Mixed reviewed/unreviewed citations remain `reported`; structured disputed material is `unverified`. Model-provided `unverified`/`developing` can conservatively lower the result. A model-provided `confirmed` cannot bypass the human gate. `confidence_basis: cited_source_human_review_only` makes the scope explicit.

After generation, the function re-reads only the bounded selected sources using the same explicit projection and publication/day boundary. Review-query failure preserves the previous saved briefing. Withdrawn/deleted/out-of-window sources are no longer citeable; a merged story containing an unresolved reference cannot be confirmed. Changed input text/language/source metadata cannot use a later approval of different text to certify the old model input: its **local** assessment needs review, without changing any database row. This is a generation-time freshness checkpoint, not a transactional lock or automatic refresh of already-saved briefings.

Legacy `verification` labels such as `multi`, publisher reputation, and source counts cannot certify a story or override current structured review. Counts are preserved solely as attributed context and explicitly labeled `evidence_counts_context_only`. Sampling can still consider publisher quality, but no longer awards count-based verification bonuses.

The prompt uses the same derived review hints and rules, including attribution for mixed-source stories and executive/section/trend narratives. Whole-briefing notices distinguish all-unreviewed, mixed, and all-reviewed citations. Every notice says the briefing and its Arabic rendering are machine-generated, not independent verification or human translation approval. Generated prose is not deterministically fact-checked or human approved by these changes.

## Privacy and source references

Reviewer identities are accessed only by the service-side gate. Explicit projections prevent reviewer IDs, private notes, and raw service rows from being passed to the model or serialized as briefing sources. The model receives temporary `source_1`-style references instead of database article UUIDs. References resolve only against the selected input stories. Published briefing source objects retain the already-public **article** ID for existing canonical links, along with safe attribution, derived review state, and context counts; reviewer/evidence/claim IDs and review notes are absent.

Source and trend attachment both build a safe whitelist rather than spreading service rows. An opaque reference is neither an editor identity nor a persistent database ID.

## Network-free checks performed

Run with native Node **22.13+**:

```sh
node --check tests/editorial-pipeline.test.js
node --test tests/editorial-pipeline.test.js
```

The isolated suite strips TypeScript syntax in memory with native `node:module`, syntax-compiles all three entrypoints without evaluating them, and extracts the actual production helpers/scan for execution in an isolated VM. It does not import Deno or the Supabase SDK and does not resolve packages. The scan and conditional-write tests use in-memory fixture callbacks only; no actual HTTP, database, AI, or provider call is made.

Coverage includes the exact old unconfirmed-plus-two-sources counterexample, legacy label bypasses, valid human review, stale/missing/future review and translation stamps, pending translations, unknown original languages, mixed/disputed citations, skipped complete review/rejected queue entries, concurrent rejection/publication preservation, optional AI-context completeness, legacy publication preservation, privacy projections, prompt references, and uncertainty notices.

The ingest cron-secret RPC verification and the daily briefing's secret/hash comparison remain intact. No scheduler, lock/window/backoff limits, migration, deployment, production row, or existing saved briefing was changed. No network/MCP/provider/AI calls or Git operations were performed. Validation here is native syntax compilation plus fixture tests, **not** a live Deno/SDK typecheck, database trigger integration test, or deployment verification.
