"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalize, search, filter, related, dedupe, isPromotionalHeadline } = require("../reader-discovery");
const { eventCountryCode } = require("../editorial-display");

const story = (id, fields = {}) => ({
  id, title: "عنوان الخبر " + id, cat: "economy", country: "السعودية", eventCountryCode:"SAU", src: "وكالة محلية",
  published_at: "2026-11-22T04:00:00Z", ...fields,
});

test("Arabic search accepts alternate alifs, diacritics, tatweel, punctuation and regional digits", () => {
  assert.equal(normalize("إِقْتِصَادُ ـ السُّعوديّة ٢٠٢٦، ۹"), "اقتصاد السعودية 2026 9");
  assert.equal(normalize("À propos\u200f — GULF"), "a propos gulf");
  const row = story("a", { title: "إِقْتِصاد الخليج في ٢٠٢٦" });
  assert.deepEqual(search([row], "۲۰۲۶ الخليج اقتصاد").matches, [row]);
  assert.equal(search([row], "الخليج الرياض").count, 0);
  assert.equal(search([row], "… —").count, 0);
});

test("search matches title, translation, country, category and publisher with headline-first ranking", () => {
  const first = story("first", { title: "تحليل أسواق الخليج", originalTitle: "Gulf oil markets", src: "Reuters" });
  const second = story("second", { title: "تقرير دولي", summary: "Gulf oil markets", src: "Reuters" });
  const third = story("third", { title: "النّفط الخليجي", translationTitle: "A look at Gulf oil prices", country: "قطر" });
  assert.deepEqual(search([second, first, third], "reuters gulf oil").matches, [first, second]);
  assert.deepEqual(search([first, second, third], "قطر prices").matches, [third]);
  assert.deepEqual(search([first], "طاقة السعودية", () => ["طاقة"]).matches, [first]);
  assert.equal(search([first, second], "gulf", undefined, 1).count, 2);
});

test("all matching stories survive filtering even when fewer than four remain", () => {
  const older = story("older");
  const newer = story("newer", { title: "News first", published_at: "2026-11-22T05:00:00Z" });
  const elsewhere = story("elsewhere", { country: "قطر", eventCountryCode:"QAT" });
  const otherDesk = story("other", { cat: "tech" });
  const supplemental = story("extra", { isNewsDataOnly: true });
  const rows = [older, newer, elsewhere, otherDesk, supplemental];
  const options = { category: "economy", country: "SAU", sort: "newest", followOnly: false, follows: { category: [], country: [] } };
  assert.deepEqual(filter(rows, options).map(x => x.id), ["newer", "older"]);
  assert.deepEqual(filter(rows, { ...options, sort: "oldest" }).map(x => x.id), ["older", "newer"]);
  assert.deepEqual(filter(rows, { ...options, followOnly: true }), []);
  assert.equal(rows.length, 5);
});

test("deduplication preserves distinct Arabic titles, preferring the newest copy", () => {
  const old = story("old", { title: "إعلان نتائج الاقتصاد" });
  const latest = story("latest", { title: "إِعلان نتائجِ الاقتصاد", published_at: "2026-11-22T05:00:00Z" });
  const other = story("other", { title: "أسعار الطاقة" });
  const repeatedId = story("other", { title: "نسخة أقدم", published_at: "2026-11-22T02:00:00Z" });
  assert.deepEqual(dedupe([old, latest, other, repeatedId]).map(a => a.id), ["latest", "other"]);
});

test("explicit promotional title patterns do not flag ordinary news headlines", () => {
  assert.equal(isPromotionalHeadline("Extended Kalshi Promo Code: get a trading bonus"), true);
  assert.equal(isPromotionalHeadline("كود الخصم اليوم"), true);
  assert.equal(isPromotionalHeadline("إعلان عقوبات على منصات المراهنات"), false);
  assert.equal(isPromotionalHeadline("Market regulator announces new code of conduct"), false);
});

test("event-country filtering recognizes localized names and never falls back to publisher or an AI mismatch", () => {
  for (const event_country of ["المَمْلَكَةُ العَرَبِيَّةُ السُّعُودِيَّة", "Saudi Arabia", "SAU", "SA"]) {
    assert.equal(eventCountryCode({event_country, ai_country_code:"JPN"}), "SAU");
  }
  for (const event_country of ["أوروبا · بحر البلطيق", "International", "", null, "EU"]) {
    assert.equal(eventCountryCode({event_country, country:"السعودية", ai_country_code:"SAU"}), null);
  }
  const rows=[
    story("analysis", {eventCountryCode:"SAU",contentType:"analysis"}),
    story("news", {eventCountryCode:"SAU",contentType:"news"}),
    story("opinion", {eventCountryCode:"SAU",contentType:"opinion"}),
    story("regional", {country:"الخليج",eventCountryCode:null,aiCountryCode:"SAU",contentType:"analysis"}),
    story("publisher-only", {country:"SAU",eventCountryCode:null,contentType:"analysis"}),
    story("other", {eventCountryCode:"JPN",contentType:"analysis"})
  ];
  assert.deepEqual(filter(rows,{category:"economy",country:"SAU",format:"analysis",sort:"newest"}).map(row=>row.id),["analysis"]);
});

test("related coverage prioritizes a shared topic and event country without implying all articles cover the same event", () => {
  const current = story("a",{eventCountryCode:"SAU",sourceURL:"https://publisher.test/story",cat:"economy"});
  const rows = [
    current,
    story("country",{eventCountryCode:"SAU",cat:"politics",published_at:"2026-11-22T06:00:00Z"}),
    story("both",{eventCountryCode:"SAU"}),
    story("section",{eventCountryCode:"QAT",published_at:"2026-11-22T05:00:00Z"}),
    story("both-duplicate",{eventCountryCode:"SAU",title:current.title}),
    story("same-source-url",{eventCountryCode:"SAU",sourceURL:current.sourceURL}),
    story("sponsored",{eventCountryCode:"SAU",contentType:"sponsored"}),
    story("irrelevant",{eventCountryCode:"CHN",cat:"sports"})
  ];
  assert.deepEqual(related(rows,current).map(row=>row.id), ["both","country","section"]);
  assert.deepEqual(related(rows,story("unclassified",{cat:"uncategorized",eventCountryCode:null})), []);
});
