#!/usr/bin/env node
// MANUAL, READ-ONLY reachability diagnostic for the sources in source-catalog.json.
// It is NOT ingestion: it never writes to a database, never stores or publishes feed content, and is not scheduled.
// Only the HTTP status, content type, a feed-shape check on the first 4 KB, and timing are reported.
// Usage: node scripts/source-reachability-probe.mjs [--catalog source-catalog.json] [--concurrency 6] [--json out.json] [--csv out.csv]
import { readFile, writeFile } from "node:fs/promises";

export function classifyProbe({ status, error, contentType = "", head = "", redirected = false, finalHost = "", host = "" }) {
  if (error) {
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(error)) return "dns_failure";
    if (/timeout|abort/i.test(error)) return "timeout";
    if (/certificate|CERT|SSL|TLS/i.test(error)) return "tls_error";
    return "network_error";
  }
  if (status === 401 || status === 403) return "blocked_or_auth";
  if (status === 404 || status === 410) return "gone";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  const sample = head.slice(0, 4000).toLowerCase();
  const feedLike = /<rss[\s>]|<feed[\s>]|<rdf:rdf|<channel[\s>]/.test(sample);
  if (!feedLike) return /<html/.test(sample) ? "html_not_feed" : "not_a_feed";
  if (finalHost && host && finalHost !== host) return "ok_redirected_host";
  return "ok";
}

async function probe(entry, timeoutMs = 12000) {
  const started = Date.now();
  let host = ""; try { host = new URL(entry.url).hostname; } catch { return { ...entry, result: "invalid_url", ms: 0 }; }
  try {
    const res = await fetch(entry.url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "WorldlineNewsHealthProbe/1.0 (+read-only diagnostic)", Accept: "application/rss+xml, application/xml, text/xml, */*" } });
    const reader = res.body?.getReader(); let head = "";
    if (reader) { const { value } = await reader.read(); head = new TextDecoder().decode(value || new Uint8Array()).slice(0, 4096); await reader.cancel().catch(() => {}); }
    const finalHost = new URL(res.url).hostname;
    return { name: entry.name, host, status: res.status, contentType: res.headers.get("content-type") || "", ms: Date.now() - started,
      result: classifyProbe({ status: res.status, contentType: res.headers.get("content-type") || "", head, finalHost, host }), finalHost };
  } catch (e) {
    const msg = String(e?.cause?.code || e?.cause?.message || e?.message || e);
    return { name: entry.name, host, status: 0, ms: Date.now() - started, result: classifyProbe({ error: msg }), detail: msg.slice(0, 120) };
  }
}

export async function probeAll(entries, concurrency = 6) {
  const out = new Array(entries.length); let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => { while (i < entries.length) { const n = i++; out[n] = await probe(entries[n]); } }));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const entries = JSON.parse(await readFile(arg("--catalog", "source-catalog.json"), "utf8"));
  const results = await probeAll(entries, Number(arg("--concurrency", 6)));
  const tally = {}; for (const r of results) tally[r.result] = (tally[r.result] || 0) + 1;
  console.log(JSON.stringify({ probed: results.length, tally }, null, 1));
  for (const r of results.filter((x) => !x.result.startsWith("ok"))) console.log(r.result.padEnd(18), String(r.status).padEnd(4), r.host, "-", r.name);
  if (arg("--json")) await writeFile(arg("--json"), JSON.stringify(results, null, 1));
  if (arg("--csv")) await writeFile(arg("--csv"), "name,host,status,result,ms\n" + results.map((r) => [r.name, r.host, r.status, r.result, r.ms].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"));
}
