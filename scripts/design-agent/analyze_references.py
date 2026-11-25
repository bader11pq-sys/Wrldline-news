#!/usr/bin/env python3
"""Analyze captured public design references with Gemini Vision, then Groq Vision fallback.

The script only reads screenshots created by capture_references.py and writes
structured design observations. It never writes to production website files.
"""
from __future__ import annotations

import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIR = ROOT / "artifacts" / "design-discovery"
PROMPT = """You are a senior editorial product designer auditing public news-site screenshots.
Analyze the supplied desktop and mobile screenshots as design references for Worldline News.
Do not recommend copying logos, photographs, article text, brand marks, or distinctive proprietary
visual expression. Extract general, reusable interface patterns only. Do not infer behavior that
cannot be seen in the screenshots. Distinguish observation from recommendation.

Return ONLY one valid JSON object with this schema:
{
  "summary": "short evidence-based summary",
  "layout_patterns": ["..."],
  "navigation_patterns": ["..."],
  "typography_observations": ["..."],
  "color_and_contrast": ["..."],
  "spacing_and_density": ["..."],
  "mobile_adaptation": ["..."],
  "rtl_relevance": ["..."],
  "accessibility_checks": ["..."],
  "ideas_for_worldline": [
    {"idea":"...", "rationale":"...", "risk":"low|medium|high", "scope":"presentation-only"}
  ],
  "do_not_copy": ["protected brand or asset categories visible in the screenshots"],
  "confidence": 0.0
}
Keep arrays concise and specific. Use empty arrays when an element cannot be assessed.
The reference site is evidence, not an authority: flag patterns that could harm readability,
accessibility, source attribution, or newsroom clarity.
"""

def request_json(url: str, headers: dict, payload: dict, timeout: int = 90) -> dict:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    last_error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")[:1200]
            last_error = RuntimeError(f"HTTP {error.code}: {body}")
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise last_error
        except (urllib.error.URLError, TimeoutError) as error:
            last_error = error
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)
    raise last_error or RuntimeError("Provider request failed")


def image_part(path: Path) -> tuple[str, str]:
    suffix = path.suffix.lower()
    mime = "image/png" if suffix == ".png" else "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return mime, encoded


def parse_model_json(text: str) -> dict:
    candidate = text.strip()
    candidate = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", candidate, flags=re.I)
    try:
        result = json.loads(candidate)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", candidate)
        if not match:
            raise ValueError("Model response did not contain a JSON object")
        result = json.loads(match.group(0))
    if not isinstance(result, dict):
        raise ValueError("Model response must be a JSON object")
    return result


def analyze_gemini(model: str, key: str, prompt: str, images: list[Path]) -> dict:
    parts = [{"text": prompt}]
    for path in images:
        mime, encoded = image_part(path)
        parts.append({"inlineData": {"mimeType": mime, "data": encoded}})
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        + urllib.parse.quote(model, safe="-._")
        + ":generateContent?key="
        + urllib.parse.quote(key, safe="")
    )
    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
    }
    response = request_json(url, {"Content-Type": "application/json"}, payload)
    candidates = response.get("candidates") or []
    content = candidates[0].get("content", {}) if candidates else {}
    text = "".join(part.get("text", "") for part in content.get("parts", []))
    if not text:
        raise RuntimeError("Gemini returned no text content")
    return parse_model_json(text)


def analyze_groq(model: str, key: str, prompt: str, images: list[Path]) -> dict:
    content = [{"type": "text", "text": prompt}]
    for path in images:
        mime, encoded = image_part(path)
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{encoded}"},
        })
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.1,
        "max_completion_tokens": 1600,
    }
    response = request_json(
        "https://api.groq.com/openai/v1/chat/completions",
        {"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        payload,
    )
    choices = response.get("choices") or []
    text = choices[0].get("message", {}).get("content", "") if choices else ""
    if not text:
        raise RuntimeError("Groq returned no text content")
    return parse_model_json(text)


def main() -> int:
    directory = Path(os.environ.get("DESIGN_DISCOVERY_DIR", str(DEFAULT_DIR)))
    manifest_path = directory / "manifest.json"
    if not manifest_path.exists():
        print("No capture manifest found; skipping AI analysis.")
        return 0

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    gemini_model = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
    groq_model = os.environ.get("GROQ_VISION_MODEL", "qwen/qwen3.8-27b")

    if not gemini_key and not groq_key:
        report = {
            "status": "skipped-no-provider-credentials",
            "message": "Configure GEMINI_API_KEY or GROQ_API_KEY as repository/environment secrets to enable visual analysis.",
            "results": [],
        }
        (directory / "analysis.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(report["message"])
        return 0

    results = []
    for source in manifest.get("results", []):
        if source.get("status") != "captured":
            continue
        screenshots = source.get("screenshots", {})
        images = [directory / screenshots[name] for name in ("desktop", "mobile") if screenshots.get(name)]
        if len(images) != 2 or not all(path.is_file() for path in images):
            results.append({"id": source["id"], "status": "skipped-missing-screenshots"})
            continue
        prompt = PROMPT + f"\nReference name: {source.get('name')}\nLanguage: {source.get('language')}\n"
        provider = None
        error_messages = []
        observation = None
        if gemini_key:
            try:
                observation = analyze_gemini(gemini_model, gemini_key, prompt, images)
                provider = "gemini"
                model = gemini_model
            except Exception as error:
                error_messages.append(f"gemini: {type(error).__name__}: {str(error)[:500]}")
        if observation is None and groq_key:
            try:
                observation = analyze_groq(groq_model, groq_key, prompt, images)
                provider = "groq"
                model = groq_model
            except Exception as error:
                error_messages.append(f"groq: {type(error).__name__}: {str(error)[:500]}")
        if observation is None:
            results.append({"id": source["id"], "status": "analysis-failed", "errors": error_messages})
        else:
            results.append({
                "id": source["id"],
                "name": source.get("name"),
                "language": source.get("language"),
                "status": "analyzed",
                "provider": provider,
                "model": model,
                "observation": observation,
                "fallback_used": provider == "groq" and bool(gemini_key),
                "provider_errors": error_messages,
            })
        print(f"[{results[-1]['status']}] {source['id']} provider={results[-1].get('provider', 'none')}")
        time.sleep(1)

    report = {
        "status": "completed" if any(item["status"] == "analyzed" for item in results) else "no-successful-analysis",
        "provider_order": ["gemini", "groq"],
        "analyzed_count": sum(item["status"] == "analyzed" for item in results),
        "failed_count": sum(item["status"] == "analysis-failed" for item in results),
        "results": results,
        "safety": "Observations are advisory. They do not authorize code edits or deployment.",
    }
    (directory / "analysis.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("status", "analyzed_count", "failed_count")}))
    return 0 if report["analyzed_count"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
