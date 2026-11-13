const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing Supabase workflow secrets.");

const response = await fetch(SUPABASE_URL + "/functions/v1/openrouter-healthcheck", {
  method: "POST",
  headers: {
    apikey: SERVICE_KEY,
    Authorization: "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json"
  },
  body: "{}"
});
const result = await response.json().catch(() => ({}));
if (!response.ok || !result.ok) {
  console.error("OPENROUTER_HEALTHCHECK_FAILED " + JSON.stringify({
    status: response.status,
    provider: result.provider || null,
    error: result.error || "No healthcheck response"
  }));
  process.exit(1);
}
console.log("OPENROUTER_HEALTHCHECK_OK " + JSON.stringify({
  provider: result.provider,
  model: result.model,
  response: result.response
}));

// Trigger a fresh one-time healthcheck after the auth-header fix.
