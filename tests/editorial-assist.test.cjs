const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../editorial-assist.js'), 'utf8');

// The audit is pure: it never touches the DOM. Load the browser bundle with a
// minimal window stub and exercise the exported audit directly.
function load() {
  const window = {};
  const sandbox = {
    window,
    document: {
      readyState: 'complete',
      getElementById: () => null,
      addEventListener: () => {},
      createElement: () => ({ style: {}, dataset: {}, append() {}, addEventListener() {} })
    },
    Event: class { constructor(type) { this.type = type; } },
    Intl,
    setTimeout,
    clearTimeout,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'editorial-assist.js' });
  return window.WLEditorialAssist;
}

const assist = load();
const messages = result => result.issues.map(issue => issue.message).join(' | ');

test('clean news copy produces no high-severity issues', () => {
  const body = [
    'أعلنت وزارة الصحة، يوم الثلاثاء، تسجيل 1200 حالة جديدة، وقال المتحدث الرسمي إن «الوضع مستقر» في معظم المناطق.',
    'وأوضح المتحدث أن الفرق الميدانية رفعت وتيرة الفحص في المناطق الطرفية، بينما تستمر الحملة الوطنية حتى نهاية الشهر.',
    'ويأتي هذا الإعلان بعد أسبوعين من إطلاق خطة الاستجابة التي خصصت لها الحكومة 45 مليون ريال.',
    'وقالت الوزارة في بيان نشرته على موقعها إن الفرق ستواصل العمل الميداني خلال الأيام المقبلة، ودعت المواطنين إلى الالتزام بالإرشادات الوقائية ومراجعة المراكز عند ظهور الأعراض.'
  ].join('\n\n');
  const result = assist.audit('وزارة الصحة تعلن تسجيل 1200 حالة جديدة وتؤكد استقرار الوضع', body);
  assert.equal(result.issues.filter(issue => issue.level === 'high').length, 0, messages(result));
  assert.equal(result.stats.paragraphs, 4);
  assert.ok(result.stats.words > 60);
  assert.ok(result.stats.readingMinutes >= 1);
});

test('headline checks flag clickbait, shortness and exclamation marks', () => {
  const result = assist.audit('صادم!', 'نص قصير.');
  const text = messages(result);
  assert.match(text, /قصير جدًا/u);
  assert.match(text, /لغة إثارة/u);
  assert.match(text, /علامة التعجب/u);
});

test('long single-paragraph copy is flagged for structure', () => {
  const long = 'قال مسؤول إن الوضع تحت السيطرة. '.repeat(40);
  const result = assist.audit('مسؤول: الوضع تحت السيطرة في المناطق المتأثرة', long);
  assert.match(messages(result), /فقرة واحدة طويلة/u);
});

test('filler phrases and passive voice are reported', () => {
  const body = [
    'جدير بالذكر أن المشروع بدأ العام الماضي. وفي سياق متصل، تم إنجاز المرحلة الأولى.',
    'من الجدير بالذكر أن التمويل تأخر مرتين، وتم إعادة الهيكلة، وتم مراجعة الجدولة، وتم تعيين لجنة، وتم نقل المعدات إلى الموقع الجديد، وتم تعديل الخطة، وتم تحديث البيانات.',
    'وقال مدير المشروع إن «التأخير مؤقت» دون تحديد موعد جديد للافتتاح الرسمي.'
  ].join('\n\n');
  const result = assist.audit('تأخير جديد يضرب مشروع تطوير المنطقة الصناعية', body);
  const text = messages(result);
  assert.match(text, /حشو/u);
  assert.match(text, /المبني للمجهول/u);
});

test('stats stay consistent for empty input', () => {
  const result = assist.audit('', '');
  assert.equal(result.stats.words, 0);
  assert.equal(result.stats.readingMinutes, 1);
  assert.match(messages(result), /لا يوجد عنوان/u);
});
