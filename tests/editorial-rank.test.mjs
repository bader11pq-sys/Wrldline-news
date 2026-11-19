import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { score, rank } = require('../editorial-rank.js');

const now = Date.parse('2026-11-19T12:00:00Z');
const base = { title: 'خبر تجريبي', summary: 'ملخص تجريبي طويل بما يكفي لاختبار الترتيب التحريري دون الاعتماد على بيانات حقيقية.', published_at: '2026-11-19T10:00:00Z', img: 'https://example.com/a.jpg' };

test('Gulf politics outranks a fresh entertainment story', () => {
  const politics = { ...base, cat: 'politics', country: 'SA', title: 'السعودية تعلن موقفاً جديداً بشأن أمن الخليج', summary: 'تفاصيل السياسة الجديدة وأثرها على المنطقة والملاحة في الخليج.' };
  const entertainment = { ...base, cat: 'entertainment', country: 'US', title: 'لعبة جديدة تنطلق عالمياً بعد انتظار طويل', summary: 'تفاصيل الإطلاق والمراجعات الأولى للعبة.' };
  assert.ok(score(politics, now) > score(entertainment, now) + 60);
  assert.equal(rank([entertainment, politics], now)[0], politics);
});

test('Gulf country and Gulf terms add weight without inventing relevance', () => {
  const plain = { ...base, cat: 'world', country: 'US', title: 'اجتماع دولي حول التجارة', summary: 'مناقشات حول قواعد التجارة العالمية.' };
  const gulf = { ...base, cat: 'world', country: 'AE', title: 'اجتماع دولي حول التجارة', summary: 'مناقشات حول قواعد التجارة العالمية.' };
  assert.ok(score(gulf, now) > score(plain, now));
  const term = { ...base, cat: 'world', country: 'US', title: 'تطورات الملاحة في مضيق هرمز', summary: 'تقارير عن حركة الشحن.' };
  assert.ok(score(term, now) > score(plain, now));
});

test('fresher stories beat older ones inside the same category', () => {
  const fresh = { ...base, cat: 'economy', country: 'SA', published_at: '2026-11-19T11:00:00Z' };
  const old = { ...base, cat: 'economy', country: 'SA', published_at: '2026-11-10T11:00:00Z' };
  assert.ok(score(fresh, now) > score(old, now));
});

test('rank is stable for equal scores and never mutates the input', () => {
  const a = { ...base, cat: 'culture', country: 'US', title: 'أ', summary: 'ملخص' };
  const b = { ...base, cat: 'culture', country: 'US', title: 'ب', summary: 'ملخص' };
  const input = [a, b];
  assert.deepEqual(rank(input, now), [a, b]);
  assert.deepEqual(input, [a, b]);
});

test('missing or malformed articles do not break ranking', () => {
  assert.equal(rank(null, now).length, 0);
  assert.ok(Number.isFinite(score({}, now)));
  assert.equal(rank([null, undefined], now).length, 2);
});

test('headline cleanup removes only a trailing outlet suffix', () => {
  const { cleanHeadline } = require('../editorial-rank.js');
  assert.equal(cleanHeadline('ختام المسابقة في موريتانيا اليوم - جريدة الرياض', 'الرياض'), 'ختام المسابقة في موريتانيا اليوم');
  assert.equal(cleanHeadline('OPEC+ keeps output steady | Reuters', 'Reuters'), 'OPEC+ keeps output steady');
  assert.equal(cleanHeadline('هل تنتهي الحرب - تحليل', 'الرياض'), 'هل تنتهي الحرب - تحليل');
  assert.equal(cleanHeadline('  عنوان   فيه مسافات  ', ''), 'عنوان فيه مسافات');
});

test('non-Arabic stories without a published translation are down-weighted', () => {
  const ar = { ...base, cat: 'politics', country: 'SA', title: 'السعودية تعلن موقفاً جديداً بشأن أمن الخليج', summary: 'تفاصيل السياسة الجديدة وأثرها على المنطقة.', lang: 'ar' };
  const en = { ...base, cat: 'politics', country: 'US', title: 'Ukraine strikes bridge again as talks continue', summary: 'Officials said the bridge was hit overnight, according to local media reports.', lang: 'en' };
  assert.ok(score(ar, now) > score(en, now) + 40);
  const translated = { ...en, hasTranslation: true, title: 'أوكرانيا تضرب الجسر مجدداً مع استمرار المحادثات' };
  assert.ok(score(translated, now) > score(en, now));
});

test('world catch-all sports and entertainment are treated as such for ranking only', () => {
  const sports = { ...base, cat: 'world', country: 'MY', title: 'رباع ماليزي يتوج بذهب ألعاب الكومنولث بعد منافسة قوية', summary: 'تفاصيل المنافسة والنتائج.' };
  const politics = { ...base, cat: 'world', country: 'US', title: 'اجتماع دولي حول قواعد التجارة العالمية', summary: 'مناقشات حول الرسوم والسلاسل.' };
  assert.ok(score(politics, now) > score(sports, now));
  assert.equal(sports.cat, 'world');
});

test('lead eligibility excludes sports, culture, entertainment and utility copy', () => {
  const { isLeadEligible } = require('../editorial-rank.js');
  const ok = { ...base, cat: 'politics', title: 'السعودية تعلن موقفاً جديداً بشأن أمن الخليج', summary: 'تفاصيل السياسة الجديدة وأثرها على المنطقة.' };
  assert.equal(isLeadEligible(ok), true);
  assert.equal(isLeadEligible({ ...ok, cat: 'sports' }), false);
  assert.equal(isLeadEligible({ ...ok, cat: 'culture' }), false);
  assert.equal(isLeadEligible({ ...ok, title: 'أسعار العملات العربية مقابل الريال السعودي اليوم' }), false);
  assert.equal(isLeadEligible({ ...ok, title: 'خبر قصير' }), false);
  assert.equal(isLeadEligible({ ...ok, summary: ok.title }), false);
});

test('headline cleanup strips platform suffixes that follow a separator', () => {
  const { cleanHeadline } = require('../editorial-rank.js');
  assert.equal(cleanHeadline('نمو: صفقتان خاصتان على أساس مكين - ارقام : اخبار ومعلومات سوق الأسهم السعودي - تاسي', 'أرقام'), 'نمو: صفقتان خاصتان على أساس مكين');
  assert.equal(cleanHeadline('البنك المركزي الروسي يرفع سعر صرف الروبل - صحيفة مال', 'مال'), 'البنك المركزي الروسي يرفع سعر صرف الروبل');
  assert.equal(cleanHeadline('هل تنتهي الحرب - تحليل مالي', 'الرياض'), 'هل تنتهي الحرب - تحليل مالي');
});
