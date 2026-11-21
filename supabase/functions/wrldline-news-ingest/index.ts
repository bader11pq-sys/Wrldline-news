import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve((_req: Request) => new Response(JSON.stringify({
  ok: true,
  disabled: true,
  code: "RSS_INGESTION_DISABLED",
  message: "WRLDLINE RSS collection has been intentionally paused. Existing articles remain untouched."
}), { status: 410, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }));
