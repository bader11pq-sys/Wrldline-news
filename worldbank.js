/* WRLDLINE World Bank client (UMD: browser global WLWorldBank, CommonJS module).
 * Only real data from the public World Bank Indicators API is returned. Missing years stay missing:
 * nothing is interpolated, estimated or filled in. Every result carries the source and the
 * "lastupdated" date reported by the API plus the local fetch time. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WLWorldBank = factory();
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const BASE = "https://api.worldbank.org/v2";
  const SOURCE = { name: "World Bank Open Data", url: "https://data.worldbank.org/" };
  const TTL_MS = 6 * 60 * 60 * 1000;

  /** unit: usd | pct | num | years | lcu | score | perMillion */
  const INDICATORS = {
    "NY.GDP.MKTP.CD": { group: "economy", unit: "usd", ar: "الناتج المحلي الإجمالي (دولار جاري)", en: "GDP (current US$)" },
    "NY.GDP.MKTP.KD.ZG": { group: "economy", unit: "pct", ar: "نمو الناتج المحلي الإجمالي السنوي", en: "GDP growth (annual %)" },
    "NY.GDP.PCAP.CD": { group: "economy", unit: "usd", ar: "نصيب الفرد من الناتج المحلي (دولار جاري)", en: "GDP per capita (current US$)" },
    "FP.CPI.TOTL.ZG": { group: "economy", unit: "pct", ar: "التضخم (أسعار المستهلك، سنوي)", en: "Inflation, consumer prices (annual %)" },
    "SL.UEM.TOTL.ZS": { group: "economy", unit: "pct", ar: "البطالة (% من القوى العاملة، تقدير منظمة العمل الدولية)", en: "Unemployment (% of labor force, ILO estimate)" },
    "NE.TRD.GNFS.ZS": { group: "economy", unit: "pct", ar: "التجارة (% من الناتج المحلي)", en: "Trade (% of GDP)" },
    "PA.NUS.FCRF": { group: "economy", unit: "lcu", ar: "سعر الصرف الرسمي (عملة محلية لكل دولار، متوسط الفترة)", en: "Official exchange rate (LCU per US$, period average)" },
    "BN.CAB.XOKA.GD.ZS": { group: "dashboard", unit: "pct", ar: "رصيد الحساب الجاري (% من الناتج المحلي)", en: "Current account balance (% of GDP)" },
    "BX.KLT.DINV.WD.GD.ZS": { group: "dashboard", unit: "pct", ar: "صافي تدفقات الاستثمار الأجنبي المباشر (% من الناتج المحلي)", en: "FDI net inflows (% of GDP)" },
    "GC.DOD.TOTL.GD.ZS": { group: "dashboard", unit: "pct", ar: "دين الحكومة المركزية (% من الناتج المحلي)", en: "Central government debt (% of GDP)" },
    "NY.GNP.PCAP.PP.CD": { group: "dashboard", unit: "intl", ar: "نصيب الفرد من الدخل القومي (تعادل القوة الشرائية، دولار دولي)", en: "GNI per capita, PPP (current international $)" },
    "AG.SRF.TOTL.K2": { group: "geography", unit: "num", ar: "المساحة الإجمالية (كم²)", en: "Surface area (sq. km)" },
    "SP.POP.TOTL": { group: "society", unit: "num", ar: "عدد السكان", en: "Population, total" },
    "SP.POP.GROW": { group: "society", unit: "pct", ar: "نمو السكان (سنوي)", en: "Population growth (annual %)" },
    "SP.DYN.LE00.IN": { group: "society", unit: "years", ar: "العمر المتوقع عند الولادة", en: "Life expectancy at birth" },
    "SP.URB.TOTL.IN.ZS": { group: "society", unit: "pct", ar: "سكان الحضر (% من السكان)", en: "Urban population (% of total)" },
    "IT.NET.USER.ZS": { group: "science", unit: "pct", ar: "مستخدمو الإنترنت (% من السكان)", en: "Individuals using the Internet (% of population)" },
    "GB.XPD.RSDV.GD.ZS": { group: "science", unit: "pct", ar: "الإنفاق على البحث والتطوير (% من الناتج المحلي)", en: "R&D expenditure (% of GDP)" },
    "SP.POP.SCIE.RD.P6": { group: "science", unit: "perMillion", ar: "الباحثون في البحث والتطوير (لكل مليون نسمة)", en: "Researchers in R&D (per million people)" },
    "GOV_WGI_GE.EST": { group: "politics", unit: "score", ar: "فاعلية الحكومة (مؤشر الحوكمة، من -2.5 إلى +2.5 تقريباً)", en: "Government effectiveness (governance estimate, about -2.5 to +2.5)" },
    "GOV_WGI_PV.EST": { group: "politics", unit: "score", ar: "الاستقرار السياسي (مؤشر الحوكمة، من -2.5 إلى +2.5 تقريباً)", en: "Political stability (governance estimate, about -2.5 to +2.5)" },
    "GOV_WGI_RL.EST": { group: "politics", unit: "score", ar: "سيادة القانون (مؤشر الحوكمة، من -2.5 إلى +2.5 تقريباً)", en: "Rule of law (governance estimate, about -2.5 to +2.5)" },
    "GOV_WGI_VA.EST": { group: "politics", unit: "score", ar: "الصوت والمساءلة (مؤشر الحوكمة، من -2.5 إلى +2.5 تقريباً)", en: "Voice and accountability (governance estimate, about -2.5 to +2.5)" }
  };
  const GROUPS = ["economy", "politics", "society", "science", "geography", "dashboard"];

  function indicatorsIn(group) { return Object.keys(INDICATORS).filter((id) => INDICATORS[id].group === group); }
  function isCountryCode(code) { return /^[A-Za-z]{3}$/.test(String(code || "")); }

  function buildUrl({ countries, indicator, from, to, latestOnly }) {
    const list = [].concat(countries || []).map((c) => String(c).toUpperCase());
    if (!list.length || !list.every(isCountryCode)) throw new Error("invalid country code");
    if (!/^[A-Za-z0-9_.]+$/.test(String(indicator || ""))) throw new Error("invalid indicator");
    const params = new URLSearchParams({ format: "json", per_page: "1000" });
    if (latestOnly) params.set("mrnev", "1");
    else if (from && to) params.set("date", `${Number(from)}:${Number(to)}`);
    return `${BASE}/country/${list.join(";")}/indicator/${indicator}?${params}`;
  }
  const countryUrl = (iso3) => `${BASE}/country/${String(iso3).toUpperCase()}?format=json`;

  /** Validates an Indicators API payload. Never throws; returns {ok:false} on anything unexpected. */
  function parseIndicator(payload) {
    if (!Array.isArray(payload) || payload.length < 2 || !payload[0] || typeof payload[0] !== "object" || !Array.isArray(payload[1])) return { ok: false, rows: [], lastUpdated: null };
    const rows = [];
    for (const r of payload[1]) {
      if (!r || !isCountryCode(r.countryiso3code)) continue;
      const date = Number.parseInt(r.date, 10);
      if (!Number.isFinite(date) || typeof r.value !== "number" || !Number.isFinite(r.value)) continue;
      rows.push({ iso3: r.countryiso3code.toUpperCase(), country: r.country && r.country.value || "", date, value: r.value });
    }
    const lu = payload[0].lastupdated;
    return { ok: true, rows, lastUpdated: typeof lu === "string" && /^\d{4}-\d{2}-\d{2}$/.test(lu) ? lu : null,
      indicatorName: payload[1][0] && payload[1][0].indicator ? payload[1][0].indicator.value : "" };
  }
  function parseCountry(payload) {
    const c = Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1][0] : null;
    if (!c || !isCountryCode(c.id)) return null;
    const clean = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const lat = Number.parseFloat(c.latitude), lon = Number.parseFloat(c.longitude);
    return { iso3: c.id, iso2: clean(c.iso2Code), name: clean(c.name), capital: clean(c.capitalCity),
      region: clean(c.region && c.region.value), income: clean(c.incomeLevel && c.incomeLevel.value),
      lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null,
      isAggregate: Boolean(c.region && c.region.value === "Aggregates") };
  }

  /** Ascending [{date,value}] for one country. */
  function series(rows, iso3) {
    return rows.filter((r) => r.iso3 === iso3).sort((a, b) => a.date - b.date).map(({ date, value }) => ({ date, value }));
  }
  function latest(rows, iso3) {
    const s = series(rows, iso3);
    return s.length ? s[s.length - 1] : null;
  }
  /** Change between the latest observation and the previous one; null unless both exist. */
  function change(s) {
    if (!s || s.length < 2) return null;
    const a = s[s.length - 2], b = s[s.length - 1];
    return { from: a.date, to: b.date, delta: b.value - a.value, pct: a.value !== 0 ? ((b.value - a.value) / Math.abs(a.value)) * 100 : null };
  }

  function formatValue(value, unit, lang) {
    if (!Number.isFinite(value)) return "—";
    const loc = lang === "en" ? "en-US" : "ar-SA-u-nu-latn";
    const nf = (o) => new Intl.NumberFormat(loc, o).format(value);
    switch (unit) {
      case "usd": return Math.abs(value) >= 1e6 ? "US$ " + nf({ notation: "compact", maximumFractionDigits: 2 }) : "US$ " + nf({ maximumFractionDigits: 0 });
      case "intl": return "Int$ " + nf({ maximumFractionDigits: 0 });
      case "pct": return nf({ maximumFractionDigits: 1 }) + "%";
      case "years": return nf({ maximumFractionDigits: 1 });
      case "num": return Math.abs(value) >= 1e6 ? nf({ notation: "compact", maximumFractionDigits: 2 }) : nf({ maximumFractionDigits: 0 });
      case "perMillion": return nf({ maximumFractionDigits: 0 });
      case "score": return nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
      default: return nf({ maximumFractionDigits: 2 });
    }
  }

  function cacheGet(storage, key, now) {
    if (!storage) return null;
    try {
      const v = JSON.parse(storage.getItem(key) || "null");
      return v && typeof v.at === "number" && now - v.at < TTL_MS ? v : null;
    } catch { return null; }
  }
  function cacheSet(storage, key, value) {
    if (!storage) return;
    try { storage.setItem(key, JSON.stringify(value)); } catch { /* quota or private mode */ }
  }

  /** Fetches one indicator. Resolves {ok, rows, lastUpdated, fetchedAt, fromCache, source}; never rejects. */
  async function fetchIndicator(options, env) {
    const e = Object.assign({ fetch: typeof fetch === "function" ? fetch : null, storage: null, now: Date.now(), timeoutMs: 12000 }, env || {});
    let url;
    try { url = buildUrl(options); } catch (err) { return { ok: false, rows: [], error: "invalid_request", source: SOURCE }; }
    const key = "wl:wb:" + url;
    const hit = cacheGet(e.storage, key, e.now);
    if (hit) return Object.assign({}, hit.value, { fromCache: true });
    if (!e.fetch) return { ok: false, rows: [], error: "no_fetch", source: SOURCE };
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), e.timeoutMs) : null;
    try {
      const doFetch = e.fetch;
      const res = await doFetch(url, controller ? { signal: controller.signal } : undefined);
      if (!res.ok) return { ok: false, rows: [], error: "http_" + res.status, source: SOURCE };
      const parsed = parseIndicator(await res.json());
      if (!parsed.ok) return { ok: false, rows: [], error: "bad_payload", source: SOURCE };
      const value = Object.assign({}, parsed, { fetchedAt: new Date(e.now).toISOString(), source: SOURCE, indicator: options.indicator, fromCache: false });
      cacheSet(e.storage, key, { at: e.now, value });
      return value;
    } catch (err) {
      return { ok: false, rows: [], error: err && err.name === "AbortError" ? "timeout" : "network", source: SOURCE };
    } finally { if (timer) clearTimeout(timer); }
  }

  /** Several countries for one indicator. The API rejects the whole request when one code is unknown, so
   * a failed combined request is retried per country and failures are reported instead of hidden. */
  async function fetchIndicatorMulti(options, env) {
    const list = [...new Set([].concat(options.countries || []).map((c) => String(c).toUpperCase()))];
    const combined = await fetchIndicator(Object.assign({}, options, { countries: list }), env);
    if (combined.ok || list.length < 2 || combined.error === "invalid_request") return Object.assign({ failed: combined.ok ? [] : list }, combined);
    const parts = await Promise.all(list.map((c) => fetchIndicator(Object.assign({}, options, { countries: [c] }), env)));
    const okParts = parts.filter((r) => r.ok);
    return {
      ok: okParts.length > 0, rows: okParts.flatMap((r) => r.rows),
      lastUpdated: okParts.map((r) => r.lastUpdated).filter(Boolean).sort().pop() || null,
      fetchedAt: okParts.map((r) => r.fetchedAt).filter(Boolean).sort().pop() || null,
      failed: list.filter((c, i) => !parts[i].ok), source: SOURCE, indicator: options.indicator, error: okParts.length ? null : combined.error
    };
  }

  async function fetchCountry(iso3, env) {
    const e = Object.assign({ fetch: typeof fetch === "function" ? fetch : null, storage: null, now: Date.now() }, env || {});
    const key = "wl:wb:" + countryUrl(iso3), hit = cacheGet(e.storage, key, e.now);
    if (hit) return hit.value;
    if (!e.fetch) return null;
    try {
      const doFetch = e.fetch;
      const res = await doFetch(countryUrl(iso3));
      if (!res.ok) return null;
      const meta = parseCountry(await res.json());
      if (meta) cacheSet(e.storage, key, { at: e.now, value: meta });
      return meta;
    } catch { return null; }
  }

  const countryListUrl = () => BASE + "/country?format=json&per_page=400";
  /** All real countries (aggregates removed) as {iso3: {region, income}}. */
  function parseCountryList(payload) {
    const out = {};
    if (!Array.isArray(payload) || !Array.isArray(payload[1])) return out;
    for (const c of payload[1]) {
      const m = parseCountry([payload[0], [c]]);
      if (m && !m.isAggregate && m.region) out[m.iso3] = { region: m.region, income: m.income };
    }
    return out;
  }
  async function fetchCountryList(env) {
    const e = Object.assign({ fetch: typeof fetch === "function" ? fetch : null, storage: null, now: Date.now() }, env || {});
    const key = "wl:wb:" + countryListUrl(), hit = cacheGet(e.storage, key, e.now);
    if (hit) return hit.value;
    if (!e.fetch) return null;
    try {
      const doFetch = e.fetch;
      const res = await doFetch(countryListUrl());
      if (!res.ok) return null;
      const list = parseCountryList(await res.json());
      if (!Object.keys(list).length) return null;
      cacheSet(e.storage, key, { at: e.now, value: list });
      return list;
    } catch { return null; }
  }

  return Object.freeze({ countryListUrl, parseCountryList, fetchCountryList, BASE, SOURCE, INDICATORS, GROUPS, indicatorsIn, buildUrl, countryUrl, parseIndicator, parseCountry,
    series, latest, change, formatValue, fetchIndicator, fetchIndicatorMulti, fetchCountry });
});
