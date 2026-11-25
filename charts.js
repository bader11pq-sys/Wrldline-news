/* WRLDLINE SVG line charts (UMD: WLCharts). No chart library, no innerHTML.
 * Every chart gets a title, a description and a visually hidden data table, so values are available
 * to screen readers and are never conveyed by colour alone. Gaps in data are drawn as gaps. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WLCharts = factory();
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const PALETTE = ["#0b5fa5", "#c2410c", "#2f855a", "#7c3aed", "#b7791f", "#be185d"];

  /** Round "nice" axis bounds. */
  function niceScale(min, max, ticks = 4) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, step: 0.25 };
    if (min === max) { const pad = Math.abs(min) * 0.1 || 1; min -= pad; max += pad; }
    const raw = (max - min) / ticks, mag = 10 ** Math.floor(Math.log10(raw)), norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
  }

  /** Splits points into contiguous runs of consecutive years so missing years are not bridged. */
  function segments(points) {
    const out = []; let run = [];
    for (const p of points) {
      if (run.length && p.x - run[run.length - 1].x > 1) { out.push(run); run = []; }
      run.push(p);
    }
    if (run.length) out.push(run);
    return out;
  }

  function el(doc, name, attrs, text) {
    const n = doc.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v));
    if (text != null) n.textContent = String(text);
    return n;
  }

  /** series: [{name, points:[{x:year,y:number}]}] -> <figure> */
  function lineChart(doc, { title, description, series, formatY, formatX, width = 640, height = 300, rtl = false, labels = {} }) {
    const fy = formatY || ((v) => String(v)), fx = formatX || ((v) => String(v));
    const clean = series.map((s) => ({ name: s.name, points: s.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x) })).filter((s) => s.points.length);
    const figure = doc.createElement("figure"); figure.className = "wp-chart";
    if (!clean.length) { const p = doc.createElement("p"); p.className = "wp-empty"; p.textContent = labels.empty || "No data"; figure.append(p); return figure; }
    const all = clean.flatMap((s) => s.points);
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const sc = niceScale(Math.min(...ys, ...(Math.min(...ys) > 0 && Math.min(...ys) < (Math.max(...ys) * 0.2) ? [0] : [Infinity])), Math.max(...ys));
    const m = { l: 56, r: 14, t: 12, b: 28 }, W = width, H = height, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const X = (x) => { const t = x1 === x0 ? 0.5 : (x - x0) / (x1 - x0); return m.l + (rtl ? 1 - t : t) * iw; };
    const Y = (y) => m.t + (1 - (y - sc.min) / (sc.max - sc.min)) * ih;
    const svg = el(doc, "svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "wp-chart-svg", "aria-labelledby": "t" + title.length, preserveAspectRatio: "xMidYMid meet" });
    const uid = "c" + Math.random().toString(36).slice(2, 8);
    svg.setAttribute("aria-labelledby", uid + "t " + uid + "d");
    svg.append(el(doc, "title", { id: uid + "t" }, title), el(doc, "desc", { id: uid + "d" }, description || ""));
    for (let v = sc.min; v <= sc.max + sc.step / 2; v += sc.step) {
      svg.append(el(doc, "line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: "wp-gridline" }));
      svg.append(el(doc, "text", { x: rtl ? W - m.r + 0 : m.l - 6, y: Y(v) + 4, class: "wp-axis", "text-anchor": rtl ? "start" : "end" }, fy(Number(v.toFixed(10)))));
    }
    const step = Math.max(1, Math.ceil((x1 - x0) / 6));
    for (let x = x0; x <= x1; x += step) svg.append(el(doc, "text", { x: X(x), y: H - 8, class: "wp-axis", "text-anchor": "middle" }, fx(x)));
    clean.forEach((s, i) => {
      const color = PALETTE[i % PALETTE.length];
      for (const run of segments(s.points)) {
        if (run.length === 1) svg.append(el(doc, "circle", { cx: X(run[0].x), cy: Y(run[0].y), r: 3.5, fill: color }));
        else svg.append(el(doc, "path", { d: run.map((p, j) => (j ? "L" : "M") + X(p.x).toFixed(1) + " " + Y(p.y).toFixed(1)).join(" "), fill: "none", stroke: color, "stroke-width": 2.2, "stroke-linejoin": "round", "stroke-dasharray": i % 2 ? "6 3" : "none" }));
      }
      const last = s.points[s.points.length - 1];
      svg.append(el(doc, "circle", { cx: X(last.x), cy: Y(last.y), r: 3.5, fill: color }));
    });
    figure.append(svg);
    if (clean.length > 1) {
      const legend = doc.createElement("ul"); legend.className = "wp-legend";
      clean.forEach((s, i) => { const li = doc.createElement("li"); const sw = doc.createElement("span"); sw.className = "wp-swatch"; sw.style.background = PALETTE[i % PALETTE.length]; li.append(sw, doc.createTextNode(" " + s.name)); legend.append(li); });
      figure.append(legend);
    }
    const table = doc.createElement("table");
    const cap = doc.createElement("caption"); cap.textContent = title; table.append(cap);
    const head = doc.createElement("tr");
    for (const t of [labels.year || "Year", ...clean.map((s) => s.name)]) { const th = doc.createElement("th"); th.scope = "col"; th.textContent = t; head.append(th); }
    table.append(head);
    const years = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
    for (const yr of years) {
      const tr = doc.createElement("tr"); const th = doc.createElement("th"); th.scope = "row"; th.textContent = fx(yr); tr.append(th);
      for (const s of clean) { const td = doc.createElement("td"); const p = s.points.find((q) => q.x === yr); td.textContent = p ? fy(p.y) : "—"; tr.append(td); }
      table.append(tr);
    }
    const wrap = doc.createElement("div"); wrap.className = "wp-sr"; wrap.append(table);
    figure.append(wrap);
    return figure;
  }

  /** Horizontal bar comparison for one indicator: items [{label,value,year}] sorted descending. */
  function barChart(doc, { title, items, formatValue, labels = {} }) {
    const ul = doc.createElement("ul"); ul.className = "wp-bars"; ul.setAttribute("aria-label", title);
    const vals = items.filter((i) => Number.isFinite(i.value));
    const max = Math.max(1e-9, ...vals.map((i) => Math.abs(i.value)));
    for (const i of items) {
      const li = doc.createElement("li");
      const name = doc.createElement("span"); name.className = "wp-bar-name"; name.textContent = i.label;
      const track = doc.createElement("span"); track.className = "wp-bar-track"; track.setAttribute("aria-hidden", "true");
      const fill = doc.createElement("span"); fill.className = "wp-bar-fill" + (Number.isFinite(i.value) && i.value < 0 ? " is-negative" : "");
      fill.style.inlineSize = Number.isFinite(i.value) ? Math.max(1, (Math.abs(i.value) / max) * 100).toFixed(1) + "%" : "0%";
      track.append(fill);
      const val = doc.createElement("span"); val.className = "wp-bar-val";
      val.textContent = Number.isFinite(i.value) ? formatValue(i.value) + (i.year ? " (" + i.year + ")" : "") : (labels.noData || "No data");
      li.append(name, track, val); ul.append(li);
    }
    return ul;
  }

  return Object.freeze({ PALETTE, niceScale, segments, lineChart, barChart });
});
