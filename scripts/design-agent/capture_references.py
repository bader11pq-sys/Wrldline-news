#!/usr/bin/env python3
"""Capture a small, allowlisted set of public news-site design references.

This is a visual research utility, not a crawler. It visits each configured
homepage once, takes desktop/mobile viewport screenshots, and records only
page metadata. It never logs in, submits forms, follows links, or bypasses
access controls. Screenshots are CI artifacts, not committed site assets.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "design-agent" / "references.json"
DEFAULT_OUTPUT = ROOT / "artifacts" / "design-discovery"


def safe_id(value: str) -> str:
    return re.sub(r"[^a-z0-9_-]+", "-", value.lower()).strip("-") or "source"


def load_config():
    data = json.loads(CONFIG.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or not isinstance(data.get("sources"), list):
        raise ValueError("Unsupported or invalid reference catalog")
    ids = set()
    for source in data["sources"]:
        if not all(source.get(key) for key in ("id", "name", "url", "language")):
            raise ValueError("Each source requires id, name, url, and language")
        if source["id"] in ids:
            raise ValueError(f"Duplicate source id: {source['id']}")
        ids.add(source["id"])
        parsed = urlparse(source["url"])
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError(f"Only HTTPS homepage URLs are allowed: {source['url']}")
        if parsed.path not in ("", "/") and "?" in source["url"]:
            raise ValueError(f"Reference URLs must not include query strings: {source['url']}")
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=0, help="Optional maximum number of sources")
    parser.add_argument("--timeout-ms", type=int, default=25000)
    args = parser.parse_args()

    config = load_config()
    sources = config["sources"][:args.limit] if args.limit > 0 else config["sources"]
    viewports = config["policy"]["capture_viewports"]
    args.output.mkdir(parents=True, exist_ok=True)
    results = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for source in sources:
            record = {
                "id": source["id"],
                "name": source["name"],
                "url": source["url"],
                "region": source.get("region"),
                "language": source["language"],
                "captured_at": datetime.now(timezone.utc).isoformat(),
                "status": "failed",
                "screenshots": {},
            }
            page = None
            try:
                context = browser.new_context(
                    viewport={"width": viewports[0]["width"], "height": viewports[0]["height"]},
                    device_scale_factor=1,
                    locale="ar-SA" if source["language"] == "ar" else "en-US",
                    reduced_motion="reduce",
                )
                page = context.new_page()
                response = page.goto(source["url"], wait_until="domcontentloaded", timeout=args.timeout_ms)
                try:
                    page.wait_for_load_state("networkidle", timeout=5000)
                except Exception:
                    pass
                page.wait_for_timeout(500)
                record["http_status"] = response.status if response else None
                record["final_url"] = page.url
                record["title"] = (page.title() or "")[:300]
                record["h1"] = [text.strip()[:180] for text in page.locator("h1").all_text_contents()[:5] if text.strip()]
                record["document_language"] = page.locator("html").get_attribute("lang")
                record["document_direction"] = page.locator("html").get_attribute("dir")
                record["status"] = "captured" if response and response.ok else "http-error"
                for viewport in viewports:
                    page.set_viewport_size({"width": viewport["width"], "height": viewport["height"]})
                    page.wait_for_timeout(350)
                    shot = args.output / f"{safe_id(source['id'])}-{viewport['name']}.png"
                    page.screenshot(path=str(shot), full_page=False, animations="disabled")
                    record["screenshots"][viewport["name"]] = shot.name
                context.close()
            except Exception as error:
                record["error"] = f"{type(error).__name__}: {str(error)[:500]}"
                if page:
                    try:
                        page.context.close()
                    except Exception:
                        pass
            results.append(record)
            print(f"[{record['status']}] {source['id']} {record.get('http_status', '')} {record.get('error', '')}")

        browser.close()

    manifest = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_count": len(sources),
        "captured_count": sum(item["status"] == "captured" for item in results),
        "results": results,
        "limitations": [
            "Only configured public homepages are visited.",
            "One navigation per source per run; no link crawling or interactions.",
            "A screenshot is a visual reference, not permission to copy protected branding or assets.",
            "A successful capture does not imply editorial endorsement or quality ranking.",
        ],
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: manifest[key] for key in ("source_count", "captured_count", "generated_at")}, ensure_ascii=False))
    return 0 if manifest["captured_count"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
