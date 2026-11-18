const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(require.resolve("../intelligence.js"), "utf8");

test("article Q&A is not presented as available before a grounded answer service exists", () => {
  assert.doesNotMatch(source, /intelAskForm|function wireAsk|function askBox/);
  assert.doesNotMatch(source, /answer\.innerHTML\s*=.*a\.title/);
  assert.match(source, /ميزة «اسأل الخبر» والإجابة الآلية الموثقة غير مفعّلتين/);
});

test("heuristic keyword matching is not labelled as AI analysis", () => {
  assert.doesNotMatch(source, /function analyze\(a\)/);
  assert.doesNotMatch(source, /زاوية \$\{type\}/);
  assert.match(source, /renderIntelligenceNotice/);
});

test("public modal does not query the private article change-log table", () => {
  assert.doesNotMatch(source, /article_change_log/);
  assert.doesNotMatch(source, /loadChangeLog/);
  assert.match(source, /صفحة الخبر المستقلة/);
  assert.match(source, /getElementById|querySelector/);
});

test("legacy source-count statuses cannot imply multi-source human confirmation", () => {
  const start = source.indexOf("const reliability");
  const end = source.indexOf("function renderIntelligenceNotice", start);
  assert.ok(start >= 0 && end > start);
  const reliability = source.slice(start, end);
  assert.match(reliability, /disputed/);
  assert.match(reliability, /لم يُسجل تحقق بشري/);
  assert.doesNotMatch(reliability, /مؤكد بثلاثة مصادر|مؤكد بمصدرين|تأكيد رسمي \+ مصادر مستقلة/);
});

test("intelligence dashboard counts only the actual editorial review states", () => {
  assert.match(source, /counts\["محل خلاف"\]/);
  assert.match(source, /counts\["لم يُسجل تحقق بشري"\]/);
  assert.doesNotMatch(source, /counts\["مؤكد بمصدرين"\]|counts\["تأكيد رسمي \+ مصادر مستقلة"\]/);
});
