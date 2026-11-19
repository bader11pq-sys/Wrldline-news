"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("newsroom cards preserve a visual placeholder when an image is absent or fails", () => {
  const newsroom = read("newsroom.js");
  const css = read("wrld.css");
  const start = newsroom.indexOf("function articleCard(");
  const end = newsroom.indexOf("\n  function renderInto(", start);
  assert.ok(start >= 0 && end > start, "articleCard function exists");
  const card = newsroom.slice(start, end);

  assert.match(card, /const imagePlaceholder = '<div class="image-placeholder card-image"/);
  assert.match(card, /opts\.compact \? "" : \(a\.image_url/);
  assert.match(card, /onerror="this\.replaceWith\(Object\.assign\(document\.createElement\('div'\)/);
  assert.doesNotMatch(card, /style\.display=['"]none['"]/);
  assert.match(css, /\.news-card \.image-placeholder\{[^}]*aspect-ratio:16\/10/);
});
