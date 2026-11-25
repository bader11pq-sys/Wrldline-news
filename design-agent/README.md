# Worldline Design Agent

This directory contains the isolated visual research subsystem for the Worldline News design agent.

## Current capability

- Uses a fixed, reviewable catalog of 12 public news homepages in Arabic and English.
- Visits each configured homepage once per run; it does not crawl links.
- Captures desktop (1440×1000) and mobile (390×844) viewport screenshots.
- Records page title, final URL, HTTP status, language/direction metadata, and up to five H1 headings.
- Analyzes each desktop/mobile screenshot pair with Gemini Vision first, then Groq Vision if Gemini fails.
- Produces structured observations about layout, navigation, typography, spacing, mobile adaptation, RTL relevance, accessibility, and reusable ideas for Worldline.
- Stores screenshots, capture manifest, and AI analysis as a GitHub Actions artifact, not in the production website.

## Run locally

Install the same pinned browser dependency used in CI:

```bash
python -m pip install playwright==1.56.0
python -m playwright install chromium
python scripts/design-agent/capture_references.py
python scripts/design-agent/analyze_references.py
```

Optional: limit the capture to three sources with `--limit 3`.

For AI analysis, set `GEMINI_API_KEY` and/or `GROQ_API_KEY` in your local environment. Gemini is attempted first; Groq is used only if Gemini is unavailable or returns an error. Defaults are `gemini-3.8-flash` and `qwen/qwen3.8-27b`; they can be overridden with `GEMINI_MODEL` and `GROQ_VISION_MODEL`.

## Automation and secrets

The `Worldline Design Discovery` workflow uses the current Node 24-compatible `actions/upload-artifact@v7.0.2` pin and:
- Runs weekly on Monday at 04:23 UTC.
- Can be started manually from GitHub Actions.
- Runs when the design-agent catalog, scripts, tests, or workflow itself changes on `main`.
- Has read-only repository permissions.
- Receives only the two optional AI-provider keys; it receives no Supabase, Cloudflare, Stripe, production, or deployment credentials.

Configure optional repository/environment secrets named `GEMINI_API_KEY` and `GROQ_API_KEY`. Optional repository variables `GEMINI_MODEL` and `GROQ_VISION_MODEL` can override the defaults. If neither key is present, capture still completes and the artifact records that AI analysis was skipped.

## Safety and rights

- This is a bounded visual reference capture tool, not an unrestricted crawler.
- It does not log in, submit forms, click through sites, or evade bot/access controls.
- Failed, blocked, or rate-limited sites are recorded as failures; no bypass is attempted.
- Screenshots are for internal design analysis only. Do not reuse third-party logos, photographs, copy, or distinctive proprietary assets.
- AI observations are advisory. They do not authorize code edits or deployment.
- The capture/analyzer workflow cannot modify production source files.

## Not yet implemented

- Similarity search and durable design memory.
- A code agent with path allowlists, isolated preview branches, and rollback.
- Automated design changes or deployment.
- Full Lighthouse/accessibility/visual regression scoring.

The next phase builds provenance-aware design memory and a safe proposal pipeline. Production code editing remains disabled until those controls and the site's visual baseline are verified.
