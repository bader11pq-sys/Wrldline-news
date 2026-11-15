import { pathToFileURL } from 'node:url';
export async function checkFreshness(env = process.env, fetcher = fetch) {
  const url = new URL(env.SUPABASE_URL || 'https://invalid.invalid');
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'invalid.invalid') throw new Error('SUPABASE_URL must be a credential-free HTTPS origin');
  if (!env.WRLDLINE_CRON_SECRET || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error('Freshness credentials are not configured');
  const response = await fetcher(new URL('/functions/v1/source-freshness', url), {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_PUBLISHABLE_KEY,
      'x-wrldline-cron-secret': env.WRLDLINE_CRON_SECRET }, body: '{}', signal: AbortSignal.timeout(120000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true || !Number.isInteger(body.checked_sources) || !Number.isInteger(body.actionable_sources)) throw new Error('Protected freshness endpoint failed');
  return { checked_sources: body.checked_sources, actionable_sources: body.actionable_sources,
    counts: body.counts, alert_delivery: body.alert_delivery, ok: body.checked_sources > 0 && body.actionable_sources === 0 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result = await checkFreshness(); console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
