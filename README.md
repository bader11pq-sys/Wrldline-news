# Worldline News AI Office

An Arabic editorial workflow with an English operations interface, eight specialized agents, a CEO-only publication gate, and two interchangeable office views. The private office and public Arabic news reader serve different data. Demo decisions never appear on the public reader.

## Project layout

```text
worldline-news/
├── src/
│   ├── main.tsx             # Office, dashboards, chat, decisions, and public reader
│   ├── Floor.tsx            # Interactive 2D newsroom floor plan
│   ├── Office3D.tsx         # Lazy-loaded React Three Fiber scene
│   └── style.css            # Responsive visual system and Arabic typography
├── shared/
│   ├── schema.ts            # Shared task, article, conversation, and workflow types
│   ├── agents.ts            # Eight prompts, roles, capabilities, KPIs, and model settings
│   └── sources.ts           # Trusted feeds and independence groups
├── worker/
│   ├── index.ts             # Hono API and scheduled Workers handler
│   ├── engine.ts            # Planner, workers, dependencies, revisions, and decisions
│   ├── factcheck.ts         # Independent evidence enforcement
│   ├── integrations.ts      # RSS, search, AI, images, and release transport
│   ├── store.ts             # Supabase Data API, lease, and demo store
│   ├── demo.ts              # Explicitly fictional regression fixtures
│   └── node.ts              # Local demo and hosted preview server
├── supabase/migrations/      # PostgreSQL schema, RLS, storage, and RPCs
├── release-service/         # Optional static-site Cloudflare Pages release adapter
├── tests/                  # Workflow, permission, fixture-provider, and PostgreSQL tests
├── .dev.vars.example        # Worker environment template
└── wrangler.toml            # Worker static assets and schedules
```

## Start the keyless demo

Use Node.js **20.12 or later** and npm. Unzip the source archive, then run the following commands from its project directory. No API account or Supabase project is required.

```bash
npm ci
cp .dev.vars.example .dev.vars
```

In the first terminal:

```bash
npm run api
```

In the second terminal:

```bash
npm run dev
```

Open [the local Vite office](http://localhost:5173). The Node server listens on port `8787`; Vite proxies `/api` to it. The Node demo keeps isolated sessions in memory. Reloading the UI opens a new demo session; restarting the server discards all demo data.

### Try the main workflows

- **Daily edition:** Select `Prepare daily edition`, send the prefilled order, and follow the task board. Demo mode creates nine fictional stories for the example 5/3/1 order. Review each one or use the batch view.
- **Blocked report:** Send `@Layla, is this news confirmed?` or `breaking one source`. The seeded insufficient-evidence case cannot reach the approval queue.
- **Revision:** Open a draft, choose `Reject with feedback`, and provide specific notes. A new linked workflow repeats research, independent checking, and editing. A revision is not an approval.
- **Staging:** Send `@Noura, homepage is slow on mobile, fix it in Staging.` The demo receipt is clearly labeled; `Simulate deployment` logs a demo decision and performs no code edits or deploys.
- **Morning briefing:** Open `Meeting room`, generate the briefing, and select up to five candidates. Assignment starts research. Selecting a candidate does not verify or publish it.
- **2D and 3D:** Desktop and mobile start in 2D; `3D` loads the WebGL bundle on demand. Drag to rotate, use the wheel or pinch to zoom, and select a desk or avatar. Unsupported WebGL, initialization failures, and context loss fall back to 2D.

## Set up live Supabase and Cloudflare

Use a **new** Supabase project for the initial installation. Do not run the initial migration over a database that already uses these table names without reviewing its schema and applying a compatible migration.

1. In the Supabase SQL Editor, run the supplied file `supabase/migrations/20261001000000_office.sql`. It creates the business tables, private image bucket, and restricted RPCs. The API uses a private, leased state document and projects changes into the relational tables in the same transaction.
2. In **Authentication → Users**, create or invite the CEO and note the UUID. Disable open signups if this project is only for the office. In **Table Editor → users**, add a row with that UUID, `role=ceo`, and the CEO's display name. The Worker independently validates every authenticated request against the configured UUID.
3. Fill `.dev.vars` using the table below. Set `APP_MODE=live`. Secrets stay in the Worker or local backend process; never prefix them with `VITE_`. Live mode without a provider key reports the connection as missing rather than replacing real work with fictional output.
4. For a local live smoke test, keep the two development terminals running, restart the backend after editing `.dev.vars`, and sign in with the CEO account. Verify a small test order and inspect sources. Use a nonproduction Supabase project for destructive test resets or trial publications.
5. Sign in with `npx wrangler login`. Set the production variables/secrets with `npx wrangler secret put NAME` for each populated secret below, or upload an equivalent secured secrets file. Put non-secret settings in Wrangler `[vars]` if preferred. The checked-in Worker config keeps `APP_MODE=live` for deploys.
6. Run `npm run deploy`. Open the URL printed by Wrangler, sign in, and rehearse approving a draft in a nonproduction instance before using your Worldline News domain. Configure the domain in Cloudflare only after this verification.
7. The bundled public Arabic reader is at `/#/news`, and `GET /api/public/articles` exposes only approved live articles. If you already have a separate Worldline News front end, point that site's publication integration at the Worker feed. The bundled reader works without an existing website.

| Variable | Use |
| --- | --- |
| `APP_MODE` | `demo` for fictional local use; `live` for real integrations |
| `SUPABASE_URL` | Project HTTPS URL, without a trailing slash |
| `SUPABASE_PUBLISHABLE_KEY` | Server-side Auth API project key. Publishable/legacy anon key, not the service key |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy service-role JWT for server-only Data API and private Storage access |
| `CEO_USER_ID` | UUID created in Auth and inserted into `public.users` |
| `AI_PROVIDER` | `openrouter` or `groq` |
| `OPENROUTER_API_KEY`, `GROQ_API_KEY` | Only the selected provider's key is needed |
| `MODEL_FAST`, `MODEL_EDITOR`, `MODEL_CHECKER` | Optional model overrides. Check availability and price in the provider dashboard. A default is not a promise of free quota |
| `BRAVE_SEARCH_API_KEY` | Optional corroborating news search; RSS works without this key |
| `IMAGE_API_KEY`, `IMAGE_MODEL` | Optional OpenAI image integration. Image generation uses separate provider billing and is not capped by the text token budget |
| `RELEASE_SERVICE_URL`, `RELEASE_SERVICE_TOKEN`, `RELEASE_DEPLOY_TOKEN` | Optional release adapter HTTPS URL plus distinct staging and production secrets |
| `DAILY_TOKEN_LIMIT` | Initial daily text token budget. CEO can adjust it in Settings |
| `AUTO_BREAKING` | `true` to check trusted feeds for explicitly labeled breaking candidates when the queue is idle; off by default |

### Verification and approvals

The planner builds a directed task chain. Research stores publisher links, original publication dates, observed times, and exact evidence excerpts. The deterministic gate requires two distinct configured publisher groups and matching excerpts for **each** Arabic key claim, blocks declared conflicts, and rejects stale or impossible dates. Layla independently evaluates entailment and actual source independence using a separate model request. Sara edits checked material; Layla verifies the edited copy again. An evidence or format failure prevents that draft from entering the approval queue. A URL host or different wording alone is not proof of genuine independence, and provider output is not a substitute for editorial judgment. CEO should review the evidence panel and original sources before approval.

Article publishing requires a validated CEO session plus an explicit approval for the item. The database write adds the publication, decision, and audit records atomically and applies another per-claim evidence-count guard. Only the approved cover option, if chosen in individual review, can be served publicly. Batch approval does not choose covers. Unchecked, rejected, and demo articles never appear in the live feed. All messages and task evidence are private.

Workers schedules run the morning briefing at **08:00 Riyadh**, the evening report at **21:00 Riyadh**, and advance eligible work every minute. The active office also polls and advances work while open. Breaking monitoring is best effort, does not guarantee detection or completion within five minutes, and only creates a task, never publication. The live readership chart measures views from the bundled reader over 30 days, not unique readers. Add Cloudflare rate limits for `/api/session` and `/api/public/articles/*/view` before exposing the Worker widely; the app's in-process view throttle is only a basic guard.

### Connect staging and production

The optional adapter implements a narrowly scoped real staging job for an existing **static** Cloudflare Pages site with server-rendered or static `<img>` markup in `index.html`. The job defers eligible non-hero images, preserves their URLs and tests the resulting preview. It does not claim to compress assets, benchmark end-user phones, or automatically repair arbitrary bugs in an unknown repository. For a framework-generated site, rebuilds may overwrite output-level changes; treat this adapter as a controlled static release example, not a source-repository patcher.

1. Produce a trusted static build for the target site. Use an initially nonproduction Cloudflare Pages project for rehearsal. Set the actual production branch in the adapter environment; its `ai-staging-*` branches must remain preview-only.
2. On an always-on Node host, copy `release-service/.env.example` to `release-service/.env`. Configure `SITE_ARTIFACT_DIR`, a private persistent `RELEASE_STATE_DIR`, a least-privileged Pages API token, account ID, target project, and **two different** random release secrets. Use a dedicated project and token where practical.
3. From the source folder, run `npm ci`, then `npm run release:service`. Put your HTTPS reverse proxy or tunnel in front of `127.0.0.1:8791` and expose `/release` with the same path. Keep the secret-bearing service separate from the frontend and protect its host and logs. Configure the matching release URL and secrets in the Worker.
4. Send the homepage-speed order to Noura. The adapter returns a preview, report, and hash of the staged artifact. A failed smoke test cannot be approved. After review and explicit CEO approval, the Worker calls deploy with the separate production secret and exact artifact hash. The adapter refuses untested or altered artifacts and returns the production receipt.

The release protocol accepts `POST /release` with `{operation, requestId, order, commit}` and an `idempotency-key`. Staging returns `{commit,preview,report,testsPassed}`. Deployment returns `{commit,deploymentUrl}`. A service may report unfinished work as HTTP `202`; the Worker polls. Use a dedicated release adapter to add more approved jobs; agent-generated prose never becomes a shell command.

### Maintain the newsroom

- **Models:** Change the three tier defaults in `shared/agents.ts` or override individual tiers with environment variables. Apply rate and billing limits in the provider account. Failed calls conservatively retain their token reservation when the provider doesn't report usage.
- **Sources:** Edit `shared/sources.ts` with the publisher, domain, genuine ownership/independence group, and feed URL, then redeploy. Confirm a feed's provenance and licensing first. Undated items and likely wire copies do not count as independent evidence.
- **Employees:** To extend the product later, add an ID to `AgentId`, a distinct config entry to `shared/agents.ts`, and the station in `src/Floor.tsx`. Register the worker capability in `worker/engine.ts` and test it. A prompt or UI label alone does not grant backend abilities.
- **Operating limits:** The release adapter is optional and needs the target site and hosting credentials. Initial production commissioning still needs provider checks, retention policy, observability, backups, recovery drills, abuse controls, and a real editorial sign-off. The leased state and full-document database projection are designed for one newsroom owner at moderate volume, not large multi-tenant workloads.

## API quick reference

| Route | Function |
| --- | --- |
| `GET /api/health`, `POST /api/session` | Connection status and CEO/demo session |
| `GET /api/office/state` | Snapshot, usage, tasks, and aggregated analytics |
| `POST /api/office/orders`, `POST /api/office/advance` | Submit a chat order and run the next eligible task |
| `POST /api/office/approvals` | CEO approve/reject single or batch; one optional cover selection |
| `PATCH /api/office/settings` | Set the daily token budget |
| `POST /api/office/reports`, `POST /api/office/picks` | Generate a report and assign selected stories |
| `GET /api/office/images/:workflow/:file` | Read authenticated private image drafts |
| `GET /api/public/articles`, `GET /api/public/articles/:id/cover` | Approved live news and selected cover |
| `POST /api/public/articles/:id/view` | Record a page view of a published article |

## Checks

```bash
npm run build
npm test
npx wrangler deploy --dry-run --outdir /tmp/worldline-worker
```

The tests include 64 deterministic randomized evidence cases in addition to workflow tests and a PostgreSQL-compatible migration test in PGlite. Credentialed tests use stub HTTP contracts, not real provider calls. A real deployment smoke test is still required for Supabase Auth, source coverage, model availability, image uploads, and the target Pages project.
