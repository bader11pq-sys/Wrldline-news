"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const source = read("supabase/functions/newsdata-integration/index.ts");
const { providerTopic, providerSourceCountry, providerContentType, isPromotion, acceptedTopic, eventType, anchoredEventCountry } =
  require("../supabase/functions/_shared/editorial-metadata.ts");
const { EVENT_TYPES } = require("../supabase/functions/_shared/editorial-metadata.ts");
const { ISO_ALPHA3 } = require("../supabase/functions/_shared/iso-alpha3.ts");
const display = require("../editorial-display.js");

test("public rendering matches the full Edge ISO list and does not use legacy publisher country", () => {
  assert.equal(ISO_ALPHA3.size,249);
  for(const [alpha3,alpha2] of ISO_ALPHA3) assert.equal(display.codeOf(alpha3),alpha2);
  for(const key of EVENT_TYPES) {
    assert.equal(display.eventType(key), key);
    assert.notEqual(display.eventTypeLabel(key,"ar"),display.eventTypeLabel(key,"en"));
  }
  assert.equal(display.eventCountry({country:"yemen",event_country:null}),null);
  assert.equal(display.eventCountry({country:"yemen",event_country:"بولندا"}),"بولندا");
  assert.equal(display.countryName("POL","en"),"Poland");
  assert.equal(display.countryName("POL","ar"),"بولندا");
  assert.equal(display.eventType("constructor"),null);
});

test("NewsData ingestion never marks an article classified before AI analysis", () => {
  assert.doesNotMatch(source, /ai_classification_status\s*:\s*["']classified["']/);
  assert.match(source, /editorial_status:promotion\?"review":"published"/);
  assert.match(source, /on_conflict=url/);
  assert.match(source, /resolution=ignore-duplicates/);
  assert.match(source, /source_country:providerSourceCountry\(item.country\),country:null,event_country:null/);
  assert.match(source, /is_breaking:false/);
});

test("provider tags separate subject from coverage and abstain on conflicts", () => {
  assert.equal(providerTopic(["top","world","science"]), "science");
  assert.equal(providerTopic(["environment","environment"]), "environment");
  assert.equal(providerTopic(["technology"]), "tech");
  assert.equal(providerTopic(["domestic","other","top"]), "uncategorized");
  assert.equal(providerTopic(["politics","crime"]), "uncategorized");
  assert.equal(providerSourceCountry(["yemen","Yemen"]), "yemen");
  assert.equal(providerSourceCountry(["yemen","poland"]), null);
  assert.equal(providerSourceCountry("international"), null);
  assert.equal(providerSourceCountry("not-a-country 42"), null);
});

test("opinion, analysis, breaking and commercial signals are independent", () => {
  assert.equal(providerContentType("opinion","A headline"), "opinion");
  assert.equal(providerContentType("news","تحليل: أثر القرار"), "analysis");
  assert.equal(providerContentType("news","تحليل الانتخابات من الهيئة"), "news");
  assert.equal(isPromotion("تسوق الآن باستخدام كود الخصم"), true);
  assert.equal(isPromotion("تقرير عن التجارة الرقمية"), false);
});

test("section and event type use independent bounded taxonomies", () => {
  assert.equal(eventType("election"), "election");
  assert.equal(eventType("انتخابات"), null);
  assert.equal(acceptedTopic("world", 0.9, "local"), null);
  assert.equal(acceptedTopic("world", 0.9, "cross-border"), "world");
  assert.equal(acceptedTopic("science", 0.71, "national"), null);
  assert.equal(acceptedTopic("science", 0.72, "national"), "science");
});

test("event geography requires an ISO country name in a sourced, single-country quote", () => {
  const title = "الناتو يؤكد: سندافع عن كل شبر من أراضي بولندا";
  assert.deepEqual(anchoredEventCountry("pol","عن كل شبر من أراضي بولندا",title,0.91), {code:"POL",country:"بولندا"});
  assert.equal(anchoredEventCountry("YEM","عن كل شبر من أراضي بولندا",title,0.99), null);
  assert.equal(anchoredEventCountry("ZZZ","عن كل شبر من أراضي بولندا",title,0.99), null);
  assert.equal(anchoredEventCountry("POL","وقعت اشتباكات في بولندا",title,0.99), null);
  assert.equal(anchoredEventCountry("POL","أراضي بولندا",title,0.79), null);
  assert.equal(anchoredEventCountry("POL","أراضي بولندا",title,"0.95"), null);
  assert.equal(anchoredEventCountry("POL","بولندا وألمانيا", "بولندا وألمانيا",0.95), null);
  assert.equal(anchoredEventCountry("POL","Poland and Germany","Poland and Germany sign an agreement",0.95), null);
  assert.equal(anchoredEventCountry("SSD","South Sudan held elections","South Sudan held elections",0.95)?.code,"SSD");
});

test("legacy NewsData rows falsely marked classified are expired, not reprocessed after one hour", () => {
  const migration = read("supabase/migrations/20261121143000_expire_mislabelled_newsdata_imports.sql");
  assert.match(migration, /newsdata_article_id IS NOT NULL/);
  assert.match(migration, /received_at >= now\(\) - interval '48 hours'/);
  assert.match(migration, /published_at < now\(\) - interval '1 hour'/);
  assert.match(migration, /ai_classification_status = 'classified'/);
  assert.match(migration, /ai_country_code IS NULL/);
  assert.match(migration, /ai_confidence IS NULL/);
  assert.match(migration, /ai_summary IS NULL/);
  assert.match(migration, /SET\s+ai_classification_status = 'expired'/);
});
