const test = require("node:test");
const assert = require("node:assert/strict");
const { parseArticle, articlePath, https } = require("../office-edition.js");

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const record = { id, demo: false, status: "published", title: "مادة للاختبار", topic: "سياسة", summary: "ملخص",
  eventDate: "2026-11-20", publishedAt: "2026-11-24T10:00:00Z", body: ["فقرة"], facts: ["معلومة"], developing: [],
  sources: [{ publisher: "ألف", url: "https://a.example/item" }, { publisher: "باء", url: "https://b.example/item" }],
  image: `/public/articles/${id}/cover` };

test("accepts an approved live Arabic article, with a safe link and first-party cover", () => {
  const parsed = parseArticle(record);
  assert.equal(parsed.title, record.title);
  assert.equal(parsed.image, `/ai-office/api/public/articles/${id}/cover`);
  assert.equal(articlePath(id), `office-edition.html?id=${id}`);
});

test("rejects demo, unapproved, malformed, and incomplete articles", () => {
  for (const patch of [{ demo: true }, { demo: null }, { status: "review" }, { status: "rejected" }, { status: undefined },
    { id: "../../admin.html" }, { topic: "Politics" }, { facts: [] }, { body: [] }, { eventDate: null }, { publishedAt: "not a date" },
    { sources: [record.sources[0]] }, { sources: [record.sources[0], { ...record.sources[1], url: "javascript:alert(1)" }] }]) {
    assert.equal(parseArticle({ ...record, ...patch }), null, JSON.stringify(patch));
  }
});

test("treats hostile HTML as plain text and refuses external artwork and unsafe URLs", () => {
  const title = "<img src=x onerror=alert(1)>";
  const parsed = parseArticle({ ...record, title, image: "https://unknown.example/image" });
  assert.equal(parsed.title, title);
  assert.equal(parsed.image, null);
  for (const url of ["http://example.org", "javascript:alert(1)", "https://x:y@example.com", "//example.com"]) assert.equal(https(url), null);
});
