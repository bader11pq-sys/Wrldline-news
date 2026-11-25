import test from "node:test";
import assert from "node:assert/strict";
import { scanSource, isSafeExpr } from "../scripts/scan-html-sinks.mjs";

test("flags raw API field interpolated into innerHTML", () => {
  const f = scanSource("el.innerHTML = `<h3>${article.title}</h3>`;");
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].unsafe, ["article.title"]);
});
test("flags raw field in string concatenation", () => {
  const f = scanSource("el.innerHTML = '<a href=\"' + item.url + '\">x</a>';");
  assert.equal(f.length, 1);
});
test("accepts escaped fields and constants", () => {
  assert.equal(scanSource("el.innerHTML = `<h3>${esc(a.title)}</h3><b>${Number(a.n)}</b>`;").length, 0);
  assert.equal(scanSource("el.innerHTML = '<b>' + escapeHTML(a.title) + '</b>';").length, 0);
  assert.equal(scanSource("el.innerHTML = '';").length, 0);
});
test("flags insertAdjacentHTML and outerHTML", () => {
  assert.equal(scanSource("el.insertAdjacentHTML('beforeend', `<p>${x.note}</p>`);").length, 1);
  assert.equal(scanSource("el.outerHTML = `<p>${x.note}</p>`;").length, 1);
});
test("isSafeExpr basics", () => {
  assert.ok(isSafeExpr("esc(x)"));
  assert.ok(!isSafeExpr("x.title"));
});
