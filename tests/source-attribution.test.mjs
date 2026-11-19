import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../newsroom.js", import.meta.url), "utf8");
const context = { window: { WL_NEWSROOM: {} }, document: {} };
vm.runInNewContext(source, context, { filename: "newsroom.js" });
const newsroom = context.window.WLNR;

test("missing source is disclosed instead of invented", () => {
  assert.equal(newsroom.sourceName({}), "المصدر غير متاح");
  assert.match(newsroom.sourceLink({}), /source-missing/);
  assert.match(newsroom.sourceLink({}), /رابط المصدر غير متوفر/);
});

test("article cards expose source publication time accessibly", () => {
  const publishedAt = "2026-11-19T08:00:00.000Z";
  const html = newsroom.articleCard({ title: "عنوان خبر صالح للاختبار", published_at: publishedAt });
  assert.match(html, /class="read-time"/);
  assert.match(html, /datetime="2026-11-19T08:00:00.000Z"/);
  assert.match(html, /aria-label="وقت نشر المصدر:/);
  assert.match(html, /وقت نشر المصدر/);
  assert.match(html, /المصدر غير متاح/);
});
