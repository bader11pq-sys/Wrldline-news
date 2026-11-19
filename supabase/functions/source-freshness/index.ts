// Gateway JWT verification may be disabled for the existing cron-header model
// ONLY while handler-level RPC/admin-token authentication remains mandatory.
import { createHandler } from './handler.ts';
import { resolveSupabaseServiceKey } from "../_shared/service-key.mjs";
Deno.serve(createHandler({
  url: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: resolveSupabaseServiceKey({
    SUPABASE_SECRET_KEY: Deno.env.get("SUPABASE_SECRET_KEY") || "",
    SUPABASE_SECRET_KEYS: Deno.env.get("SUPABASE_SECRET_KEYS") || "",
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  }) ?? "",
  fetch, now: () => new Date(),
}));
