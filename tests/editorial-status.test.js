const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync(require.resolve("../script.js"), "utf8");

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function loadHelpers() {
  const start = script.indexOf("function verificationBadgeMarkup(a)");
  const end = script.indexOf("function sourceLineMarkup(a", start);
  assert.ok(start >= 0 && end > start, "verification helpers must exist before source rendering");
  const source = script.slice(start, end);
  const context = {
    ui: (ar, en) => ar,
    escapeHTML,
    contentBadgeMarkup: () => "",
    translationBadge: () => ""
  };
  vm.createContext(context);
  vm.runInContext(source + "\nglobalThis.badge = verificationBadgeMarkup; globalThis.disclosure = verificationDisclosureMarkup; globalThis.typeBadges = typeBadgesMarkup;", context);
  return context;
}

test("homepage marks missing human review without implying the story is false", () => {
  const helpers = loadHelpers();
  const markup = helpers.badge({ verification: "unconfirmed" });
  assert.match(markup, /editorial-verification--unconfirmed/);
  assert.match(markup, /لم يُسجل تحقق بشري/);
  assert.match(markup, /هذا لا يعني أنه كاذب/);
  assert.doesNotMatch(markup, /مؤكد بشرياً|تم التحقق بشرياً/);
});

test("disputed stories receive an explicit disputed state and evidence guidance", () => {
  const helpers = loadHelpers();
  const markup = helpers.badge({ verification: "disputed" });
  assert.match(markup, /editorial-verification--disputed/);
  assert.match(markup, /محل خلاف/);
  assert.match(markup, /راجع المصادر والأدلة/);
});

test("legacy confirmed flag alone never becomes a human-confirmed label in homepage cards", () => {
  const helpers = loadHelpers();
  const markup = helpers.badge({ verification: "confirmed" });
  assert.match(markup, /لم يُسجل تحقق بشري/);
  assert.doesNotMatch(markup, /editorial-verification--confirmed|مؤكد بشرياً/);
});

test("badge and disclosure text are HTML-escaped", () => {
  const helpers = loadHelpers();
  const markup = helpers.badge({ verification: "<img src=x onerror=alert(1)>" });
  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, /لم يُسجل تحقق بشري/);
  const note = helpers.disclosure({ verification: "unconfirmed" });
  assert.match(note, /editorial-verification-disclosure/);
  assert.match(note, /لا يعني أن الخبر كاذب/);
});

test("breaking, editorial, and translation badges retain the verification state", () => {
  const helpers = loadHelpers();
  const markup = helpers.typeBadges({
    isBreaking: true,
    hasTranslation: false,
    translationFallback: false,
    verification: "unconfirmed"
  });
  assert.match(markup, /breaking-badge/);
  assert.match(markup, /editorial-verification--unconfirmed/);
  assert.match(script.slice(script.indexOf("function wlCardMeta(a)"), script.indexOf("function renderHero")), /typeBadgesMarkup\(a\)/);
  assert.match(script.slice(script.indexOf("function openArticle"), script.indexOf("let currentArticleAudioUrl")), /verificationDisclosureMarkup\(a\)/);
  assert.match(script.slice(script.indexOf("function renderHero"), script.indexOf("function renderFeed")), /verificationBadgeMarkup\(a\)/);
});

test("public article route link identifies the verification context", () => {
  assert.match(script, /فتح صفحة الخبر وسياق التحقق/);
});
