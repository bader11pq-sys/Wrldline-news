// Shared taxonomy for WRLDLINE Edge Functions.
// Keep the category list aligned with ../../taxonomy.js and the database migration.

export const TAXONOMY_VERSION = "wrldline-1";

export const CATEGORY_KEYS = [
  "politics",
  "economy",
  "security",
  "tech",
  "sports",
  "culture",
  "health",
  "science",
  "environment",
  "society",
  "world",
  "uncategorized",
] as const;

export type Category = typeof CATEGORY_KEYS[number];
export const ALLOWED_CATEGORIES = new Set<string>(CATEGORY_KEYS);

export const SOURCE_SCOPES = [
  "local",
  "national",
  "regional",
  "international",
  "cross-border",
  "unknown",
] as const;

export type SourceScope = typeof SOURCE_SCOPES[number];

export function normalizeCategory(value: unknown): Category {
  const key = String(value || "").trim().toLowerCase();
  return (ALLOWED_CATEGORIES.has(key) ? key : "uncategorized") as Category;
}

export function detectLanguage(text: string): "ar" | "en" | "unknown" {
  const value = String(text || "");
  const arabic = (value.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  if (!arabic && !latin) return "unknown";
  return arabic >= latin ? "ar" : "en";
}

export function resolveSourceLanguage(declared: unknown, text: string): {
  language: "ar" | "en";
  detection: "declared" | "detected" | "conflict" | "unknown";
  detected: "ar" | "en" | "unknown";
} {
  const raw = String(declared || "").trim().toLowerCase();
  const declaredLanguage = raw.startsWith("ar") ? "ar" : (raw.startsWith("en") ? "en" : null);
  const detected = detectLanguage(text);
  if (declaredLanguage && detected !== "unknown" && declaredLanguage !== detected) {
    return { language: declaredLanguage, detection: "conflict", detected };
  }
  if (declaredLanguage) return { language: declaredLanguage, detection: "declared", detected };
  if (detected !== "unknown") return { language: detected, detection: "detected", detected };
  return { language: "en", detection: "unknown", detected: "unknown" };
}

export function normalizeScope(value: unknown): SourceScope {
  const key = String(value || "").trim().toLowerCase();
  return (SOURCE_SCOPES.includes(key as SourceScope) ? key : "unknown") as SourceScope;
}

export function inferSourceScope(feed: Record<string, unknown>): SourceScope {
  const declared = normalizeScope(feed?.source_scope);
  if (declared !== "unknown") return declared;
  const haystack = [feed?.name, feed?.url, feed?.country].filter(Boolean).join(" ").toLowerCase();
  if (/دولي|international|world|global|foreign|afp|reuters|associated press|ap news|bbc|cnn|al jazeera english|dw|france 24|npr|guardian|new york times|sky news/.test(haystack)) return "international";
  if (/السعودية|كويت|الإمارات|قطر|البحرين|عمان|اليمن|مصر|الأردن|لبنان|فلسطين|سوريا|العراق|المغرب|الجزائر|تونس|ليبيا|السودان|saudi|kuwait|emirates|qatar|bahrain|oman|yemen|egypt|jordan|lebanon|palestine|syria|iraq|morocco|algeria|tunisia|libya|sudan/.test(haystack)) return "national";
  return "unknown";
}

export function translationStatusLabel(status: unknown, source: unknown, lang: "ar" | "en"): string {
  const statusKey = String(status || "none");
  if (statusKey === "published") {
    if (source === "editorial") return lang === "ar" ? "ترجمة تحريرية معتمدة" : "Verified editorial translation";
    if (source === "external_source") return lang === "ar" ? "ترجمة من مصدر خارجي" : "External-source translation";
    return lang === "ar" ? "ترجمة آلية منشورة" : "Published machine translation";
  }
  if (statusKey === "review") return lang === "ar" ? "ترجمة قيد المراجعة" : "Translation under review";
  if (statusKey === "draft") return lang === "ar" ? "ترجمة آلية — مسودة غير منشورة" : "Machine draft — unpublished";
  if (statusKey === "rejected") return lang === "ar" ? "ترجمة مرفوضة" : "Rejected translation";
  return "";
}
