const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

// LCP on the home page is a news card, so its paint is gated by the public news RPC. These tests
// hold the two things that decide how early that card can appear: the read starts during head
// parsing, and the grid reserves its own space while it is empty.
test("the news read starts during head parsing, before any deferred script", () => {
  const html = read("index.html");
  const early = html.indexOf("__wlEarlyFeed");
  assert.ok(early > -1, "index.html must start the feed read itself");
  assert.ok(early < html.indexOf("script.js?v="), "the early read must precede script.js");
  const snippet = html.slice(early, early + 1600);
  assert.match(snippet, /public_home_news_recent_v3/);
  assert.match(snippet, /p_limit: 24/);
  assert.match(snippet, /AbortSignal\.timeout/);
});

test("script.js adopts that response instead of issuing a duplicate request", () => {
  const js = read("script.js");
  assert.match(js, /const early=firstLoad&&window\.__wlEarlyFeed/);
  assert.match(js, /early\.claimed=true/);
  assert.match(js, /mainRows=await \(early\?early\.promise:getPublicNewsRows\(params\)\)/);
  // The retry path must still be able to recover when the early read failed.
  assert.match(js, /mainRows=await getPublicNewsRows\(params,\{timeout:3000\}\)/);
});

test("the arrival timestamp of the early read is reused so paging stays consistent", () => {
  const js = read("script.js");
  assert.match(js, /const now=early\?early\.before:new Date\(\)\.toISOString\(\)/);
});

test("the empty grid reserves space and hides placeholders from assistive tech", () => {
  const html = read("index.html");
  const at = html.indexOf('<div id="newsGrid"');
  const grid = html.slice(at, at + 3000);
  assert.match(grid, /aria-busy="true"/);
  assert.equal((grid.match(/class="skeleton-card"/g) || []).length, 6);
  assert.equal((grid.match(/aria-hidden="true"/g) || []).length, 6, "placeholders must be hidden from screen readers");
  assert.ok(read("home.bundle.css").includes(".skeleton-card .sk-img{aspect-ratio:16/10}"), "placeholder image must reserve its box");
});
