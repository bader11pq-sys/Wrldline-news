const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "source-catalog.json"), "utf8"));
const ingest = fs.readFileSync(path.join(root, "supabase/functions/wrldline-news-ingest/index.ts"), "utf8");
const breakingCli = fs.readFileSync(path.join(root, "bot-breaking.js"), "utf8");
const breaking = fs.readFileSync(path.join(root, "supabase/functions/breaking-news-monitor/index.ts"), "utf8");

test("canonical RSS catalog has exactly 80 unique source endpoints", () => {
  assert.equal(catalog.length, 80);
  const urls = catalog.map((source) => source.url);
  assert.equal(new Set(urls).size, 80);
  assert.ok(catalog.every((source) => /^https?:\/\//i.test(source.url)));
  assert.ok(catalog.every((source) => source.name && source.lang && source.pipeline === "general"));
});

test("the canonical catalog has 68 Arabic and 12 English publishers", () => {
  assert.equal(catalog.filter((source) => source.lang === "ar").length, 68);
  assert.equal(catalog.filter((source) => source.lang === "en").length, 12);
});

test("breaking collection monitors exactly 24 Arabic sources from the same 80-source catalog", () => {
  const breakingSources = catalog.filter((source) => source.breaking === true);
  assert.equal(breakingSources.length, 24);
  assert.ok(breakingSources.every((source) => typeof source.breaking_domain === "string" && source.breaking_domain.length > 0));
  assert.ok(breakingSources.every((source) => source.lang === "ar"), "breaking sources must be Arabic only");
  assert.equal(catalog.filter((source) => source.lang === "en" && source.breaking === true).length, 0);
  assert.equal(new Set(breakingSources.map((source) => source.breaking_domain)).size, 24);

  assert.match(breakingCli, /EXPECTED_CATALOG_SIZE = 80/);
  assert.match(breakingCli, /EXPECTED_BREAKING_SOURCES = 24/);
  assert.match(breakingCli, /urgent\\.length !== EXPECTED_BREAKING_SOURCES/);

  const sourceBlock = breaking.match(/const SOURCES = \\[([\\s\\S]*?)\\n\\];/);
  assert.ok(sourceBlock, "the shared Supabase monitor must declare its source catalog");
  const monitorSources = [...sourceBlock[1].matchAll(/\\{ publisher: "([^"]+)", domain: "([^"]+)"/g)];
  assert.equal(monitorSources.length, 24);
  for (const [, publisher, domain] of monitorSources) {
    const catalogSource = breakingSources.find((source) => source.name === publisher);
    assert.ok(catalogSource, `monitor source ${publisher} must exist in the canonical catalog`);
    assert.equal(catalogSource.breaking_domain, domain, `${publisher} domain must match the canonical catalog`);
  }

  assert.match(breaking, /async function retryFetch/);
  assert.match(breaking, /retry-after/i, "honour Retry-After when providers rate-limit");
  assert.match(breaking, /claim_breaking_monitor/);
  assert.match(breaking, /Array\\.from\\(\\{ length: 4 \\}/, "limit source concurrency to four lanes");
  assert.doesNotMatch(breaking, /Array\\.from\\(\\{ length: 10 \\}/, "do not restore high source concurrency");
});
test("general ingestion rejects a registry or source catalog larger than the approved 80", () => {
  assert.match(ingest, /catalog\.length!==80/);
  assert.match(ingest, /RSS registry must have exactly 80 active unique sources/);
  assert.doesNotMatch(ingest, /catalog\.length<1000|slice\(0,1000\)|batchSize=250/);
  assert.match(ingest, /\[408,425,429,500,502,503,504\]/, "transient provider errors must be retried");
  assert.match(ingest, /retry-after/i, "honour Retry-After when providers rate-limit");
  assert.match(ingest, /function isFeedDocument/);
  assert.match(ingest, /entries.length===0&&isFeedDocument\(xml\)/, "valid empty RSS/Atom feeds are healthy no-new-story polls");
  assert.match(ingest, /no_new_items:true/);
});
