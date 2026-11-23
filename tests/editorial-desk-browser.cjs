"use strict";
const assert = require("node:assert/strict");

async function run(browser, base, shots) {
  const day = new Date(Date.now()-86400000).toISOString().slice(0,10);
  let token = null, privateCalls = 0, publicCalls = 0, mode = "healthy", trackerCalls = 0;
  const context = await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:"block",reducedMotion:"reduce"});
  const sdk = () => `window.supabase={createClient:()=>({auth:{
    getSession:async()=>({data:{session:${JSON.stringify(token ? {access_token:token} : null)}}}),
    onAuthStateChange:(callback)=>{window.testAuthChange=callback;return{data:{subscription:{unsubscribe(){}}}}}
    }})};`;
  const publisher = {source_name:"Test Publisher", source_url:"https://example.com/story", category:"world"};
  const iso = minutes => new Date(Date.now()-minutes*60000).toISOString();
  const cors = {"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET, POST, OPTIONS"};
  await context.route("**/*", route => {
    const req=route.request(), url=new URL(req.url());
    const json=(value,status=200)=>route.fulfill({json:value,status,headers:cors});
    if(url.pathname.endsWith("/vendor/supabase-2.119.0.js") && req.frame().url().includes("daily-briefing")) return route.fulfill({contentType:"application/javascript",body:sdk()});
    if(url.origin===new URL(base).origin) return route.continue();
    if(req.method()==="OPTIONS") return route.fulfill({status:204,headers:cors});
    if(url.pathname.endsWith("/daily_news_briefings")){
      privateCalls++;
      assert.match(req.headers().authorization || "", /^Bearer /);
      if(mode==="expired") return json({error:"expired"},401);
      return json([{briefing_date:day,executive_summary:"نسخة كاملة في الاختبار",generated_at:`${day}T23:00:00Z`,top_developments:[]}]);
    }
    if(url.pathname.endsWith("/public_home_news_recent_v3")){
      publicCalls++;
      const start=req.postDataJSON()?.p_since;
      if(!start) return json([]);
      return json([{...publisher,title:"تغطية عامة للاختبار",published_at:start,trust_needs_review:true}]);
    }
    if(url.pathname.endsWith("/market-data")){
      if(mode==="market-offline") return json({},503);
      if(url.searchParams.get("mode")==="fx") return json({quote:{ok:true,from:"USD",to:"SAR",price:3.75,provider:"Test Feed",currency:"SAR",timestamp:Date.now(),asOf:iso(30).slice(0,19).replace("T"," "),timeZone:"UTC"}});
      return json({quotes:["AAPL","SPY","BTC"].map((symbol,i)=>({ok:true,symbol,price:i+10,currency:"USD",provider:"Test Feed",category:["stock","etf","crypto"][i],timestamp:Date.now()-i*1000}))});
    }
    if(url.pathname.endsWith("/public_world_monitor_feed")) return json([
      {id:"report-one",title:"Report one",ai_country_code:"SAU",ai_risk_level:"critical",published_at:iso(10),source_name:"Publisher"},
      {id:"report-two",title:"Report two",ai_country_code:"JPN",ai_risk_level:"low",published_at:iso(90),source_name:"Publisher"}
    ]);
    if(url.hostname==="s3.tradingview.com"){trackerCalls++;return route.abort();}
    if(url.hostname.endsWith(".supabase.co")){
      if(req.postDataJSON?.() && req.postDataJSON().action==="config") return json({email_ready:false});
      return json([]);
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    localStorage.setItem("wrldline:theme","light");
    localStorage.setItem("wrldline:language","ar");
  });
  const page = await context.newPage(), errors=[];
  page.on("pageerror", error=>errors.push(error.message));
  page.setDefaultTimeout(10000);
  const go = async path => {const response=await page.goto(base+path,{waitUntil:"domcontentloaded"});assert.equal(response.status(),200,path);};
  const visible = selector => page.locator(selector).waitFor({state:"visible"});
  const fit = async () => {
    await page.waitForFunction(()=>[...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter(link=>new URL(link.href).origin===location.origin).every(link=>Boolean(link.sheet)));
    await page.evaluate(()=>document.fonts.ready.then(()=>true));
    const dimensions=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);
    assert.ok(dimensions[0]<=dimensions[1]+1,`Horizontal overflow ${dimensions.join("/")} at ${page.url()}`);
  };
  const screenshot = async name => { if(shots) await page.screenshot({path:`${shots}/${name}.png`,animations:"disabled"}); };
  try {
    await go("/daily-briefing.html");
    await page.locator(".wrldline-consent [data-choice=denied]").click();
    await visible("#publicBriefing .briefing-story");
    assert.equal(privateCalls,0);
    assert.equal(await page.locator("#briefingStats").isVisible(),false);
    await visible("#briefingSignIn");
    await screenshot("briefing-public");
    // Exact-day input change and a guest retry.
    await page.locator("#briefingDate").fill("2026-11-19");
    await page.waitForURL("**/daily-briefing.html?date=2026-11-19");
    await visible("#publicBriefing .briefing-story");
    assert.match(await page.locator("#briefingSignIn").getAttribute("href"),/date%3D2026-11-19/);
    await page.locator("#latestBriefing").click();
    await page.waitForURL(/\/daily-briefing\.html$/);
    await visible("#publicBriefing .briefing-story");
    await page.locator("#retryBriefing").click();
    assert.ok(publicCalls>=3);

    token="local-test-token";
    await go("/daily-briefing.html");
    await visible("#executiveSummary");
    assert.match(await page.locator("#executiveSummary").innerText(),/نسخة كاملة/);
    await screenshot("briefing-account");
    // Confirm that logout replaces protected content with the public view.
    await page.evaluate(()=>window.testAuthChange("SIGNED_OUT",null));
    await visible("#publicBriefing .briefing-story");
    assert.equal(await page.locator("#executiveSummary").textContent(),"");
    mode="expired";
    await go("/daily-briefing.html");
    await visible("#publicBriefing .briefing-story");
    await visible("#briefingSignIn");
    assert.ok(privateCalls>=2);
    mode="healthy";

    await go("/analysis.html");
    assert.equal(await page.locator(".desk-list article").count(),4);
    await fit();await screenshot("analysis-desktop");
    await page.locator(".desk-routes a[href='context.html']").click();
    await visible("[data-ctx='ai-governance']");
    await page.locator("#ctxSearch").fill("الذكاء الاصطناعي");
    await visible("[data-ctx='ai-governance']");
    await page.locator("[data-ctx='ai-governance']").press("Enter");
    await visible(".desk-lens");
    assert.ok(await page.locator(".desk-lens a").count()>=3);
    await screenshot("context-lens");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#nrDetail").isVisible(),false);
    await page.goto(base+"/context.html#trade-fragmentation");
    await visible(".desk-lens");
    for(const route of ["balance","impact","explainers","mirror","promises"]){
      await go(`/${route}.html`);await visible(".desk-routes");await fit();
    }

    await go("/markets.html?lang=en");
    await visible("[data-compare='AAPL']");
    assert.equal(await page.locator("html").getAttribute("dir"),"ltr");
    assert.equal(trackerCalls,0);
    await page.locator("[data-compare='AAPL']").click();
    await page.locator("[data-compare='SPY']").click();
    assert.equal(await page.locator("#marketComparison article").count(),2);
    await page.locator("#marketCategory").selectOption("stock");
    assert.equal(await page.locator("#directMarketGrid article").count(),1);
    await page.locator("#marketQuery").fill("not-listed");
    assert.equal(await page.locator("#directMarketGrid article").count(),0);
    await page.locator("#marketQuery").fill("");
    await page.locator("#marketCategory").selectOption("all");
    await page.locator("#marketSort").selectOption("newest");
    await visible("#directFxGrid article");
    await screenshot("markets-comparison");
    mode="market-offline";
    await page.locator("#marketRefresh").click();
    await page.locator("#marketFeedStatus").filter({hasText:"Refresh failed"}).waitFor();
    assert.equal(await page.locator("#directMarketGrid article").count(),3);
    await page.locator("#marketClear").click();
    assert.equal(await page.locator("#marketComparison article").count(),0);
    await page.locator("[data-market-widget='ticker']").click();
    await page.locator("#tickerWidget").filter({hasText:"Chart unavailable"}).waitFor();
    mode="healthy";

    await go("/map.html?lang=en");
    await page.locator("#monitorCompareFirst option[value='SAU']").waitFor({state:"attached"});
    await page.locator("#monitorCompareFirst").selectOption("SAU");
    await page.locator("#monitorCompareSecond").selectOption("JPN");
    assert.deepEqual(await page.locator("#monitorCompareResult article h3").allTextContents(),["Saudi Arabia","Japan"]);
    await page.locator("#countryFilter").selectOption("SAU");
    await page.locator("#timeFilter").selectOption("1");
    assert.match(await page.locator("#monitorCompareResult article").last().innerText(),/No matching signal/);
    await page.locator("#monitorCompareTitle").scrollIntoViewIfNeeded();
    await screenshot("monitor-compare");

    await go("/newsletter.html");
    await page.locator("#nlEmail").fill("not-sent@example.com");
    await page.locator("#nlCadence").selectOption("weekly");
    await page.locator("[name='topics'][value='economy']").check();
    await page.locator("[name='countries'][value='السعودية']").check();
    assert.match(await page.locator("#dispatchPreview").innerText(),/أسبوعيًا.*اقتصاد.*السعودية/);
    assert.doesNotMatch(await page.locator("#dispatchPreview").innerText(),/not-sent/);
    await page.locator("#editions details").nth(1).locator("summary").press("Enter");
    await visible("#editions details:nth-of-type(2)[open] a[href='impact.html#fed-rates']");
    await screenshot("newsletter-desktop");

    await go("/history.html");
    assert.equal(await page.locator(".rp-card").count(),4);
    await page.locator("#reading-guides a[href='reading.html#suez']").click();
    await page.waitForURL("**/reading.html#suez");
    await visible("#suez h2");
    for(const name of ["hormuz-closure-2026","bab-al-mandab-2026","opec-plus-december-2026","qatarenergy-lng-2026"]){
      await go(`/dossier/${name}.html`);await visible("#assessment");
    }
    await page.setViewportSize({width:375,height:812});
    for(const route of ["/","/analysis.html","/daily-briefing.html","/context.html","/markets.html","/map.html","/newsletter.html","/history.html"]){
      await go(route);await fit();
      if(route==="/analysis.html" || route==="/newsletter.html" || route==="/markets.html")await screenshot(`${route.slice(1,-5)}-mobile`);
    }
    assert.deepEqual(errors,[]);
    console.log("Editorial browser checks passed: guest, account, expired and logout; desk navigation, markets and fallback; country comparison, newsletter, historical links, four dossiers, and 375px layout.");
  } finally {
    await context.close();
  }
}
module.exports=run;
if(require.main===module){
  (async()=>{
    const browser=await require("playwright").chromium.launch({channel:"chromium",headless:true});
    try{await run(browser,process.env.WRLDLINE_TEST_SITE || "http://127.0.0.1:4173",process.env.WRLDLINE_TEST_SHOTS);}
    finally{await browser.close();}
  })().catch(error=>{console.error(error);process.exitCode=1;});
}
