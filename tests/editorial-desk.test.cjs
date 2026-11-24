"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const B = require("../briefing-model.js");
const M = require("../market-model.js");
const W = require("../map-model.js");

const day = "2026-11-22", now = Date.parse("2026-11-23T02:00:00Z");
const article = (title, options={}) => ({
  title, source_name:"Publisher A", source_url:"https://publisher.example/story",
  published_at:day + "T23:59:59.999999Z", category:"world", ...options
});
test("briefing boundaries follow UTC and account return only accepts allowed completed days", () => {
  assert.equal(B.previousDay(new Date("2026-11-23T02:01:00+03:00")), "2026-11-21");
  assert.equal(B.windowOf("2026-02-29"), null);
  assert.equal(B.accountReturn("/daily-briefing.html?date="+day, now), "/daily-briefing.html?date="+day);
  for (const target of ["//external.example/daily-briefing.html", "/daily-briefing.html?date=2026-11-23", "/daily-briefing.html#token", "/daily-briefing.html?date=2026-11-22&token=x", "/account.html"]) {
    assert.equal(B.accountReturn(target, now), "");
  }
});
test("briefing private read never fires for guests and uses exact-date JWT read for sessions", async () => {
  const fake = async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/rest/v1/daily_news_briefings");
    assert.equal(parsed.searchParams.get("briefing_date"), "eq."+day);
    assert.equal(parsed.searchParams.get("limit"), "1");
    assert.equal(init.cache, "no-store");
    assert.equal(init.headers.Authorization, "Bearer local-test-session");
    return Response.json([{briefing_date: day}]);
  };
  assert.equal(await B.edition("", day, false, () => assert.fail("Guest table read")), null);
  assert.deepEqual(await B.edition("local-test-session", day, false, fake), {briefing_date:day});
  await assert.rejects(B.edition("expired", day, false, () => new Response("{}",{status:401})), {status:401});
});
test("public briefing uses the public date RPC, labels review and rejects disputes, aggregation and sponsorship", async () => {
  const rows = [
    article("الأَخبار المنشورة الأولى", {trust_needs_review:true}),
    article("الاخبار المنشورة الأولى", {trust_needs_review:true}),
    article("A distinct later section", {category:"economy",source_name:"Publisher B"}),
    article("An item from a different day", {published_at:"2026-11-23T00:00:00Z"}),
    article("Disputed public entry", {editorial_trust_status:"disputed"}),
    article("Conflicted public entry", {verification_conflict_count:1}),
    article("Retracted public entry", {verification_retraction_count:1}),
    article("A banner disguised as news", {content_type:"sponsored"}),
    article("A feed aggregator link", {source_url:"https://news.google.com/example"}),
    article("A non-web destination", {source_url:"javascript:void(0)"})
  ];
  const result=await B.publicEdition(day, async (url, opts) => {
    assert.match(url, /\/rpc\/public_home_news_recent_v3$/);
    assert.equal(opts.headers.Authorization, undefined);
    assert.equal(opts.credentials, "omit");
    assert.deepEqual(JSON.parse(opts.body), {p_limit:24,p_since:day+"T00:00:00.000Z",p_before:day+"T23:59:59.999999Z"});
    return Response.json(rows);
  });
  assert.deepEqual(result.map(x=>[x.title,x.needsReview]), [["A distinct later section",false],["الأَخبار المنشورة الأولى",true]]);
});
test("quotes validate timestamps, currency, sorting and Arabic search", () => {
  const basic={ok:true,symbol:"AAPL",labelAr:"أَبل",label:"Apple",price:110,currency:"USD",provider:"Provider",category:"stock",timestamp:now};
  const rows=M.quotes([basic,{...basic,symbol:"BTC",category:"crypto",timestamp:now-8e6,changePercent:2},{...basic,symbol:"BAD",price:0},{...basic,symbol:"FUTURE",timestamp:now+4e6}],now);
  assert.deepEqual(rows.map(row=>[row.symbol,row.freshness]),[["AAPL","dated"],["BTC","old"],["FUTURE","unknown"]]);
  assert.deepEqual(M.filter(rows,"stock","ابل","default").map(row=>row.symbol),["AAPL","FUTURE"]);
  assert.equal(M.filter(rows,"all","","down")[0].symbol,"BTC");
});
test("FX uses explicit as-of time rather than the relay timestamp or a guessed time zone", () => {
  const fields={ok:true,from:"USD",to:"SAR",category:"forex",currency:"SAR",price:3.75,provider:"Provider",timestamp:now};
  const quote=M.normalize({...fields,asOf:"2026-11-21 01:00:00",timeZone:"UTC"},now,true);
  assert.deepEqual([quote.symbol,quote.category,quote.timestamp,quote.freshness,quote.changePercent],["USD/SAR","fx",Date.parse("2026-11-21T01:00:00Z"),"old",null]);
  assert.equal(M.normalize({...fields,timeZone:"Asia/Riyadh"},now,true).timestamp,null);
  assert.equal(M.normalize({...fields,to:"JPY"},now,true),null);
});
test("country comparison uses one time/severity snapshot without inheriting the map country", () => {
  const entry=(id,country,published,severity,source)=>({id,countryCode:country,published,severity,rank:W.levels.indexOf(severity)+1,source_name:source,eventType:"diplomacy"});
  const rows=[entry("a","SAU",now-60,"critical","Publisher"),entry("b","SAU",now-120,"high"," PUBLISHER "),entry("c","JPN",now,"high","Another"),entry("d","JPN",now-8*3600000,"high","Old")];
  const filtered=W.select(rows,{...W.defaults,country:"SAU",hours:6},now);
  assert.equal(filtered.events.length,2);
  assert.deepEqual(W.countryStats(filtered.byCountry,"SAU"),{count:2,high:2,sources:1,top:"critical",latest:now-60,distribution:{low:0,guarded:0,elevated:0,high:1,critical:1}});
  assert.equal(W.countryStats(filtered.byCountry,"JPN").count,1);
  assert.equal(W.countryStats(filtered.byCountry,"EGY").latest,null);
});
