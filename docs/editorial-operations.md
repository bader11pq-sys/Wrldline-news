# إجراءات التحرير والتصحيح والتكرار

## 1. حالات النشر

- `published`: يظهر للعامة.
- `review`: يحتاج مراجعة بشرية، ولا يظهر للعامة.
- `rejected`: مرفوض.
- `removed`: مسحوب.
- `misleading`: مضلل.
- `duplicate`: مكرر.
- `retracted`: مسحوب مع تصحيح.

الواجهة تحجب `rejected`, `removed`, `misleading`, `duplicate`, `retracted`.

## 2. تنظيف العناوين العامة

في 14 نوفمبر 2026 حُوّل 121 صفًا منشورًا إلى `review` لأن عناوينها عناوين RSS عامة وليست أخبارًا قابلة للنشر، مثل:

- `- Reuters`
- `Tech Now`
- `Tech Life`
- `Business`
- `Politics`
- `Quickreads: Get quick information on latest, top breaking news`
- `Al Jazeera - Al Jazeera`
- `Kuna News Agency - Kuwait - KUNA`

لم تُحذف الصفوف؛ يمكن للمحرر استعادتها بتغيير `editorial_status` إلى `published` بعد استبدال العنوان بعنوان فعلي.

## 3. منع التكرار

- على مستوى الواجهة: منع تكرار URL نفسه، ومنع تكرار `source_name + normalized_title`.
- على مستوى الموجز: بصمة عربية موحّدة للعناوين، مع منع تكرار القصة بين القصص الرئيسية والأقسام.
- لا تُدمج القصص المختلفة من مصادر متعددة تلقائيًا؛ قد تكون زوايا مختلفة. يلزم قرار تحريري.

استعلام مراجعة العناوين العامة:

```sql
select id, title, source_name, url, published_at
from public.articles
where editorial_status = 'published'
  and lower(btrim(title)) in ('- reuters','business','politics','tech now','tech life','al jazeera - al jazeera','kuna news agency - kuwait - kuna')
order by published_at desc
limit 100;
```

استعلام عرض الصفوف المحجوبة للمراجعة:

```sql
select id, title, source_name, url, editorial_status, verification_note, published_at
from public.articles
where editorial_status = 'review'
order by published_at desc
limit 100;
```

## 4. التصحيح

1. استقبل البلاغ من `contact.html` بموضوع «تصحيح خبر أو خطأ تحريري».
2. تحقق من الرابط والمصدر الأصلي.
3. إذا ثبت الخطأ: عدّل النص، وأضف `correction_note` و`corrected_at` من لوحة التحرير.
4. إذا كان الخطأ جوهريًا: غيّر `editorial_status` إلى `misleading` أو `retracted` وأضف سببًا.
5. لا تحذف سجل التدقيق قبل انتهاء الحاجة إليه.
6. حدّث `corrections.html` أو سجلًا عامًا إذا كان التصحيح جوهريًا.

## 5. الترجمة

- الترجمة المختلطة أو المطابقة للنص الأصلي لا تُعرض كترجمة نهائية.
- عند عدم اكتمال الترجمة: يظهر النص الأصلي مع شارة «الترجمة قيد الإعداد» أو «غير مترجم».
- الأخطاء الفردية في العينة تحتاج اعتماد محرر بشري؛ راجع `docs/editorial-sample-30.md`.

## 6. الإعلان والرعاية

- المحتوى المدعوم يجب أن يحمل `content_type='sponsored'`.
- يجب إدخال `sponsor_name`، و`sponsor_url` إن وجد.
- لا يُنشر محتوى مدعوم دون اتفاق مكتوب وإفصاح.
- لا تُمنح الرعاية حق تعديل الأخبار التحريرية غير المدعومة.
