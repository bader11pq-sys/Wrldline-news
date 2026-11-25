/* WRLDLINE country profile model (UMD: WLCountry). Pure functions only; no network, no DOM.
 * It joins three existing sources without duplicating them:
 *   1. the history atlas entities (editorial Arabic narrative, sources, timelines),
 *   2. published news rows already converted by WLFeed.toArticle,
 *   3. World Bank indicators (fetched by worldbank.js).
 * Nothing is invented: a country without an atlas entity gets only verified structured data. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./editorial-display.js"));
  else root.WLCountry = factory(root.WLEditorial);
})(typeof window === "undefined" ? globalThis : window, function (editorial) {
  "use strict";

  /** Atlas entity id -> modern ISO 3166-1 alpha-3. Entities of kind "civilization" describe a wider
   * historical region than the modern state; their scope is flagged so the page never implies otherwise. */
  const HISTORY_TO_ISO3 = Object.freeze({
    sa: "SAU", eg: "EGY", cn: "CHN", iq: "IRQ", gr: "GRC", it: "ITA", in: "IND", jp: "JPN", us: "USA", ir: "IRN",
    tr: "TUR", et: "ETH", mx: "MEX", ml: "MLI", fr: "FRA", de: "DEU", gb: "GBR", ru: "RUS", es: "ESP", pt: "PRT",
    nl: "NLD", pl: "POL", se: "SWE", ua: "UKR", kr: "KOR", vn: "VNM", id: "IDN", af: "AFG", kz: "KAZ", ma: "MAR",
    jo: "JOR", br: "BRA", ar: "ARG", pe: "PER", ca: "CAN", ng: "NGA", za: "ZAF", au: "AUS"
  });
  /** Atlas scope that is broader or different from the modern country of the same name. */
  const BROADER_SCOPE = Object.freeze({ iq: "mesopotamia", ml: "west-african-empires", kr: "korean-peninsula", it: "rome-and-italy", tr: "anatolia" });
  const ISO3_TO_HISTORY = Object.freeze(Object.fromEntries(Object.entries(HISTORY_TO_ISO3).map(([id, iso]) => [iso, id])));

  const historyIdFor = (iso3) => ISO3_TO_HISTORY[String(iso3 || "").toUpperCase()] || null;
  const iso3ForHistory = (id) => HISTORY_TO_ISO3[id] || null;
  const normalizeIso3 = (value) => editorial.iso3Of(String(value || "")) || null;

  /** Looks a string up in the atlas English map. Returns {text, lang, translated}. */
  function localize(text, lang, enMap) {
    const value = String(text == null ? "" : text);
    if (lang !== "en") return { text: value, lang: "ar", translated: true };
    const hit = enMap && Object.prototype.hasOwnProperty.call(enMap, value) ? enMap[value] : null;
    return hit ? { text: String(hit), lang: "en", translated: true } : { text: value, lang: "ar", translated: false };
  }

  /** The World Bank publishes these classification labels in English only. They form a closed vocabulary,
   * so a fixed Arabic rendering is exact; anything outside it stays in English and is marked as such. */
  const WB_LABELS_AR = Object.freeze({
    "Low income": "دخل منخفض", "Lower middle income": "دخل متوسط منخفض", "Upper middle income": "دخل متوسط مرتفع", "High income": "دخل مرتفع",
    "East Asia & Pacific": "شرق آسيا والمحيط الهادئ", "Europe & Central Asia": "أوروبا وآسيا الوسطى", "Latin America & Caribbean": "أمريكا اللاتينية والكاريبي",
    "Middle East, North Africa, Afghanistan & Pakistan": "الشرق الأوسط وشمال أفريقيا وأفغانستان وباكستان", "North America": "أمريكا الشمالية",
    "South Asia": "جنوب آسيا", "Sub-Saharan Africa": "أفريقيا جنوب الصحراء", "Middle East & North Africa": "الشرق الأوسط وشمال أفريقيا"
  });
  function wbLabel(value, lang) {
    if (lang === "ar" && WB_LABELS_AR[value]) return { text: WB_LABELS_AR[value], lang: "ar" };
    return { text: value, lang: "en" };
  }

  function directory(lang, historyIds) {
    const have = new Set((historyIds || []).map((id) => HISTORY_TO_ISO3[id]).filter(Boolean));
    const collator = new Intl.Collator(lang === "en" ? "en" : "ar");
    return editorial.iso3List().map((iso3) => ({ iso3, iso2: editorial.codeOf(iso3), name: editorial.countryName(iso3, lang), hasHistory: have.has(iso3) }))
      .filter((c) => c.name).sort((a, b) => collator.compare(a.name, b.name));
  }

  /** Splits atlas content into the sections of the profile. Strings are localized lazily by the view. */
  function atlasSections(entity, events) {
    if (!entity) return null;
    const list = (v) => (Array.isArray(v) ? v : []);
    const timeline = list(entity.timeline).filter((r) => Array.isArray(r) && r.length >= 2).map(([date, text]) => ({ date, text }));
    const related = list(events).filter((e) => e && e.entity === entity.id).sort((a, b) => a.year - b.year)
      .map((e) => ({ year: e.year, label: e.label, title: e.title, body: e.body }));
    return {
      id: entity.id, kind: entity.type, scope: BROADER_SCOPE[entity.id] || null,
      name: entity.name, summary: entity.summary, period: entity.period, coords: Array.isArray(entity.coords) ? entity.coords : null,
      overview: { capital: entity.capital, languages: entity.languages, government: entity.government, religion: entity.religion, subregion: entity.subregion },
      facts: list(entity.facts).filter((f) => Array.isArray(f) && f.length >= 2),
      culture: list(entity.culture).filter((f) => Array.isArray(f) && f.length >= 2),
      deepDive: list(entity.deepDive).filter((f) => Array.isArray(f) && f.length >= 2),
      timeline, events: related,
      stats: list(entity.stats).filter((s) => s && s.label && s.value),
      sources: list(entity.sources).filter((s) => s && /^https?:\/\//i.test(s.url || "")).map((s) => ({ title: s.title, url: s.url, type: s.type, year: s.year }))
    };
  }

  function newsFor(articles, iso3) {
    const wanted = normalizeIso3(iso3);
    return (articles || []).filter((a) => wanted && a.country === wanted).sort((a, b) => (b.published || 0) - (a.published || 0));
  }

  /** Counts per trust status so the page can show verified vs developing coverage honestly. */
  function trustSummary(articles) {
    const out = { confirmed: 0, unconfirmed: 0, disputed: 0, total: 0 };
    for (const a of articles || []) { out.total++; if (a.trust in out) out[a.trust]++; }
    return out;
  }

  /** Overview rows built from verified sources only: World Bank metadata first, atlas values as fallback. */
  function overviewRows({ meta, atlas, lang, enMap }) {
    const rows = [];
    const atlasCapital = atlas && atlas.overview.capital ? localize(atlas.overview.capital, lang, enMap) : null;
    if (meta && meta.capital && !(lang === "ar" && atlasCapital)) rows.push({ key: "capital", value: meta.capital, source: "wb", lang: "en" });
    else if (atlasCapital) rows.push({ key: "capital", value: atlasCapital.text, source: "atlas", lang: atlasCapital.lang });
    if (meta && meta.region) { const l = wbLabel(meta.region, lang); rows.push({ key: "region", value: l.text, source: "wb", lang: l.lang }); }
    if (meta && meta.income) { const l = wbLabel(meta.income, lang); rows.push({ key: "income", value: l.text, source: "wb", lang: l.lang }); }
    for (const k of ["government", "languages", "religion"]) {
      if (atlas && atlas.overview[k]) { const l = localize(atlas.overview[k], lang, enMap); rows.push({ key: k, value: l.text, source: "atlas", lang: l.lang }); }
    }
    return rows;
  }

  function countryCoords(meta, atlas) {
    if (meta && meta.lat != null && meta.lon != null) return [meta.lat, meta.lon];
    if (atlas && atlas.coords) return atlas.coords;
    return null;
  }

  return Object.freeze({ HISTORY_TO_ISO3, ISO3_TO_HISTORY, BROADER_SCOPE, historyIdFor, iso3ForHistory, normalizeIso3, localize,
    wbLabel, WB_LABELS_AR, directory, atlasSections, newsFor, trustSummary, overviewRows, countryCoords });
});
