"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {normalize, select} = require("../map-model.js");
const now = Date.parse("2026-11-22T08:45:00Z"), hour = 3600000;
const report = (id, changes = {}) => ({
  id, title:`Report ${id}`, published_at:new Date(now - 15 * 60000).toISOString(), ai_country_code:"SAU",
  ai_event_type:"diplomacy", ai_risk_level:"high", ai_risk_score:75, ...changes
});
const base = {hours:24, country:"all", severity:"all", type:"all"};

test("severity tier wins over disagreements with numeric scores, then scores break ties", () => {
  const rows = normalize([
    report("low", {ai_risk_level:"low", ai_risk_score:99}), report("critical", {ai_risk_level:"critical", ai_risk_score:4}),
    report("invalid-score", {ai_risk_score:101}), report("valid-zero", {ai_risk_score:0}),
    report("foreign", {ai_country_code:"jpn", country:"Saudi Arabia"})
  ], now);
  const view = select(rows, base, now);
  assert.deepEqual(view.byCountry.get("SAU").map(a => a.id), ["critical", "valid-zero", "invalid-score", "low"]);
  assert.equal(view.byCountry.get("JPN")[0].id, "foreign");
  assert.equal(view.countries, 2);
  assert.equal(view.high, 4);
});

test("malformed, future, duplicate and unclassified rows are not shown; never substitute publisher geography", () => {
  const rows = normalize([
    null, report("duplicate", {ai_country_code:"EGY", ai_event_type:"nonsense"}), report("duplicate"),
    report("publisher-only", {ai_country_code:null, country:"SAU"}), report("pseudo", {ai_country_code:"ZZZ"}),
    report("unknown", {ai_risk_level:"unknown"}), report("future", {published_at:new Date(now + hour).toISOString()}),
    report("stale", {published_at:new Date(now - 25 * hour).toISOString()}), report("invalid", {published_at:"yesterday"})
  ], now);
  assert.deepEqual(rows.map(a => [a.id, a.countryCode, a.eventType]), [["duplicate", "EGY", null]]);
  assert.throws(() => normalize({results:[]}, now), /Unexpected monitor feed/);
  assert.throws(() => normalize(Array(1001).fill(null), now), /Unexpected monitor feed/);
});

test("the report list, trend counts and map use the same period, event type and severity filters", () => {
  const rows = normalize([
    report("now"), report("another", {ai_country_code:"GBR"}), report("type", {ai_event_type:"legal"}),
    report("level", {ai_risk_level:"critical"}), report("old", {published_at:new Date(now - 3 * hour).toISOString()})
  ], now);
  const filter = {...base, hours:1, country:"SAU", severity:"high", type:"diplomacy"};
  const view = select(rows, filter, now);
  assert.deepEqual(view.events.map(a => a.id), ["now"]);
  assert.deepEqual([...view.byCountry].map(([key, events]) => [key, events.map(a => a.id)]), [["GBR", ["another"]], ["SAU", ["now"]]]);
  assert.equal(view.countries, 1);
  assert.equal(view.high, 1);
  assert.equal(select(rows, {...filter, country:"JPN"}, now).events.length, 0);
  assert.equal(select(rows, filter, now + hour).events.length, 0);
});
