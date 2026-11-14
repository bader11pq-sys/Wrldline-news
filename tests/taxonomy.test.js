const test = require("node:test");
const assert = require("node:assert/strict");

const taxonomy = require("../taxonomy.js");
const { parseEntry } = require("../bot-ingest.js");

test("unknown categories never become world", () => {
  assert.equal(taxonomy.normalizeCategory("world"), "world");
  assert.equal(taxonomy.normalizeCategory("sports"), "sports");
  assert.equal(taxonomy.normalizeCategory("news"), "uncategorized");
  assert.equal(taxonomy.normalizeCategory(null), "uncategorized");
  assert.equal(taxonomy.categoryName("something-else", "ar"), "غير مصنف");
  assert.equal(taxonomy.categoryName("something-else", "en"), "Uncategorized");
});

test("source-declared language wins and conflicts are reported", () => {
  const conflict = taxonomy.resolveSourceLanguage("ar", "English headline only");
  assert.equal(conflict.language, "ar");
  assert.equal(conflict.detection, "conflict");
  assert.equal(conflict.detected, "en");

  const detected = taxonomy.resolveSourceLanguage("", "عنوان عربي واضح");
  assert.equal(detected.language, "ar");
  assert.equal(detected.detection, "detected");

  const declared = taxonomy.resolveSourceLanguage("en", "English headline");
  assert.equal(declared.language, "en");
  assert.equal(declared.detection, "declared");
});

test("source scope describes the publisher, not the event country", () => {
  assert.equal(taxonomy.inferSourceScope({ name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" }), "international");
  assert.equal(taxonomy.inferSourceScope({ name: "صحيفة محلية", country: "السعودية" }), "national");
  assert.equal(taxonomy.normalizeScope("not-a-scope"), "unknown");
});

test("translation labels distinguish review from published", () => {
  assert.equal(taxonomy.translationStatusLabel("review", "machine_draft", "ar"), "ترجمة قيد المراجعة");
  assert.equal(taxonomy.translationStatusLabel("published", "machine_draft", "ar"), "ترجمة آلية منشورة");
  assert.equal(taxonomy.translationStatusLabel("published", "editorial", "ar"), "ترجمة تحريرية معتمدة");
  assert.equal(taxonomy.translationStatusLabel("none", "", "ar"), "");
});

function rssBlock(title, description) {
  return `<item><title>${title}</title><link>https://example.com/story</link><description>${description}</description><pubDate>Sat, 14 Nov 2026 10:00:00 GMT</pubDate></item>`;
}

test("bot parseEntry uses feed category and never invents an event country", () => {
  const entry = parseEntry(rssBlock("A football result", "Match report"), {
    name: "BBC Sport",
    url: "https://feeds.bbci.co.uk/sport/rss.xml",
    lang: "en",
    category: "sports",
    source_scope: "international",
    country: "دولي",
  });
  assert.ok(entry);
  assert.equal(entry.category, "sports");
  assert.equal(entry.country, null);
  assert.equal(entry.source_country, null);
  assert.equal(entry.source_language, "en");
  assert.equal(entry.language_detection, "declared");
  assert.equal(entry.source_scope, "international");
});

test("bot parseEntry records a language conflict but keeps the declared language", () => {
  const entry = parseEntry(rssBlock("English title", "English summary"), {
    name: "Arabic publisher",
    url: "https://example.com/rss",
    lang: "ar",
    category: "world",
    source_scope: "international",
    country: "دولي",
  });
  assert.ok(entry);
  assert.equal(entry.lang, "ar");
  assert.equal(entry.source_language, "ar");
  assert.equal(entry.language_detection, "conflict");
  assert.equal(entry.category, "world");
  assert.equal(entry.country, null);
});

test("bot parseEntry turns an unknown feed category into uncategorized", () => {
  const entry = parseEntry(rssBlock("General story", "General summary"), {
    name: "General feed",
    url: "https://example.com/general.xml",
    lang: "en",
    category: "news",
    source_scope: "unknown",
  });
  assert.ok(entry);
  assert.equal(entry.category, "uncategorized");
  assert.equal(entry.classification_reason, "unclassified_source");
});

const fs = require("node:fs");
const path = require("node:path");

test("source files do not reintroduce the world or pseudo-country defaults", () => {
  const root = path.resolve(__dirname, "..");
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const bot = fs.readFileSync(path.join(root, "bot-ingest.js"), "utf8");
  const edge = fs.readFileSync(path.join(root, "supabase/functions/wrldline-news-ingest/index.ts"), "utf8");
  assert.equal(script.includes('?a.category:"world"'), false);
  assert.equal(bot.includes('category:"world"'), false);
  assert.equal(edge.includes('category:"world"'), false);
  assert.equal(edge.includes('country:"غير محدد"'), false);
});
