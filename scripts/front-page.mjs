import fs from "node:fs";
import path from "node:path";
import desk from "../event-desk.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TYPES = new Set(["original", "reported", "analysis", "opinion"]);
const NEWS = /^\/news\/([0-9a-f-]{36})$/;
const ORIGINAL = /^\/originals\/[a-z0-9-]+\.html$/;
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const date = s => typeof s === "string" && /^\d{4}-\d\d-\d\d$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().startsWith(s);
const text = (s, max) => typeof s === "string" && s.trim() === s && s.length > 0 && s.length <= max;
const bilingual = (x, max) => text(x?.ar, max) && text(x?.en, max);
const t = (ar, en) => `<span lang="ar">${esc(ar)}</span><span lang="en">${esc(en)}</span>`;
const localized = copy => t(copy.ar, copy.en);

export function validateEventDesk(raw, dossiers) {
  const keys = new Map(dossiers.map(d => [d.slug, d]));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid event desk catalog");
  const seenIds = new Set(), seenGroups = new Set();
  return Object.entries(raw).map(([slug, entry]) => {
    const dossier = keys.get(slug);
    if (!dossier?.readerBrief || !bilingual(entry?.title, 105) || !date(entry.from) ||
        (entry.until != null && (!date(entry.until) || entry.until <= entry.from)) ||
        !Array.isArray(entry.groups) || !entry.groups.length || !Array.isArray(entry.articleIds)) {
      throw new Error(`Invalid event desk entry for ${slug}`);
    }
    for (const group of entry.groups) {
      if (!Array.isArray(group) || group.length < 2 || !group.every(p => text(p, 80) && desk.normalize(p))) {
        throw new Error(`Each automatic match needs compound headline evidence: ${slug}`);
      }
      const normalized = group.map(desk.normalize);
      const signature = normalized.slice().sort().join("|");
      if (new Set(normalized).size !== group.length || seenGroups.has(signature)) throw new Error(`Duplicate event rule: ${slug}`);
      seenGroups.add(signature);
    }
    for (const id of entry.articleIds) {
      if (!UUID.test(id) || seenIds.has(id)) throw new Error(`Invalid or duplicate reviewed article ID: ${id}`);
      seenIds.add(id);
    }
    return { slug, url: `/dossier/${slug}.html`, ...Object.fromEntries(["title","from","until","groups","articleIds"].map(k => [k, entry[k]])) };
  });
}

export function validateEdition(raw, catalog, exists = () => false) {
  if (!date(raw?.editedOn) || !Array.isArray(raw.picks) || raw.picks.length !== 5) throw new Error("Front page needs a date and exactly five ranked picks");
  const seen = new Set();
  const picks = raw.picks.map(p => {
    if (!bilingual(p?.desk, 55) || !bilingual(p?.title, 145) || !bilingual(p?.deck, 270)) throw new Error("Editor picks require authored Arabic and English copy");
    let url, type, source;
    if (p.dossier) {
      url = catalog.find(d => d.slug === p.dossier)?.url;
      if (!url || p.url || p.type || p.source) throw new Error(`Invalid or unpublished dossier pick: ${p.dossier}`);
      type = "dossier";
    } else {
      ({url, type, source} = p);
      const id = NEWS.exec(url)?.[1];
      if (!((id && UUID.test(id)) || (ORIGINAL.test(url) && exists(url))) || !TYPES.has(type) ||
          !bilingual(source, 60) || (type === "original" && !/^WRLDLINE(?: NEWS)?$/i.test(source.en))) {
        throw new Error(`Invalid story pick or attribution: ${url}`);
      }
      if (catalog.some(d => d.articleIds.includes(id))) throw new Error(`Use the event’s canonical dossier instead of a duplicate story pick: ${url}`);
    }
    if (seen.has(url)) throw new Error(`Duplicate editor pick: ${url}`);
    seen.add(url);
    return { ...p, url, type, source };
  });
  return { editedOn: raw.editedOn, picks };
}

export function catalogScript(catalog) {
  return `<script type="application/json" id="eventDeskCatalog">${JSON.stringify(catalog).replace(/</g, "\\u003c")}</script>`;
}

export function renderEdition({ editedOn, picks }, catalog) {
  const renderPick = (p, i) => {
    const lead = i === 0;
    const format = t(desk.label(p.type, "ar"), desk.label(p.type, "en"));
    const cta = p.type === "dossier" ? t("افتح ملف الحدث", "Open the dossier") : t("اقرأ القصة", "Read the story");
    return `<li class="front-pick front-pick--${p.type}${lead ? " front-pick--lead" : ""}">
      <span class="front-pick-num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
      <a class="front-pick-link" href="${esc(p.url)}"${p.type === "dossier" ? ' hreflang="ar"' : ' data-article-edition-link'}>
        <span class="front-pick-meta"><span class="front-pick-type">${format}</span><span>${localized(p.desk)}</span></span>
        <h3>${localized(p.title)}</h3>
        <p>${localized(p.deck)}</p>
        <span class="front-pick-foot">${p.source ? `<span>${localized(p.source)}</span>` : ""}<span class="front-pick-cta">${cta} <span aria-hidden="true">↗</span><span class="front-pick-original-lang">${p.type === "dossier" ? '<span lang="en"> · Arabic</span>' : ""}</span></span></span>
      </a>
    </li>`;
  };
  return `<section id="heroLayout" class="front-edition" aria-labelledby="frontEditionTitle" data-language-managed>
  <div class="front-edition-masthead">
    <div><h2 id="frontEditionTitle">${t("اختيار المحرر", "Editor’s picks")}</h2>
      <p>${t("خمس قصص رتّبتها غرفة الأخبار حسب الأهمية.", "Five stories selected and ordered by the newsroom.")}</p></div>
    <div class="front-edition-index"><a href="/dossier/">${t("كل ملفات الأحداث", "All event dossiers")} <span aria-hidden="true">↗</span></a>
    <span>${t("تاريخ الاختيار", "Edition date")} <time datetime="${editedOn}" dir="ltr">${editedOn}</time></span></div>
  </div>
  <ol class="front-edition-grid">
    ${picks.map(renderPick).join("\n    ")}
  </ol>
  ${catalogScript(catalog)}
</section>`;
}

export function writeEdition(root, catalog) {
  const file = path.join(root, "index.html");
  const current = fs.readFileSync(file, "utf8");
  const slot = /<!-- FRONT_PAGE_START -->[\s\S]*?<!-- FRONT_PAGE_END -->/g;
  if ([...current.matchAll(slot)].length !== 1) throw new Error("Homepage must contain one generated edition slot");
  const raw = JSON.parse(fs.readFileSync(path.join(root, "content/front-page.json"), "utf8"));
  const edition = validateEdition(raw, catalog, url => fs.existsSync(path.join(root, url.slice(1))));
  const next = current.replace(slot, () => `<!-- FRONT_PAGE_START -->\n        ${renderEdition(edition, catalog)}\n        <!-- FRONT_PAGE_END -->`);
  if (next !== current) fs.writeFileSync(file, next, "utf8");
}
