import { normalizeCategory, normalizeScope, type Category } from "./taxonomy.ts";
import { ISO_ALPHA3 } from "./iso-alpha3.ts";

const PROVIDER_TOPICS = new Map<string, Category>([
  ["politics", "politics"], ["sports", "sports"], ["business", "economy"],
  ["technology", "tech"], ["health", "health"], ["entertainment", "culture"],
  ["crime", "security"], ["science", "science"], ["environment", "environment"],
  ["education", "society"],
]);

export function providerTopic(values: unknown): Category {
  const list = Array.isArray(values) ? values : [values];
  const topics = new Set(list.map(value => PROVIDER_TOPICS.get(String(value || "").trim().toLowerCase())).filter(Boolean));
  return topics.size === 1 ? [...topics][0]! : "uncategorized";
}

export function providerSourceCountry(value: unknown): string | null {
  const labels = (Array.isArray(value) ? value : [value]).filter((label): label is string =>
    typeof label === "string" && /^[\p{L} .’'-]{2,80}$/u.test(label.trim())
    && !/^(?:unknown|world|international|دولي|غير محدد)$/i.test(label.trim())).map(label => label.trim());
  return new Set(labels.map(label => label.toLowerCase())).size === 1 ? labels[0] : null;
}

export function providerContentType(datatype: unknown, title: string): "news" | "analysis" | "opinion" {
  const kind = String(datatype || "").trim().toLowerCase();
  if (kind === "opinion" || /^(?:opinion|oped|op-ed|رأي|مقال رأي)\s*[:：|—–-]/iu.test(title.trim())) return "opinion";
  if (kind === "analysis" || /^(?:analysis|تحليل)\s*[:：|—–-]/iu.test(title.trim())) return "analysis";
  return "news";
}

export function isPromotion(title: string): boolean {
  return /\b(?:promo(?:tional)?|bonus|coupon|referral|discount) code\b|(?:كود|رمز)\s+(?:ال)?(?:خصم|ترويجي)/iu.test(title);
}

export const EVENT_TYPES = [
  "announcement", "diplomacy", "election", "conflict", "crime", "legal",
  "protest", "disaster", "accident", "public_health", "market", "technology",
  "sports", "science", "culture", "other"
] as const;

export function eventType(value: unknown) {
  return EVENT_TYPES.find(key => key === value) || null;
}

const REGION_EN = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
const REGION_AR = new Intl.DisplayNames(["ar"], { type: "region", fallback: "none" });
const ALIASES: Record<string, string[]> = {
  USA: ["U.S.", "United States of America", "الولايات المتحدة الأمريكية", "أمريكا"],
  GBR: ["UK", "U.K.", "Britain", "بريطانيا", "المملكة المتحدة"],
  ARE: ["UAE", "U.A.E.", "الإمارات", "الإمارات العربية المتحدة"],
  SAU: ["Saudi Arabia", "المملكة العربية السعودية", "السعودية"],
  TUR: ["Turkey", "Türkiye", "تركيا"], POL: ["Poland", "بولندا"],
  IRN: ["Iran", "إيران"], PSE: ["Palestine", "فلسطين"],
  KOR: ["South Korea", "كوريا الجنوبية"], PRK: ["North Korea", "كوريا الشمالية"],
  CZE: ["Czech Republic", "التشيك"],
  SYR: ["Syrian Arab Republic", "سورية"], SDN: ["السودان"],
  ZAF: ["Republic of South Africa"], RUS: ["Russian Federation", "روسيا الاتحادية"],
};

function words(text: string) {
  return " " + text.normalize("NFKD").toLowerCase().replace(/[\p{M}\u0640]/gu, "")
    .replace(/ى/g, "ي").replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";
}

export function acceptedTopic(value: unknown, confidence: number, scope: unknown) {
  const topic = normalizeCategory(value);
  return confidence >= 0.72 && topic !== "uncategorized"
    && (topic !== "world" || ["international", "cross-border"].includes(normalizeScope(scope))) ? topic : null;
}

const COUNTRY_NAMES = [...ISO_ALPHA3].map(([code, alpha2]) => ({
  code, country: REGION_AR.of(alpha2), aliases: [
    REGION_AR.of(alpha2), REGION_EN.of(alpha2), ...(ALIASES[code] || []),
  ].filter((name): name is string => Boolean(name))
    .flatMap(name => /^\p{Script=Arabic}/u.test(name) ? [name,"و"+name,"ب"+name] : [name]).map(words),
}));

export function anchoredEventCountry(modelCode: unknown, evidence: unknown, text: string, confidence: unknown) {
  if (typeof modelCode !== "string" || typeof evidence !== "string" ||
      typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0.8 || confidence > 1) return null;
  const code = modelCode.trim().toUpperCase();
  const quote = words(evidence);
  if (!ISO_ALPHA3.has(code) || evidence.length > 180 || quote.trim().length < 5 ||
      !text.split("\n").some(line => words(line).includes(quote))) return null;
  const matches = COUNTRY_NAMES.flatMap(entry => entry.aliases.filter(name => quote.includes(name))
    .map(name => ({...entry, name})));
  // A short name contained in a longer matched country name is not a second country
  // (e.g. Sudan in South Sudan). Otherwise, abstain on a multi-country quote.
  const codes = new Set(matches.filter(match => !matches.some(other => other.code !== match.code &&
    other.name !== match.name && other.name.includes(match.name))).map(match => match.code));
  const country = COUNTRY_NAMES.find(entry => entry.code === code)?.country;
  if (!country || codes.size !== 1 || !codes.has(code)) return null;
  return { code, country };
}
