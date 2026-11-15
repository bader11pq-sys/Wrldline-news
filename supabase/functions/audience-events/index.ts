import { BudgetExceeded, createHandler } from "./handler.ts";
const project = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// This project's known public origin is the only default. An explicit empty
// environment override still fails closed; no wildcards or substring checks.
const origins = new Set((Deno.env.get("AUDIENCE_ALLOWED_ORIGINS") ?? "https://al-ghaib.us.ci").split(",").map(value => value.trim()).filter(value => {
  try { return new URL(value).origin === value && value.startsWith("https://"); } catch { return false; }
}));
const headers = { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" };
const handler = createHandler({
  origins,
  async rpc(name, args) {
    if (!project || !serviceKey) throw new Error("Collector not configured");
    const response = await fetch(project + "/rest/v1/rpc/" + name, { method: "POST", headers, body: JSON.stringify(args), signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (error.code === "P0001" && error.message === "audience_rate_limit") throw new BudgetExceeded();
      throw new Error("RPC failed");
    }
    return response.json();
  },
  async user(token) {
    if (!project || !serviceKey) return null;
    const response = await fetch(project + "/auth/v1/user", { headers: { apikey: serviceKey, Authorization: "Bearer " + token }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return (await response.json()).id || null;
  }
});
Deno.serve(handler);
