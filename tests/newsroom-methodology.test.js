const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync(require.resolve("../newsroom-page.js"), "utf8");

function section(startMarker, endMarker) {
  const start = page.indexOf(startMarker);
  const end = page.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "expected newsroom section markers");
  return page.slice(start, end);
}

test("context pages disclose that live headline matching is keyword-based", () => {
  const render = section("function renderContext()", "function openContext");
  const detail = section("function openContext", "/* ---------- Balance ---------- */");
  assert.match(render, /مطابقة العناوين المباشرة تتم بالكلمات المفتاحية/);
  assert.match(detail, /مطابقة العناوين المباشرة لا تثبت ارتباطها بالحدث/);
});

test("context scenarios do not display unsupported numeric probabilities", () => {
  const detail = section("function openContext", "/* ---------- Balance ---------- */");
  assert.match(detail, /سيناريوهات محتملة \(نوعية\)/);
  assert.match(detail, /ليست نسب احتمالات إحصائية/);
  assert.doesNotMatch(detail, /esc\(s\[1\]\)|nr-bar|s\[1\].*%/);
});

test("narrative balance labels publisher names and discloses heuristic clustering limits", () => {
  const balance = section("function renderBalance()", "/* ---------- Impact ---------- */");
  assert.match(balance, /جهات نشر/);
  assert.match(balance, /تجميع آلي أولي لعناوين متشابهة زمنياً ولغوياً/);
  assert.match(balance, /لا يثبت استقلالها/);
  assert.match(balance, /لا يقيس استقلال المصادر أو دقة الروايات/);
  assert.doesNotMatch(balance, /مؤشر التوازن/);
});

test("impact pages label the displayed chains as editorial reference models", () => {
  const impact = section("function renderImpact()", "/* ---------- Promises ---------- */");
  const detail = section("function openImpact", "/* ---------- Promises ---------- */");
  assert.match(impact, /نماذج مرجعية تحريرية مكتوبة مسبقاً/);
  assert.match(detail, /سلسلة أثر مرجعية عامة/);
  assert.match(detail, /ليست نتيجة تحليل خاص بهذا الخبر/);
});
