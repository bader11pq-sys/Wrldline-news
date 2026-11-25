#!/usr/bin/env node
/**
 * Probe a Supabase project for the exact objects the pending migrations create,
 * and for the access rules that must hold around them.
 *
 * Read-only: every request is a GET or a POST to a function that only reads.
 * It is used in three places:
 *   - before a staging migration, with --expect=absent (proves the baseline)
 *   - after a staging migration,  with --expect=applied
 *   - against production, with --expect=to-be-audited, to record the drift
 *
 * Environment:
 *   SUPABASE_URL       project URL (defaults to the production project)
 *   SUPABASE_ANON_KEY  publishable/anon key
 *
 * Exit code is 1 when any expectation fails.
 */
const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const URL_BASE = (value('url') || process.env.SUPABASE_URL || 'https://vmaxbnogmmfyrcucapnq.supabase.co').replace(/\/$/, '');
const KEY = value('key') || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
const EXPECT = value('expect', 'applied');
const JSON_OUT = args.includes('--json');

if (!KEY) {
  console.error('probe-backend: SUPABASE_ANON_KEY is required');
  process.exit(2);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' };

async function probeRpc(name, body = {}) {
  const response = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const text = await response.text();
  let code = '';
  try { code = JSON.parse(text).code || ''; } catch { /* non-JSON body */ }
  return { status: response.status, code, body: text.slice(0, 200) };
}

async function probeTable(table, query = 'select=*&limit=1') {
  const response = await fetch(`${URL_BASE}/rest/v1/${table}?${query}`, { headers });
  const text = await response.text();
  let code = '';
  try { code = JSON.parse(text).code || ''; } catch { /* non-JSON body */ }
  return { status: response.status, code, body: text.slice(0, 200) };
}

const results = [];
function expect(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
}

// Objects created by the three migrations.
const FUNCTIONS = ['editor_newsroom_overview', 'editor_article_queue', 'editor_source_summary', 'record_article_read', 'get_personalized_feed'];
const TABLES = ['article_review_notes', 'user_reading_history'];
const COLUMNS = ['personalize_from_history', 'reading_history_opt_in'];

async function main() {
  const functionStates = [];
  for (const fn of FUNCTIONS) {
    const state = await probeRpc(fn);
    const missing = state.code === 'PGRST202' || state.code === 'PGRST203';
    const authenticated = state.status === 401 || state.status === 403 || /permission denied|JWT|requires? authentication/i.test(state.body);
    functionStates.push({ fn, missing, authenticated, ...state });
    if (EXPECT === 'applied') {
      expect(`function ${fn} exists`, !missing, `${state.status} ${state.code || 'no-code'}`);
      expect(`function ${fn} is not open to anonymous callers`, !(state.status === 200), `${state.status}${authenticated ? ' (refused)' : ''}`);
    } else if (EXPECT === 'absent') {
      expect(`function ${fn} is absent`, missing, `${state.status} ${state.code || 'no-code'}`);
    }
  }

  const tableStates = [];
  for (const table of TABLES) {
    const state = await probeTable(table);
    const missing = state.code === 'PGRST205';
    tableStates.push({ table, missing, ...state });
    if (EXPECT === 'applied') {
      expect(`table ${table} exists`, !missing, `${state.status} ${state.code || 'no-code'}`);
      expect(`table ${table} returns no anonymous rows`, !(state.status === 200 && state.body.trim() !== '[]'), `${state.status} ${state.body.slice(0, 40)}`);
    } else if (EXPECT === 'absent') {
      expect(`table ${table} is absent`, missing, `${state.status} ${state.code || 'no-code'}`);
    }
  }

  for (const column of COLUMNS) {
    const state = await probeTable('user_preferences', `select=${column}&limit=1`);
    const missing = state.code === '42703';
    if (EXPECT === 'applied') expect(`column user_preferences.${column} exists`, !missing, `${state.status} ${state.code || 'no-code'}`);
    else if (EXPECT === 'absent') expect(`column user_preferences.${column} is absent`, missing, `${state.status} ${state.code || 'no-code'}`);
  }

  // Existing production surface must stay reachable; a migration that breaks the
  // public feed is worse than a missing feature.
  // These two are the live public read path. A statement timeout here is a real
  // signal, but it is also transient under a cold cache, so retry once before
  // failing — a migration review should not be blocked by one slow round trip.
  for (const fn of ['public_home_news_recent_v4', 'public_section_feed']) {
    const body = fn === 'public_section_feed'
      ? { p_category: 'world', p_limit: 1, p_before: new Date().toISOString(), p_offset: 0 }
      : { p_limit: 1, p_before: new Date().toISOString(), p_since: null, p_offset: 0 };
    let state = await probeRpc(fn, body);
    if (state.code === '57014') {
      await new Promise(resolve => setTimeout(resolve, 1500));
      state = await probeRpc(fn, body);
    }
    expect(`existing function ${fn} still responds`, state.status === 200, `${state.status} ${state.code || 'no-code'}`);
  }

  const failures = results.filter(r => !r.ok);
  const payload = { url: URL_BASE, expectation: EXPECT, checked_at: new Date().toISOString(), failures: failures.length, results, functionStates, tableStates };

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    console.log(`probe ${URL_BASE} — expectation: ${EXPECT}`);
    const pad = Math.max(...results.map(r => r.name.length));
    for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(pad)}  ${r.detail}`);
    console.log(failures.length ? `\n${failures.length} expectation(s) failed` : '\nall expectations met');
  }
  if (failures.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(`probe-backend crashed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
