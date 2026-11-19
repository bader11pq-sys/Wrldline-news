import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, renderDossier, renderIndex, renderFeed, renderSitemap, renderWatchlist, renderClaims, renderImpact, renderDigest, renderWatchlistJson, renderIcs, renderReview, parseWhen, collectWatch, collectClaims, collectImpact, DossierError } from "../scripts/build-dossiers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "content", "dossiers");
const OUT = path.join(ROOT, "dossier");
const files = fs.readdirSync(CONTENT).filter((f) => f.endsWith(".json")).sort();
const loaded = files.map((f) => ({ file: f, raw: JSON.parse(fs.readFileSync(path.join(CONTENT, f), "utf8")) }));
const dossiers = loaded.map(({ file, raw }) => validate(raw, file));

const base = () => ({
  slug: "test-dossier",
  title: "عنوان تجريبي لملف حدث",
  shortTitle: "تجريبي",
  kicker: "ملف تجريبي",
  status: "active",
  statusNote: "ملاحظة حالة.",
  summary: "ملخص تجريبي طويل بما يكفي لاجتياز الحد الأدنى المطلوب في المخطط، ويشرح ما حدث وما يعنيه دون مبالغة أو أرقام غير موثقة.",
  location: "الخليج",
  startedAt: "2026-11-01T00:00:00Z",
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-02T00:00:00Z",
  tags: ["اختبار"],
  sectors: ["الطاقة"],
  keywords: ["اختبار"],
  facts: [{ label: "حقيقة", value: "قيمة", sourceRefs: ["s1"] }, { label: "حقيقة 2", value: "قيمة 2", sourceRefs: ["s2"] }],
  parties: [{ name: "طرف", role: "دور" }],
  whatChanged: [{ at: "2026-11-02T00:00:00Z", text: "تغيير موثق.", sourceRefs: ["s1"] }],
  timeline: [
    { at: "2026-11-01T00:00:00Z", kind: "event", verification: "verified", text: "حدث أول.", sourceRefs: ["s1"] },
    { at: "2026-11-02T00:00:00Z", kind: "statement", verification: "reported", text: "حدث ثان.", sourceRefs: ["s2"] },
    { at: "2026-11-03T00:00:00Z", kind: "report", verification: "estimated", text: "حدث ثالث.", sourceRefs: ["s1"] },
  ],
  narratives: { agreements: [{ text: "اتفاق.", sourceRefs: ["s1"] }], differences: [], unverified: [] },
  context: [{ heading: "سياق", paragraphs: ["فقرة سياق."], sourceRefs: ["s1"] }],
  impact: { actual: [{ text: "أثر فعلي.", sourceRefs: ["s1"] }], potential: [{ text: "أثر محتمل.", sourceRefs: [] }] },
  watchNext: [{ what: "مؤشر", when: "غداً", why: "سبب." }, { what: "مؤشر 2", when: "", why: "سبب 2." }],
  sources: [
    { id: "s1", publisher: "ناشر أول", title: "مصدر أول", url: "https://example.com/one", accessedAt: "2026-11-02T00:00:00Z", kind: "official" },
    { id: "s2", publisher: "ناشر ثان", title: "مصدر ثان", url: "https://example.com/two", accessedAt: "2026-11-02T00:00:00Z", kind: "wire" },
    { id: "s3", publisher: "ناشر ثالث", title: "مصدر ثالث", url: "https://example.com/three", accessedAt: "2026-11-02T00:00:00Z", kind: "outlet" },
  ],
  updates: [{ at: "2026-11-02T00:00:00Z", version: "1.0", note: "إصدار أول." }],
  corrections: [],
});

test("every curated dossier satisfies the editorial contract", () => {
  assert.ok(dossiers.length >= 3, "at least three dossiers are required");
  for (const d of dossiers) {
    assert.match(d.slug, /^[a-z0-9-]+$/);
    assert.ok(d.sources.length >= 3);
    assert.ok(d.timeline.length >= 3);
    assert.ok(d.watchNext.length >= 2);
  }
});

test("a source reference that does not exist is rejected", () => {
  const raw = base();
  raw.facts[0].sourceRefs = ["missing"];
  assert.throws(() => validate(raw, "x.json"), DossierError);
});

test("a non-https source is rejected", () => {
  const raw = base();
  raw.sources[0].url = "http://example.com/insecure";
  assert.throws(() => validate(raw, "x.json"), /https/);
});

test("duplicate source ids are rejected", () => {
  const raw = base();
  raw.sources[1].id = "s1";
  assert.throws(() => validate(raw, "x.json"), /مكرر/);
});

test("timeline is sorted by event time and keeps report time separate", () => {
  const raw = base();
  raw.timeline.reverse();
  raw.timeline[0].reportedAt = "2026-11-05T00:00:00Z";
  const d = validate(raw, "x.json");
  assert.deepEqual(d.timeline.map((t) => t.at), [
    "2026-11-01T00:00:00.000Z",
    "2026-11-02T00:00:00.000Z",
    "2026-11-03T00:00:00.000Z",
  ]);
  const html = renderDossier(d, Date.parse("2026-11-06T00:00:00Z"));
  assert.match(html, /نُشرت المعلومة في/);
});

test("rendered dossier exposes the required product sections", () => {
  const html = renderDossier(dossiers[0], Date.parse("2026-11-19T12:00:00Z"));
  for (const needle of ["ماذا تغيّر؟", "الخط الزمني", "ميزان الروايات", "السياق", "الأثر على السعودية والخليج", "ماذا نراقب تالياً؟", "المصادر", "سجل التحديثات", "سجل التصحيحات"]) {
    assert.ok(html.includes(needle), `missing section: ${needle}`);
  }
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /"@type":"AnalysisNewsArticle"/);
  assert.match(html, /rel="canonical"/);
});

test("user-supplied text is escaped in HTML output", () => {
  const raw = base();
  raw.title = 'عنوان <script>alert(1)</script> تجريبي';
  raw.summary = 'ملخص <img src=x onerror=alert(1)> تجريبي طويل بما يكفي لاجتياز الحد الأدنى المطلوب في المخطط، ويشرح ما حدث.';
  raw.context[0].paragraphs = ['<iframe src="javascript:alert(1)"></iframe>'];
  const d = validate(raw, "x.json");
  const html = renderDossier(d, Date.parse("2026-11-06T00:00:00Z"));
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<iframe"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("JSON-LD stays parseable when content contains angle brackets", () => {
  const raw = base();
  raw.title = "عنوان </script><script>alert(1)</script>";
  const d = validate(raw, "x.json");
  const html = renderDossier(d, Date.parse("2026-11-06T00:00:00Z"));
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match);
  const parsed = JSON.parse(match[1]);
  assert.equal(parsed.headline, raw.title);
});

test("index, feed and sitemap cover every dossier exactly once", () => {
  const html = renderIndex(dossiers, Date.parse("2026-11-19T12:00:00Z"));
  const feed = renderFeed(dossiers);
  const sitemap = renderSitemap(dossiers);
  assert.match(html, /id="dossierSearch"/);
  assert.match(html, /data-search="/);
  for (const d of dossiers) {
    assert.ok(html.includes(`/dossier/${d.slug}.html`), `index missing ${d.slug}`);
    assert.equal((feed.match(new RegExp(`/dossier/${d.slug}.html`, "g")) || []).length >= 1, true);
    assert.equal((sitemap.match(new RegExp(`/dossier/${d.slug}.html`, "g")) || []).length, 1);
  }
});

test("watchlist, claims, impact and digest render their core sections", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  const watch = collectWatch(dossiers, now);
  const claims = collectClaims(dossiers);
  const impacts = collectImpact(dossiers);
  const w = renderWatchlist(dossiers, watch, now);
  assert.match(w, /ما نراقبه تالياً/);
  assert.match(w, /watchlist\.ics/);
  assert.match(w, /data-suite-item/);
  const c = renderClaims(dossiers, claims, now);
  assert.match(c, /ميزان الادعاءات/);
  assert.match(c, /غير متحقق/);
  const im = renderImpact(dossiers, impacts, now);
  assert.match(im, /أثر فعلي/);
  assert.match(im, /أثر محتمل/);
  const dg = renderDigest(dossiers, now);
  assert.match(dg, /موجز الملفات/);
  assert.match(dg, /ملف الأسبوع/);
});

test("review queue is noindex and embeds dossier keywords", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  const html = renderReview(dossiers, now);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /reviewDossiers/);
  assert.match(html, /review\.js/);
  assert.match(html, /طابور مراجعة تحديثات الملفات/);
  for (const d of dossiers) {
    assert.ok(html.includes(d.slug));
    assert.ok(html.includes(d.keywords[0]));
  }
});

test("watchlist JSON and ICS keep dates and mark estimates", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  const watch = collectWatch(dossiers, now);
  const json = JSON.parse(renderWatchlistJson(watch, now));
  assert.ok(json.items.length >= 10);
  assert.ok(json.items.some((i) => i.timing === "dated" && i.date));
  const ics = renderIcs(watch, now);
  assert.match(ics, /^BEGIN:VCALENDAR/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /DTSTART;VALUE=DATE:\d{8}/);
  assert.match(ics, /\[تقديري\]/);
});

test("parseWhen distinguishes exact dates, windows and ongoing indicators", () => {
  assert.deepEqual(parseWhen("29 نوفمبر 2026", 2026), { timing: "dated", date: "2026-11-29", approximate: false });
  assert.equal(parseWhen("مطلع ديسمبر 2026", 2026).approximate, true);
  assert.equal(parseWhen("أسبوعياً", 2026).timing, "ongoing");
  assert.equal(parseWhen("غير محدد", 2026).timing, "undated");
  assert.equal(parseWhen("2027 وفق تقارير", 2026).date, "2027-01-01");
});

test("generated files on disk match the curated content", () => {
  const index = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8"));
  assert.equal(index.dossiers.length, dossiers.length);
  for (const d of dossiers) {
    const file = path.join(OUT, `${d.slug}.html`);
    assert.ok(fs.existsSync(file), `missing generated page ${d.slug}`);
    const html = fs.readFileSync(file, "utf8");
    assert.ok(html.includes(d.title));
    assert.ok(html.includes("https://al-ghaib.us.ci/dossier/"));
  }
  const rootSitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  assert.ok(rootSitemap.includes("DOSSIERS:START"));
  assert.ok(rootSitemap.includes("/dossier/"));
});

test("no unfinished placeholder text ships in a dossier", () => {
  for (const d of dossiers) {
    const blob = JSON.stringify(d);
    for (const bad of ["TODO", "TBD", "lorem ipsum", "undefined", "NaN"]) {
      assert.ok(!blob.includes(bad), `${d.slug} contains placeholder: ${bad}`);
    }
  }
});
