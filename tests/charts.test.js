const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const C = require("../charts.js");
const doc = new JSDOM("<!doctype html><body></body>").window.document;

test("niceScale returns bounds that contain the data", () => {
  const s = C.niceScale(-1.3, 7.2);
  assert.ok(s.min <= -1.3 && s.max >= 7.2 && s.step > 0);
  assert.deepEqual(C.niceScale(5, 5).min < 5, true);
});
test("segments break at missing years instead of bridging them", () => {
  const runs = C.segments([{ x: 2000, y: 1 }, { x: 2001, y: 2 }, { x: 2004, y: 3 }]);
  assert.equal(runs.length, 2);
  assert.equal(runs[1][0].x, 2004);
});
test("lineChart is accessible, drops non-finite values and exposes a data table", () => {
  const fig = C.lineChart(doc, { title: "GDP growth", description: "desc", series: [{ name: "SAU", points: [{ x: 2020, y: -3.6 }, { x: 2021, y: 5.1 }, { x: 2022, y: NaN }, { x: 2023, y: null }] }], formatY: (v) => v + "%" });
  const svg = fig.querySelector("svg");
  assert.equal(svg.getAttribute("role"), "img");
  assert.ok(svg.querySelector("title").textContent === "GDP growth");
  assert.equal(fig.querySelectorAll("table tr").length, 3); // header + 2 valid years
  assert.ok(svg.querySelector("path"));
});
test("empty series renders an explicit empty state, not an empty chart", () => {
  const fig = C.lineChart(doc, { title: "t", series: [{ name: "a", points: [] }], labels: { empty: "No data published" } });
  assert.equal(fig.querySelector(".wp-empty").textContent, "No data published");
  assert.equal(fig.querySelector("svg"), null);
});
test("barChart marks missing values as no data and negatives distinctly", () => {
  const ul = C.barChart(doc, { title: "x", items: [{ label: "A", value: 4, year: 2024 }, { label: "B", value: -2, year: 2024 }, { label: "C", value: null }], formatValue: (v) => String(v), labels: { noData: "n/a" } });
  assert.equal(ul.querySelectorAll("li").length, 3);
  assert.ok(ul.querySelector(".is-negative"));
  assert.match(ul.lastChild.textContent, /n\/a/);
});
