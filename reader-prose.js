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

  // Keep the author's wording. Take the first text block, with any heading
  // directly above it, rather than generating a second summary.
  function splitLead(value) {
    const text = String(value ?? "").replace(/\r\n?/g, "\n").trim();
    let start = 0;
    for (const match of text.matchAll(/[^\n]+/gu)) {
      const line = match[0].trim();
      if (!line || heading.test(line)) continue;
      start = match.index;
      break;
    }
    const first = text.slice(start).match(/^[^\n]*/u)?.[0] || "";
    let end = start + first.length;
    if (first.length > longParagraph && !bullet.test(first.trim()) && !heading.test(first.trim())) {
      const stop = [...first.matchAll(/[.!?؟]\s+(?=\S)/gu)].find(match => match.index >= 140 && match.index < 520);
      if (stop) end = start + stop.index + 1;
    }
    return { lead: text.slice(0, end).trim(), details: text.slice(end).trim() };
  }

  function splitLongLine(line, lang) {
    if (line.length <= longParagraph) return [line];
    let boundaries;
    try {
      // Avoid very large segmentation inputs in a pasted wall of text.
      if (line.length > 8000) throw new Error("Use linear sentence scan");
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
    const text = String(value ?? "");
    // Extremely short, numerous lines should not create hundreds of thousands of DOM nodes.
    const dense = text.length > 14000 && (text.match(/\n/g)?.length ?? 0) > 6000;
    const rows = dense ? denseBlocks(text) : blocks(text, options);
    const headings = [];
    const prefix = target.closest?.("dialog") ? "wl-reader-section-" : "wl-story-section-";
    for (const block of rows) {
      const el = doc.createElement(block.type === "heading" ? (options?.headingLevel === 3 ? "h3" : "h2") : block.type === "list" ? "ul" : "p");
      el.dir = "auto";
      if (dense && block.type === "paragraph") el.className = "reader-dense-lines";
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
      if (options?.contents && block.type === "heading" && headings.length < 100) {
        el.id = prefix + (headings.length + 1);
        headings.push(el);
      }
      fragment.append(el);
    }
    if (headings.length >= 3 && String(value).length >= 3500) {
      const menu = doc.createElement("details");
      menu.className = "reader-contents";
      const label = doc.createElement("summary");
      label.textContent = options.english ? "In this article" : "في هذا المقال";
      const list = doc.createElement("ol");
      for (const heading of headings) {
        const li = doc.createElement("li");
        const a = doc.createElement("a");
        a.href = "#" + heading.id;
        a.dir = "auto";
        a.textContent = heading.textContent;
        a.addEventListener("click", event => {
          event.preventDefault();
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
          heading.scrollIntoView({ block: "start" });
        });
        li.append(a);
        list.append(li);
      }
      menu.append(label, list);
      fragment.prepend(menu);
    }
    target.replaceChildren(fragment);
  }

  function denseBlocks(text) {
    const result = [];
    let lines = [];
    function flush() {
      if (lines.length) result.push({ type: "paragraph", text: lines.join("\n") });
      lines = [];
    }
    for (const line of text.split(/\r\n?|\n/)) {
      const marked = line.trim().match(heading);
      if (marked) {
        flush();
        result.push({ type: "heading", text: marked[1] });
      } else {
        lines.push(line);
        if (lines.length === 120) flush();
      }
    }
    flush();
    return result;
  }

  return { blocks, renderInto, splitLead };
});
