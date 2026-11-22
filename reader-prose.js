/* Presentation only: keep article text as text, never interpret it as HTML. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WLReaderProse = api;
})(globalThis, function () {
  "use strict";
  const bullet = /^[•●▪]\s+(.+)$/u;
  const heading = /^#{2,4}\s+(.+)$/u;
  const longParagraph = 560;

  function splitLongLine(line, lang) {
    if (line.length <= longParagraph) return [line];
    let boundaries;
    try {
      const splitter = new Intl.Segmenter(lang, { granularity: "sentence" });
      boundaries = Array.from(splitter.segment(line), part => part.index)
        .filter(index => index > 0 && /\s/u.test(line[index - 1]));
    } catch {
      boundaries = Array.from(line.matchAll(/(?<=[.!?؟])\s+(?=\S)/gu), match => match.index + match[0].length);
    }
    const paragraphs = [];
    let start = 0;
    let previous = 0;
    for (const end of [...boundaries, line.length]) {
      if (previous - start >= 250 && end - start > 440) {
        paragraphs.push(line.slice(start, previous).trim());
        start = previous;
      }
      previous = end;
    }
    paragraphs.push(line.slice(start).trim());
    return paragraphs;
  }

  function blocks(value, { lang = "ar", editorial = false } = {}) {
    const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n").map(line => line.trim()).filter(Boolean);
    const result = [];
    lines.forEach((line, index) => {
      const item = line.match(bullet);
      if (item) {
        if (result.at(-1)?.type === "list") result.at(-1).items.push(item[1]);
        else result.push({ type: "list", items: [item[1]] });
        return;
      }
      const marked = line.match(heading);
      // The editorial desk also supplies short standalone headings with no
      // Markdown, between authored paragraphs. Don't infer these for wire copy.
      const editorialHeading = editorial && lines.length >= 8 && line.length >= 18 && line.length <= 90
        && (lines[index - 1]?.length ?? 0) >= 120 && (lines[index + 1]?.length ?? 0) >= 120
        && !/[.!…]$/u.test(line) && (/[:：؟]/u.test(line) || line.split(/\s+/u).length <= 10);
      if (marked || editorialHeading) {
        result.push({ type: "heading", text: marked?.[1] ?? line });
        return;
      }
      for (const text of splitLongLine(line, lang)) result.push({ type: "paragraph", text });
    });
    return result;
  }

  function renderInto(target, value, options) {
    const doc = target.ownerDocument;
    const fragment = doc.createDocumentFragment();
    for (const block of blocks(value, options)) {
      const el = doc.createElement(block.type === "heading" ? "h2" : block.type === "list" ? "ul" : "p");
      el.dir = "auto";
      if (block.type === "list") {
        for (const text of block.items) {
          const li = doc.createElement("li");
          li.dir = "auto";
          li.textContent = text;
          el.append(li);
        }
      } else {
        el.textContent = block.text;
      }
      fragment.append(el);
    }
    target.replaceChildren(fragment);
  }

  return { blocks, renderInto };
});
