# Deployment architecture and release control

Status: **infrastructure fixed in the repository, production untouched.** Nothing in this document has
been deployed. The Worker still serves its unknown bundle until an approved promotion is run.

This is the single reference for how WRLDLINE gets to `al-ghaib.us.ci`, which system owns which path,
how each component states its version, and how a release is approved, verified and rolled back.

## 1. Components

| Component | What it serves | Version source |
| --- | --- | --- |
| GitHub Pages (legacy builder, `main` → `/`) | everything static: `/`, `/admin.html`, `/for-you.html`, `/news-map.html`, `/countries.html`, `/country.html`, `/economy.html`, `/dossier/*`, `/sw.js`, CSS and JS | GitHub Pages deployment record (commit SHA) + byte comparison of live files against that commit |
| Cloudflare Worker `wrldline-public` | `/news`, `/news/*`, `/section/*`, `/news-sitemap.xml*`, `/article-sitemap*`, `/rss.xml*`, `/atom.xml*`, `/__version` | `GET /__version` and the `X-Wrldline-Commit` header on every generated response |
| Supabase | data behind the Worker and the signed-in surfaces | migration ledger in the repository; probed by `scripts/probe-backend.mjs` |
| Cloudflare zone (proxy/CDN) | TLS, CDN, edge security headers on static pages | not versioned; configuration only |

## 2. Route ownership

The Worker's route list is the contract. It is enumerated in `cloudflare/workers/wrldline-public/wrangler.jsonc`,
mirrored in `OWNED_ROUTES` inside `worker.js`, and enforced by `tests/deploy-config.test.js`:

```
/news                     /news-sitemap.xml*
/news/*                   /article-sitemap*
/section/*                /rss.xml*
/__version                /atom.xml*
```

Rules the test enforces, so a future edit cannot break them silently:

- no catch-all (`al-ghaib.us.ci/*`), no apex route, no `*.html` sweep;
- preview has no zone route at all — it is reachable only at its own `workers.dev` hostname;
- the production environment is the only one with zone routes and required reviewers;
- the Worker never reads a service-role key.

Everything not in that list is proxied through to the Pages origin untouched, and the verifier asserts
that `/` still carries `x-github-request-id` — i.e. the static home page is not being shadowed.

## 3. Version contract

Every deployed component must be able to answer "which commit are you?" without anyone guessing.

**Worker.** `GET /__version` returns:

```json
{
  "service": "wrldline-public",
  "environment": "production",
  "commit": "0ed5bee51d6528cca40f9d6ed0e48020d5c56578",
  "deployed_at": "2026-11-26T09:15:00.000Z",
  "reported_at": "2026-11-26T09:16:04.512Z",
  "routes": ["/news", "/news/*", "..."]
}
```

- `Cache-Control: no-store`, `X-Robots-Tag: noindex`, CORS `*` so external monitors can read it.
- Every generated page also carries `X-Wrldline-Commit`.
- The commit is injected at deploy time (`--var GIT_COMMIT:<sha> --var DEPLOYED_AT:<iso>`). A deploy
  that forgets to inject them reports `"commit": "unknown"` — it never borrows the value from the
  repository it was built in.
- The endpoint touches no database, so it keeps answering during a backend outage.

**Static site.** There is no build step, so the version is the Pages deployment record. `scripts/verify-deployment.mjs`
reads the latest Pages build, hashes the ten reader-facing files at that commit, fetches them from
production, and compares bytes.

**One command for all three:**

```bash
node scripts/verify-deployment.mjs            # human table
node scripts/verify-deployment.mjs --json     # machine-readable evidence
node scripts/verify-deployment.mjs --strict   # exit 1 on any mismatch (CI gate)
```

It also checks that `/news/`, an article, `/section/politics`, RSS, Atom, both sitemaps and `/__version`
are answered by the Worker (`server-timing: wrldline;dur=…`) rather than by the origin.

## 4. Environments and approval

| Environment | Worker name | Routes | Deploy trigger | Gate |
| --- | --- | --- | --- | --- |
| preview | `wrldline-public-preview` | none (workers.dev only) | every push to `main` touching the Worker | none |
| production | `wrldline-public` | the eight zone routes | `workflow_dispatch` with `promote=production` | `production-worker` environment with required reviewers |

`.github/workflows/deploy-wrldline-public.yml` flow:

1. **test** — syntax check, route ownership, version contract, asset pins, existing public-route tests.
2. **preview** — deploy with the commit stamped, then assert `/__version` reports that exact commit and
   `environment: preview`, and that six Worker routes return 200. A parity report against production is
   attached to the job summary so the reviewer can see what will change.
3. **production** — only on dispatch, only after the environment approval; re-checks that the checked-out
   commit is the approved one, deploys, then runs `verify-deployment.mjs --strict`.
4. Both deploys upload their wrangler logs as artifacts (14 days preview, 90 days production).

Preview and production are separate Worker names, so a broken preview cannot receive traffic and cannot
overwrite the production script.

### Required repository settings (one-time, owner action)

| Setting | Purpose |
| --- | --- |
| Secret `CLOUDFLARE_API_TOKEN` | scoped token with *Workers Scripts: Edit* and *Workers Routes: Edit* on the `al-ghaib.us.ci` zone |
| Secret `CLOUDFLARE_ACCOUNT_ID` | account that owns the Worker |
| Environment `production-worker` + required reviewer | the manual approval gate |
| Environment `worker-preview` (no reviewer) | keeps preview deploys unattended |
| Secrets `STAGING_SUPABASE_URL`, `STAGING_DB_URL`, `STAGING_ANON_KEY` | staging migration rehearsal (see `STAGING_MIGRATION_RUNBOOK.md`) |

Without those secrets the workflow fails before deploying anything, by design.

## 5. Known state at the time of writing

Measured on 2026-11-25 with `scripts/verify-deployment.mjs` and header inspection:

| Fact | Evidence |
| --- | --- |
| `main` = `0ed5bee`, and Pages deployed exactly that commit | Pages build `built @ 0ed5bee`, live files byte-identical |
| `/__version` does not exist in production | `GET /__version` returns a GitHub Pages 404 page, not JSON |
| The live Worker bundle matches no commit in the repository | live article page pins `public-news.css?v=20261123-gate1`, while every commit since `1d4cd2a` (2026-11-23 17:07Z) pins `…reading-order`; the same page also serves `article-trust.css?v=20261125-upd`, introduced 2026-11-25. No commit in any branch contains both. |
| The live article page never loaded `quality.css` | no commit of `worker.js` has ever referenced it; #126 updated static pages only. Earlier external reporting overstated this as "main ships it, production does not" — the correct statement is that the Worker never shipped it at all, and this branch adds it. |
| Worker-served pages were missing `hreflang` alternates | section and news-index pages had none; this branch adds `ar` / `en` / `x-default` for the pages that genuinely render both editions |
| Worker CSP blocked Cloudflare Web Analytics | `script-src 'self'` rejected `static.cloudflareinsights.com`; the beacon was blocked on every Worker page |

Consequence, stated precisely: static pages are current, dynamic pages are frozen at an unknown build.
That is why merged article-page work appeared to vanish.

## 6. Reconciling the deployed Worker with the repository

This cannot be fixed by editing production directly, and it should not be. The procedure:

1. Run the deploy workflow with `promote=preview-only` on the approved `main` commit.
2. Read the parity report in the job summary. It normalises nonces, timings, absolute dates, UUIDs and
   hostnames, so real differences stand out from request noise.
3. Spot-check the preview by hand: article page, section page, RSS, both sitemaps, `/__version`.
4. Approve the `production-worker` environment. The production job deploys the same commit and refuses
   to proceed if the checked-out SHA differs from the approved one.
5. The job's final step runs `verify-deployment.mjs --strict`; a mismatch fails the release and the
   rollback workflow is available immediately.

## 7. Rollback

`.github/workflows/rollback-wrldline-public.yml` takes a commit SHA that must be an ancestor of `main`,
re-runs the route/version contract against it (skipping tests that did not exist at that commit), deploys
with the target commit stamped, and — for production — verifies `/__version` reports it. Production
rollback still requires the `production-worker` approval.

Static rollback is a `git revert` on `main`; Pages republishes on push, which is the existing, working
path.

## 8. Release checklist

Before promoting anything:

- [ ] `main` is green (`WRLDLINE Code Quality`, `WRLDLINE Production Readiness`).
- [ ] `node scripts/verify-deployment.mjs` shows Pages == `main`.
- [ ] Preview deploy completed and `/__version` reports the candidate commit.
- [ ] Parity report reviewed; every difference is intended.
- [ ] Preview spot checks pass: article, section, RSS, sitemaps.
- [ ] Backend objects that the release depends on are applied (see `STAGING_MIGRATION_RUNBOOK.md` and
      `PERSONALIZED_FEED_ROLLOUT.md`).
- [ ] Approval recorded in the `production-worker` environment.
- [ ] After promotion: `verify-deployment.mjs --strict` passes and the traceability job is green.
