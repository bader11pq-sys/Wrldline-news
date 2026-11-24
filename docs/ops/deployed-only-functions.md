# Edge functions that exist in production but not (fully) in the repository

Audit date: 2026-11-24. Source: Supabase project `vmaxbnogmmfyrcucapnq`, function list vs `supabase/functions/`.

| Function | In repo | Notes |
|---|---|---|
| `ops-dashboard` | Captured in this change (v8, `verify_jwt=true`, admin/editor role check inside) | Behaviour unchanged. Only type annotation for `pipelineStats` and an unused variable were touched so that `deno check` passes. Not redeployed. Reads `feeds` and `news_ingestion_runs`, which are stale because ingestion is retired; its panels will show zero activity until a new ingestion path exists. |
| `elevenlabs-tts` | No | Deployed only. Needs source capture and a cost/abuse review (public TTS endpoint). |
| `market-data` | No | Deployed only. Market panels must show provider and update time. |
| `europeana-history` | No | Deployed only. History encyclopedia dependency. |
| `wrldline-cover-import-20261123` | No | One-off import function by name; should be reviewed and removed once confirmed unused (do not delete without owner approval). |

A rewrite of `ops-dashboard` exists in the old PR #48 (closed as stale: 170 commits behind main, 51 files).
If its metrics contract is wanted, re-propose it as a small PR that is deployed and verified separately.
