// Caller authentication is mandatory before operational reads or writes.
import { evaluateSource } from './evaluate.mjs';
import { diagnose, summarize } from './diagnose.mjs';

type Dependencies = { url: string; serviceKey: string; fetch: typeof fetch; now: () => Date; ingestionPaused?: boolean };
export function createHandler(deps: Dependencies) {
  const headers = { apikey: deps.serviceKey, Authorization: `Bearer ${deps.serviceKey}`, 'Content-Type': 'application/json' };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const db = (path: string, body: unknown) => deps.fetch(`${deps.url}/rest/v1/${path}`, {
    method: 'POST', headers: { ...headers, ...(path.startsWith('source_freshness_metrics') ? { Prefer: 'resolution=merge-duplicates,return=minimal' } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply({ error: 'POST required' }, 405);
    if (!deps.serviceKey || !deps.url) return reply({ error: 'Monitoring not configured' }, 503);
    try {
      let authorized = false, isAdminSession = false;
      const secret = request.headers.get('x-wrldline-cron-secret');
      if (secret) {
        const result = await db('rpc/verify_wrldline_cron_secret', { p_secret: secret });
        authorized = result.ok && await result.json() === true;
      }
      if (!authorized) {
        const token = request.headers.get('Authorization') ?? '';
        // Never trust decoded JWT claims, user_metadata, or a role supplied in body.
        if (/^Bearer \S+$/i.test(token)) {
          const result = await deps.fetch(`${deps.url}/auth/v1/user`, {
            headers: { apikey: deps.serviceKey, Authorization: token }, signal: AbortSignal.timeout(10000),
          });
          const user = result.ok ? await result.json() : null;
          authorized = Boolean(user?.id && user?.app_metadata?.role === 'admin');
          isAdminSession = authorized;
        }
      }
      if (!authorized) return reply({ error: 'Unauthorized' }, 401);
      const metrics: ReturnType<typeof evaluateSource>[] = [];
      const labels = new Map<string, { name: string; kind: string }>();
      let wantDetail = false;
      try { wantDetail = request.headers.get('content-length') !== '0' && (await request.clone().json())?.detail === true; } catch { /* no body */ }
      const checkedAt = deps.now();
      for (let offset = 0; ; offset += 500) {
        if (offset >= 100000) throw new Error('Source pagination safety limit reached');
        const response = await db('rpc/get_source_freshness_snapshot', { p_limit: 500, p_offset: offset });
        if (!response.ok) throw new Error('Snapshot unavailable');
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error('Invalid snapshot');
        metrics.push(...rows.map((source) => evaluateSource(source, checkedAt)));
        for (const row of rows) labels.set(String(row.source_key), { name: String(row.source_name ?? ''), kind: String(row.source_kind ?? '') });
        if (rows.length < 500) break;
      }
      // Keep historic metrics for disabled sources; checked_at exposes old values.
      for (let offset = 0; offset < metrics.length; offset += 250) {
        const rows = metrics.slice(offset, offset + 250).map(({ actionable: _actionable, ...row }) => row);
        const response = await db('source_freshness_metrics?on_conflict=source_key', rows);
        if (!response.ok) throw new Error('Metrics persistence failed');
      }
            const counts: Record<string, number> = {};
      for (const metric of metrics) counts[metric.status] = (counts[metric.status] ?? 0) + 1;
      // Diagnosis separates deliberate-pause effects from real defects. Counts only unless an admin session asks for detail.
      const paused = deps.ingestionPaused !== false;
      const diagnoses = metrics.map((metric) => diagnose(metric, { ingestionPaused: paused }));
      const summary = summarize(diagnoses);
      // No outbound email/SMS/webhook. Source names are returned ONLY to an admin session that explicitly requests detail.
      const detail = isAdminSession && wantDetail
        ? metrics.map((m, i) => ({ source_key: m.source_key, ...labels.get(m.source_key), status: m.status, flags: m.flags, ...diagnoses[i], last_success_at: m.last_success_at, last_published_at: m.last_published_at }))
            .filter((row) => row.severity >= 2).sort((a, b) => b.severity - a.severity).slice(0, 600)
        : undefined;
      return reply({ ok: true, checked_sources: metrics.length, actionable_sources: metrics.filter((m) => m.actionable).length, counts,
        ingestion_paused: paused, diagnosis: summary, ...(detail ? { detail } : {}), alert_delivery: 'not_configured' });
    } catch {
      // Backend errors may contain secrets or private excerpts: never return them.
      return reply({ ok: false, error: 'Freshness check failed' }, 503);
    }
  };
}
