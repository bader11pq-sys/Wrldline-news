const assert = require("node:assert/strict");
const test = require("node:test");
const { blocks, renderInto } = require("../reader-prose.js");

test("retains authored single and blank line breaks, headings, and grouped bullets", () => {
  const input = "فقرة أولى من الخبر.\r\nفقرة ثانية من الخبر.\n\n## ماذا حدث؟\n• العنصر الأول\n• العنصر الثاني\n\nنهاية النص.";
  assert.deepEqual(blocks(input), [
    { type: "paragraph", text: "فقرة أولى من الخبر." },
    { type: "paragraph", text: "فقرة ثانية من الخبر." },
    { type: "heading", text: "ماذا حدث؟" },
    { type: "list", items: ["العنصر الأول", "العنصر الثاني"] },
    { type: "paragraph", text: "نهاية النص." }
  ]);
});

test("loosens a long imported block at sentence boundaries without losing words", () => {
  const sentence = "هذه جملة تقريرية توضّح ما حدث في المدينة وتذكر تفاصيل إضافية ومصدر المعلومات.";
  const input = Array(16).fill(sentence).join(" ");
  const result = blocks(input);
  assert.ok(result.length >= 3);
  assert.ok(result.every(part => part.type === "paragraph" && part.text.endsWith(".")));
  assert.equal(result.map(part => part.text).join(" "), input);
});

test("treats unmarked headings as structure only in long editorial copy", () => {
  const long = "هذه جملة اختبار من المقال وليس فيها أي تغيير عند إظهار النص للقارئ. ".repeat(3).trim();
  const heading = "السياق السابق: كيف بدأ المشهد؟";
  const input = [long, long, long, heading, long, long, long, long].join("\n");
  assert.equal(blocks(input, { editorial: true })[3].type, "heading");
  assert.equal(blocks(input, { editorial: false })[3].type, "paragraph");
  assert.deepEqual(blocks("A brief update."), [{ type: "paragraph", text: "A brief update." }]);
});

test("preserves mixed-direction text, punctuation and nonbreaking characters", () => {
  const text = "قالت WRLDLINE إنّ النسبة كانت 3.5%.\u00a0وبيّن التقرير ذلك في جدولٍ جديد.";
  const source = Array(12).fill(text).join(" ");
  assert.equal(blocks(source).map(b => b.text).join(" ").replace(/\s+/gu, " "), source.replace(/\s+/gu, " "));
  assert.deepEqual(blocks(text), [{ type: "paragraph", text }]);
});

test("a million-character editorial body retains its last sentence", () => {
  const piece = "سطر في المقال الطويل يجمع معلومات إضافية مع تفاصيل أخرى. ";
  const text = piece.repeat(Math.floor(999950 / piece.length)) + "نهاية النص لا تختفي.";
  const result = blocks(text);
  assert.ok(result.length > 100);
  assert.equal(result.map(b => b.text).join(" "), text);
});

test("builds only allowed DOM nodes and writes all author strings as text", () => {
  function node(tag) {
    return { tag, children: [], append(child) { this.children.push(child); } };
  }
  const target = {
    ownerDocument: { createElement: node, createDocumentFragment: () => node("fragment") },
    replaceChildren(fragment) { this.children = fragment.children; }
  };
  renderInto(target, "## <em>Label</em>\n<img src=x onerror=alert(1)>\n• <script>text</script>", { lang: "en" });
  assert.deepEqual(target.children.map(n => n.tag), ["h2", "p", "ul"]);
  assert.equal(target.children[1].textContent, "<img src=x onerror=alert(1)>");
  assert.equal(target.children[2].children[0].textContent, "<script>text</script>");
  assert.ok(target.children.every(n => n.dir === "auto"));
});

test("dense text keeps authored headings and contents without one DOM node per line", () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<article></article>");
  try {
    const host = dom.window.document.querySelector("article");
    const lineGroup = "سطر قصير\n".repeat(3100);
    renderInto(host, `## البداية\n${lineGroup}## الوسط\n${lineGroup}## الخاتمة\nآخر سطر`, { contents: true });
    assert.deepEqual([...host.querySelectorAll(".reader-contents a")].map(a => a.textContent), ["البداية","الوسط","الخاتمة"]);
    assert.ok(host.childElementCount < 70);
    assert.ok(host.textContent.endsWith("آخر سطر"));
  } finally { dom.window.close(); }
});
