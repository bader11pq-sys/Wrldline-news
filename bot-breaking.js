// WRLDLINE breaking desk manual/CI entry point.
// Scheduled collection runs in Supabase Cron through the same Edge Function.
// Both scheduled and manual runs share a database lease and cannot overlap.
const fs = require("node:fs");
const path = require("node:path");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EXPECTED_CATALOG_SIZE = 80;
const EXPECTED_BREAKING_SOURCES = 24;

function validateCatalog() {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "source-catalog.json"), "utf8"));
  if (!Array.isArray(catalog) || catalog.length !== EXPECTED_CATALOG_SIZE) {
    throw new Error(`Expected exactly ${EXPECTED_CATALOG_SIZE} canonical sources`);
  }
  const urls = new Set(catalog.map((source) => String(source.url || "")));
  if (urls.size !== EXPECTED_CATALOG_SIZE || catalog.some((source) => !source.url || !source.name || !source.lang)) {
    throw new Error("The canonical source catalog contains missing or duplicate records");
  }
  const urgent = catalog.filter((source) => source.breaking === true);
  if (urgent.length !== EXPECTED_BREAKING_SOURCES) {
    throw new Error(`Expected exactly ${EXPECTED_BREAKING_SOURCES} breaking desk sources`);
  }
  if (urgent.some((source) => source.lang !== "ar" || !source.breaking_domain)) {
    throw new Error("Breaking desk sources must be Arabic-only and have explicit publisher domains");
  }
  return urgent;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing Supabase credentials");
  const sources = validateCatalog();
  console.log(`WRLDLINE_BREAKING_CONFIG validated=${sources.length}`);
  const response = await fetch(`${SUPABASE_URL}/functions/v1/breaking-news-monitor`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(90000)
  });
  const result = await response.json().catch(() => ({}));
  console.log("WRLDLINE_BREAKING_RESULT " + JSON.stringify(result));
  if (!response.ok || result.ok !== true) throw new Error(`Breaking monitor failed with HTTP ${response.status}`);
  if (result.sms?.status === "not_configured") console.warn("WRLDLINE_SMS_NOT_CONFIGURED " + (result.sms.missing || []).join(", "));
}
main().catch((error) => {
  console.error("WRLDLINE_BREAKING_FAILED", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
