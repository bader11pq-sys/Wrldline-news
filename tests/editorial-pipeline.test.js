const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

// Native Node 22.13+ only. Strip syntax in memory; do not import Edge entrypoints,
// Deno, SDKs, credentials, providers, or any package that could perform I/O.
const ROOT = path.resolve(__dirname, '..');
const FILES = {
  ingest: 'supabase/functions/wrldline-news-ingest/index.ts',
  translate: 'supabase/functions/translate-articles/index.ts',
  briefing: 'supabase/functions/daily-global-briefing/index.ts',
};
const sources = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key,
  stripTypeScriptTypes(fs.readFileSync(path.join(ROOT, file), 'utf8'), { mode: 'strip' })]));
function extract(source, name) {
  const pattern = new RegExp('^(?:async )?function ' + name + '\\(', 'm');
  const start = source.search(pattern);
  assert.notEqual(start, -1, 'production function exists: ' + name);
  const remainder = source.slice(start);
  const next = remainder.slice(remainder.indexOf('\n') + 1).search(/^(?:(?:async )?function |(?:const|let|var) |Deno\.serve\b)/m);
  const end = next === -1 ? remainder.length : remainder.indexOf('\n') + 1 + next;
  return remainder.slice(0, end);
}
function load(key, names, globals = {}) {
  const context = vm.createContext({ ...globals });
  vm.runInContext(names.map(name => extract(sources[key], name)).join('\n'), context);
  return context;
}
const ingest = load('ingest', ['translationGenerationState']);
const translate = load('translate', ['translationGenerationState', 'saveMachineDraft']);
const briefing = load('briefing', [
  'knownEditorialLanguage', 'currentReviewStamp', 'humanTranslationState', 'currentHumanTrust',
  'briefingTrustHint', 'publicBriefingSource', 'briefingVerificationNotice', 'promptBriefingStories',
  'refreshedBriefingSource',
  'classifyForSampling', 'qualityScore', 'normalizeTitle', 'chooseStories', 'attachSources', 'attachTrendSources',
]);
const NOW = Date.parse('2026-11-15T04:00:00Z');
const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';
const REVIEWER_ID = '99999999-9999-4999-8999-999999999999';
const article = extra => ({
  id: ARTICLE_ID, title: 'A sufficiently distinct world news headline', summary: 'Reported source text.',
  ai_summary: 'MACHINE CONTEXT MUST NOT REPLACE HUMAN REVIEWED SOURCE TEXT',
  source_name: 'Fixture News', url: 'https://example.invalid/story', published_at: '2026-11-15T03:00:00Z',
  category: 'world', lang: 'ar', source_language: 'en', language_detection: 'declared',
  editorial_trust_status: 'confirmed', trust_needs_review: false,
  trust_reviewed_at: '2026-11-15T03:30:00Z', trust_reviewed_by: REVIEWER_ID,
  human_translation_status: 'reviewed', human_translation_reviewed_at: '2026-11-15T03:20:00Z',
  human_translation_reviewed_by: REVIEWER_ID,
  verification: 'unconfirmed', verification_independent_count: 2, verification_source_count: 3,
  trust_review_note: 'PRIVATE TRUST NOTE', human_translation_note: 'PRIVATE TRANSLATION NOTE',
  verification_note: 'PRIVATE LEGACY NOTE',
  ...extra,
});
function attached(row, confidence = 'confirmed') {
  return briefing.attachSources([{ headline: 'Headline', summary: 'Attributed account', confidence,
    source_ids: ['source_1'] }], new Map([['source_1', row]]), NOW)[0];
}

for (const [key, source] of Object.entries(sources)) {
  test(key + ' entrypoint passes offline TypeScript stripping and JavaScript syntax compilation', () => {
    // Compile but never evaluate the entrypoint; module imports are not resolved.
    new vm.Script(source.replace(/^import .*;?\s*$/gm, ''), { filename: FILES[key] });
  });
}

test('ingest and translator use exactly the same generation-state decision', () => {
  assert.equal(extract(sources.ingest, 'translationGenerationState').trim(),
    extract(sources.translate, 'translationGenerationState').trim());
  assert.match(sources.ingest, /translationGenerationState\(existing\)\s*===\s*["']missing/);
  assert.match(sources.translate, /translationGenerationState\(existing\.data\)/);
});

for (const [name, row, expected] of [
  ['missing row', null, 'missing'],
  ['incomplete draft', { title: 'Title', summary: ' ', translation_status: 'review' }, 'missing'],
  ['complete machine review without optional AI context', { title: 'Title', summary: 'Summary', translation_status: 'review', translation_source: 'machine_draft', ai_summary: '' }, 'awaiting_human_review'],
  ['complete nonpublished legacy draft', { title: 'Title', summary: 'Summary', translation_status: 'draft' }, 'awaiting_human_review'],
  ['rejected complete text', { title: 'Title', summary: 'Summary', translation_status: 'rejected' }, 'rejected'],
  ['rejected incomplete text', { title: '', summary: '', translation_status: 'rejected' }, 'rejected'],
  ['legacy published text with no human review stamps', { title: 'Title', summary: 'Summary', translation_status: 'published' }, 'already_translated'],
  ['incomplete legacy publication is not automatically replaced', { title: '', translation_status: 'published' }, 'already_translated'],
]) {
  test(name + ' is not confused with missing generation', () => {
    for (const context of [ingest, translate]) assert.equal(context.translationGenerationState(row), expected);
  });
}

test('the actual ingest scan skips complete review/rejected rows before bounded generation slots', async () => {
  const recent = new Date().toISOString();
  const rows = Array.from({ length: 15 }, (_, i) => ({ id: 'review-' + i, title: 'Urgent headline', lang: 'en', published_at: recent,
    article_translations: [{ lang: 'ar', title: 'عنوان', summary: 'ملخص', translation_status: 'review' }] }));
  rows.push({ id: 'reject', title: 'Rejected headline', lang: 'en', published_at: recent,
    article_translations: [{ lang: 'ar', translation_status: 'rejected' }] });
  rows.push({ id: 'missing', title: 'Untranslated headline', lang: 'en', published_at: recent, article_translations: [] });
  const requests = [];
  let generationCalls = 0;
  const fakeDb = async (url, options = {}) => {
    requests.push({ url, options });
    return { ok: true, json: async () => url === 'rpc/claim_translation_worker' ? true : url.startsWith('articles?') ? rows : [] };
  };
  const context = load('ingest', ['translationGenerationState', 'runTranslation'], {
    URLSearchParams, AbortSignal, SUPABASE_URL: 'https://example.invalid', DB_HEADERS: {}, dbRequest: fakeDb,
    beginRun: async () => 'fixture-run', updateRun: async () => {},
    fetch: async (url, options) => {
      const ids = JSON.parse(options.body).article_ids;
      assert.deepEqual(ids, ['missing']);
      generationCalls++;
      rows.at(-1).article_translations.push({ lang: 'ar', title: 'عنوان', summary: 'ملخص', translation_status: 'review' });
      return { ok: true, json: async () => ({ results: [{ id: 'missing', status: 'awaiting_human_review', generated: true }] }) };
    },
  });
  const result = await context.runTranslation();
  assert.equal(result.selected, 1);
  assert.equal(result.generated, 1);
  assert.equal(result.awaiting_human_review, 1);
  assert.equal(result.already_translated, 0);
  const nextRun = await context.runTranslation();
  assert.equal(nextRun.selected, 0);
  assert.equal(nextRun.generated, 0);
  assert.equal(generationCalls, 1, 'persisted complete review draft is not generated a second time');
  assert.equal(requests.at(-1).url, 'rpc/release_translation_worker');
});

function mockDraftDb(row) {
  let filters = [], draft, ignoreDuplicates = false;
  const query = {
    update(value) { draft = value; return this; },
    upsert(value, options) { draft = value; ignoreDuplicates = options.ignoreDuplicates; return this; },
    eq(key, value) { filters.push(record => record[key] === value); return this; },
    neq(key, value) { filters.push(record => record[key] !== value); return this; },
    select() { return this; },
    async maybeSingle() {
      if (ignoreDuplicates && row) return { data: null, error: null };
      if (row && filters.every(filter => filter(row))) { Object.assign(row, draft); return { data: { id: row.id }, error: null }; }
      if (!row && ignoreDuplicates) return { data: { id: 'new' }, error: null };
      return { data: null, error: null };
    },
  };
  return { from(table) { assert.equal(table, 'article_translations'); return query; } };
}
for (const status of ['rejected', 'published']) {
  test('concurrent ' + status + ' cannot be overwritten by the actual machine save helper', async () => {
    const row = { id: 'translation', translation_status: status, title: 'Human decision' };
    const saved = await translate.saveMachineDraft(mockDraftDb(row), { id: row.id, translation_status: 'review' }, { translation_status: 'review', title: 'Machine replacement' });
    assert.equal(saved.data, null);
    assert.equal(row.translation_status, status);
    assert.equal(row.title, 'Human decision');
  });
  test('concurrent ' + status + ' insert is preserved, not upserted', async () => {
    const row = { id: 'translation', translation_status: status };
    const saved = await translate.saveMachineDraft(mockDraftDb(row), null, { translation_status: 'review' });
    assert.equal(saved.data, null);
    assert.equal(row.translation_status, status);
  });
}

test('legacy unconfirmed plus two sources is not confirmed, even if AI asks for confirmation', () => {
  const source = article({ editorial_trust_status: 'unconfirmed', trust_needs_review: true });
  assert.equal(attached(source).confidence, 'reported');
  assert.equal(attached(source).sources[0].verification, 'unconfirmed');
  // Reproduce the old attachSources counterexample shape exactly as well.
  assert.equal(attached({ id: ARTICLE_ID, verification: 'unconfirmed', independent_sources: 2 }).confidence, 'reported');
});
for (const verification of ['multi', 'confirmed', 'official_confirmed', 'field_confirmed']) {
  test('legacy ' + verification + ' without structured human review never confirms', () => {
    assert.equal(attached(article({ verification, editorial_trust_status: undefined, trust_needs_review: undefined })).confidence, 'reported');
  });
}

test('valid current human trust and applicable translation review confirm cited source status', () => {
  const result = attached(article());
  assert.equal(result.confidence, 'confirmed');
  assert.equal(result.confidence_basis, 'cited_source_human_review_only');
  assert.equal(result.sources[0].human_review_current, true);
  assert.equal(result.sources[0].translation_review, 'reviewed');
});
for (const [name, extra] of [
  ['stale trust', { trust_needs_review: true }],
  ['missing trust reviewer', { trust_reviewed_by: null }],
  ['missing trust timestamp', { trust_reviewed_at: null }],
  ['future trust', { trust_reviewed_at: '2026-11-16T00:00:00Z' }],
  ['invalid trust timestamp', { trust_reviewed_at: 'invalid' }],
  ['pending translation despite old stamps', { human_translation_status: 'pending' }],
  ['translated marked not required', { human_translation_status: 'not_required' }],
  ['missing translation reviewer', { human_translation_reviewed_by: null }],
  ['missing translation timestamp', { human_translation_reviewed_at: null }],
  ['future translation review', { human_translation_reviewed_at: '2026-11-16T00:00:00Z' }],
  ['translation review later than trust assessment', { human_translation_reviewed_at: '2026-11-15T03:40:00Z' }],
  ['unknown recorded source language', { source_language: 'unknown', human_translation_status: 'not_required' }],
  ['missing recorded source language', { source_language: null, human_translation_status: 'not_required' }],
  ['unknown language detection', { lang: 'en', language_detection: 'unknown', human_translation_status: 'pending' }],
]) {
  test(name + ' cannot confirm a briefing story', () => assert.equal(attached(article(extra)).confidence, 'reported'));
}

test('known original-source language is required to bypass translation review', () => {
  const original = article({ lang: 'en-US', source_language: 'en', human_translation_status: 'pending',
    human_translation_reviewed_at: null, human_translation_reviewed_by: null });
  assert.equal(attached(original).confidence, 'confirmed');
  assert.equal(attached(original).sources[0].translation_review, 'original_source');
  assert.equal(attached({ ...original, source_language: null }).confidence, 'reported');
  assert.equal(attached({ ...original, language_detection: 'conflict' }).confidence, 'reported');
});

test('a reviewed citation cannot certify mixed unreviewed claims; disputed status is unverified', () => {
  const sources = new Map([['source_1', article()], ['source_2', article({ id: 'second', trust_needs_review: true })]]);
  const items = [{ headline: 'Merged story', summary: 'Mixed accounts', confidence: 'confirmed', source_ids: ['source_1', 'source_2'] }];
  assert.equal(briefing.attachSources(items, sources, NOW)[0].confidence, 'reported');
  assert.equal(attached(article({ editorial_trust_status: 'disputed' })).confidence, 'unverified');
  assert.equal(attached(article(), 'unverified').confidence, 'unverified');
  assert.equal(attached(article(), 'developing').confidence, 'developing');
});

test('post-generation revalidation does not certify edited or newly withdrawn sources', () => {
  const original = article();
  assert.equal(briefing.refreshedBriefingSource(original, null), null);
  const changed = article({ summary: 'Changed during generation', trust_reviewed_at: '2026-11-15T03:50:00Z' });
  const snapshot = briefing.refreshedBriefingSource(original, changed);
  assert.equal(attached(snapshot).confidence, 'reported');
  assert.equal(changed.trust_needs_review, false, 'only local assessment changes, not the current row');
  assert.equal(attached(briefing.refreshedBriefingSource(original, article({ human_translation_status: 'pending' }))).confidence, 'reported');
  assert.equal(attached(briefing.refreshedBriefingSource(original, article())).confidence, 'confirmed');
});

test('unresolved or withdrawn references cannot leave a merged story falsely confirmed', () => {
  const items = [{ headline: 'Merged story', summary: 'Mixed accounts', confidence: 'confirmed', source_ids: ['source_1', 'source_withdrawn'] }];
  assert.equal(briefing.attachSources(items, new Map([['source_1', article()]]), NOW)[0].confidence, 'unverified');
});

test('stale evidence counts do not override a current human assessment', () => {
  const source = article({ verification: 'multi', verification_independent_count: 0, verification_source_count: 0, verification_conflict_count: 9 });
  assert.equal(attached(source).confidence, 'confirmed');
  assert.equal(attached(source).sources[0].evidence_counts_context_only, true);
});

test('actual prompt projection and attached sources exclude reviewer IDs and all internal notes', () => {
  const source = article();
  const stories = briefing.chooseStories([source]);
  const prompt = JSON.stringify(briefing.promptBriefingStories(stories));
  const output = JSON.stringify(attached(source));
  const trends = JSON.stringify(briefing.attachTrendSources([{ title: 'Trend', analysis: 'Analysis', source_ids: ['source_1'] }], new Map([['source_1', source]]), NOW));
  for (const text of [prompt, output, trends]) {
    assert.ok(!text.includes(REVIEWER_ID));
    assert.doesNotMatch(text, /PRIVATE|reviewed_by|review_note|translation_note|verification_note/);
  }
  assert.ok(!prompt.includes(ARTICLE_ID));
  assert.ok(prompt.includes('source_1'));
  assert.ok(prompt.includes('Reported source text.'));
  assert.ok(!prompt.includes(source.ai_summary));
  assert.ok(output.includes(ARTICLE_ID), 'public article identity remains usable for canonical links');
});

test('uncertainty notices cover all-unreviewed and mixed citations and never certify the machine summary', () => {
  const reviewed = briefing.publicBriefingSource(article(), NOW);
  const unreviewed = briefing.publicBriefingSource(article({ trust_needs_review: true }), NOW);
  assert.match(briefing.briefingVerificationNotice([unreviewed]), /لا تثبت/);
  assert.match(briefing.briefingVerificationNotice([reviewed, unreviewed]), /بعض المواد/);
  for (const citations of [[reviewed], [unreviewed], [reviewed, unreviewed], []]) {
    assert.match(briefing.briefingVerificationNotice(citations), /مولدان آلياً/);
    assert.match(briefing.briefingVerificationNotice(citations), /لا يمثلان تحققاً مستقلاً/);
  }
});

test('entrypoint trust projection and opaque prompt references are wired, with cron verification retained', () => {
  assert.match(sources.briefing, /trust_reviewed_at,trust_reviewed_by,human_translation_status,human_translation_reviewed_at,human_translation_reviewed_by/);
  assert.match(sources.briefing, /JSON\.stringify\(promptStories\)/);
  assert.match(sources.briefing, /sourceMap\.set\(promptStories\[index\]\.id, row\)/);
  assert.match(sources.briefing, /briefingVerificationNotice\(citedSources\)/);
  assert.match(sources.briefing, /select\(BRIEFING_ARTICLE_COLUMNS\)\.in\("id", stories\.map/);
  assert.match(sources.briefing, /refreshedBriefingSource\(rowsById\.get\(story\.id\), currentById\.get\(story\.id\)\)/);
  assert.match(sources.ingest, /rpc\/verify_wrldline_cron_secret/);
  assert.match(sources.ingest, /x-wrldline-cron-secret/);
  assert.match(sources.briefing, /x-wrldline-briefing-secret/);
  assert.match(sources.briefing, /SHA-256/);
});
