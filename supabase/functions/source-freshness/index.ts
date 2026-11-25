// Gateway JWT verification may be disabled for the existing cron-header model
// ONLY while handler-level RPC/admin-token authentication remains mandatory.
import { createHandler } from './handler.ts';
Deno.serve(createHandler({
  url: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '',
  fetch, now: () => new Date(),
  // Legacy ingestion is intentionally stopped. Set SOURCE_INGESTION_PAUSED=false only if ingestion is explicitly re-authorized.
  ingestionPaused: Deno.env.get('SOURCE_INGESTION_PAUSED') !== 'false',
}));
