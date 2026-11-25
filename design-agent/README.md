# Worldline Design Agent

This directory contains the isolated visual research subsystem for the Worldline News design agent.

## Current capability

- Uses a fixed, reviewable catalog of public news homepages in Arabic and English.
- Visits each configured homepage once per run.
- Captures desktop (1440×1000) and mobile (390×844) viewport screenshots.
- Records page title, final URL, HTTP status, language/direction metadata, and up to five H1 headings.
- Stores screenshots and a JSON manifest as a GitHub Actions artifact, not in the production website.

## Run locally

Install the same pinned browser dependency used in CI:

```bash
python -m pip install playwright==1.56.0
python -m playwright install chromium
python scripts/design-agent/capture_references.py
```

Optional: limit the number of sources with `--limit 3`.

## Automation

The `Worldline Design Discovery` workflow runs weekly and can also be started manually from GitHub Actions. It has read-only repository permissions and does not receive production secrets.

## Safety and rights

- This is a bounded visual reference capture tool, not an unrestricted crawler.
- It does not log in, submit forms, click through sites, or evade bot/access controls.
- Failed, blocked, or rate-limited sites are recorded as failures; no bypass is attempted.
- Screenshots are for internal design analysis only. Do not reuse third-party logos, photographs, copy, or distinctive proprietary assets.
- The next phase adds visual analysis and provenance-aware design observations. It must distinguish reusable general patterns from protected expression.

## Not yet implemented

- AI screenshot analysis (Gemini / optional Groq fallback).
- Similarity search and durable design memory.
- Automatic code edits or deployment.
- Performance, accessibility, and functional quality scoring.

The discovery workflow must never modify production source files.
