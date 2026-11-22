# Editorial metadata integrity

NewsData's publisher country belongs in `source_country`. The public location is `event_country`; the legacy `country` column mirrors it for compatible clients. Editorial section (`category`), format (`content_type`), event type (`ai_event_type`), and geographic scope (`geographic_scope`) are independent. An unattributed location stays null, and generic or conflicting provider tags stay `uncategorized` rather than becoming `world`.

## Production components

- `newsdata-integration`: accepts a unique recognizable provider record once per URL, never overwrites existing editorial metadata on duplicates, routes headlines with explicit promo codes to editorial review, and does not infer urgency from a headline prefix.
- `classify-news`: keeps the 60-minute eligibility window and existing provider/auth setup. The topic needs independent confidence; `world` also requires international or cross-border scope. The event country requires a valid ISO code and a matching source quotation naming the country. The conservative matcher can abstain even when the event location is inferable; it does not manufacture coordinates. Manual metadata wins over in-flight classification.
- `20261122082259_editorial_metadata_integrity.sql`: only applies to identifiable legacy NewsData rows lacking editor, RSS, or model provenance. This migration does not delete, unpublish, requeue, or change the timestamp of an article. The existing editor client can continue writing `country`; the trigger synchronizes that to explicit event metadata and invalidates stale model location fields.
- GitHub Pages and the public summary Worker are separate release surfaces. Merge the reader pull requests through required review. Use the existing Worker release process for its source changes; the live database correction does not itself redeploy that Worker.

## Verification and recovery

Run `tests/editorial-trust-db.sh` with an isolated PostgreSQL installation, `deno check` for both Edge entrypoints, and the existing Node and browser regression suites. In production, check the audit count and latest ingest results, the public homepage RPC, and at least one corrected public article. `private.newsdata_metadata_corrections_20261122` holds the before and after metadata for each historical correction; compare the current values to the recorded after-state before restoring any field so later editorial changes are never clobbered. A selective recovery should be a reviewed forward migration, not a broad restore or a reset of classification states.

The previous active versions were `newsdata-integration` v14 and `classify-news` v104. Roll back a malfunctioning function by redeploying its previous reviewed code and unchanged auth configuration independently of the data corrections. The existing NewsData cron and Cloudflare classification schedule should not be duplicated.

## Freshness and remaining review

NewsData supplied articles roughly 12 hours after source publication in the audited window. The provider documents a 12-hour delay on its [free News API](https://newsdata.io/free-news-api); the account tier was not independently verified. Keep publisher timestamps and the one-hour eligibility window unchanged. Historical articles outside the narrow audit cohort still need editorial review or a separate provenance-specific plan; absence of proven data is not a reason to guess a country or section.
