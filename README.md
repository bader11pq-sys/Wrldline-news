# WRLDLINE NEWS

منصة إخبارية عربية/إنجليزية مبنية كواجهة ويب ثابتة، تقرأ الأخبار من Supabase REST API وتعرضها مع نسب المصدر وتاريخ النشر وروابط القراءة الأصلية.

## التشغيل

- افتح `index.html` عبر خادم ويب ثابت أو GitHub Pages. لا يوجد build step.
- يعتمد عرض الأخبار على جدول `articles` وجدول `article_translations` في Supabase.
- مفاتيح Supabase المنشورة في الواجهة يجب أن تكون Publishable/Anon فقط، مع تفعيل RLS.
- للتشغيل المحلي:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

## الصفحات العامة

- `index.html`: الصفحة الرئيسية والأخبار.
- `map.html`: الخريطة التفاعلية.
- `markets.html`: الأسواق والسلع والعملات.
- `daily-briefing.html`: الموجز اليومي.
- `history.html`: موسوعة التاريخ.
- `shorts.html`: موجز عمودي.
- `account.html`: الحساب وWRLDLINE PLUS.
- `about.html`: عن الموقع والمنهجية.
- `contact.html`: التواصل والتصحيحات والحقوق والشراكات.
- `privacy.html`: الخصوصية وملفات التخزين المحلي والقياس.
- `terms.html`: شروط الاستخدام.
- `corrections.html`: سياسة التصحيح وإزالة المحتوى المضلل/المكرر.
- `newsletter.html`: تسجيل الاهتمام بالنشرة.
- `admin.html`: لوحة تحرير محمية بـ Supabase Auth، ومستبعدة من القياس.

## قواعد العرض التحريري

- كل بطاقة خبر تعرض اسم المصدر ورابط المصدر وتاريخ `published_at`.
- لا يُستخدم `received_at` كتاريخ نشر. عند غياب تاريخ النشر تظهر «تاريخ النشر غير متوفر».
- إذا اختلف اسم المصدر عن نطاق الرابط، يظهر النطاق بجوار الاسم.
- شارات المحتوى: عاجل، تحليل، رأي، محتوى مدعوم، حصري لدى المصدر، غير مترجم، تم التصحيح.
- المحتوى المدعوم يعرض اسم الراعي ورابطه إن توفر، مع إفصاح داخل نافذة الخبر.
- الترجمة غير المكتملة أو المختلطة لا تُعرض كترجمة نهائية؛ تظهر شارة «الترجمة قيد الإعداد» أو «غير مترجم».
- `editorial_status` المحجوبة من العرض العام: `rejected`, `removed`, `misleading`, `duplicate`, `retracted`.
- يتم منع تكرار الأخبار حسب URL والعنوان+المصدر، مع منع تكرار موضوعات الموجز اليومي.

## لوحة التحرير

أضيفت حقول إلى `admin.html` و`admin.js`:

- `content_type`: `news` / `analysis` / `opinion` / `sponsored`.
- `sponsor_name` و`sponsor_url` للمحتوى المدعوم.
- `correction_note` و`corrected_at` لملاحظة تصحيح ظاهرة.

## القياس والخصوصية

- `analytics-config.js` افتراضيًا فارغ: لا GA4 ولا إرسال أحداث.
- `analytics.js` لا يرسل شيئًا قبل موافقة الزائر، ويحجب البريد/الهاتف/نص البحث، ويستخدم معرّف جلسة عشوائيًا.
- الأحداث: `page_view`, `view_article`, `outbound_source_click`, `search`, `market_view`, `newsletter_signup`, `sponsor_contact`, `plus_interest`.
- لتفعيل GA4 ضع `G-XXXXXXXXXX` في `analytics-config.js` وأعد الاختبار.
- `admin.html` لا يحمّل طبقة القياس.
- راجع `docs/analytics-test-report.md` قبل الإطلاق.

## النماذج وجداول Supabase

- `contact.html` يكتب إلى `contact_messages`.
- `newsletter.html` يكتب إلى `newsletter_subscribers`.
- كلاهما يستخدم مفتاح Publishable فقط، مع RLS تسمح بالإضافة العامة ولا تسمح بالقراءة العامة.
- موضوعات التواصل: `general`, `correction`, `copyright`, `sponsorship`, `privacy`, `technical`.

## Service Worker

- يخزن غلاف الموقع وصفحات السياسات وملفات القياس والنماذج.
- يخزن استجابات `articles` و`daily_news_briefings` مع network-first.
- عند انقطاع الشبكة وعدم وجود نسخة مخزنة يعيد HTTP 503، لا قائمة `[]`، حتى تظهر حالة فشل قابلة لإعادة المحاولة.
- حدّث `CACHE_NAME` و`workerBuild` عند تغيير الأصول.

## الاختبارات

```bash
python3 tests/audit_flow.py                  # المسار الكامل على سطح المكتب
python3 tests/layout_failure_briefing.py     # 320/375/390، فشل الشبكة، الموجز، لوحة التحرير
python3 tests/mobile_analytics.py            # وكيل iPhone وأحداث القياس
python3 tests/consent.py                     # القبول/الرفض قبل القياس
python3 tests/image_fallback.py              # بديل الصورة عند الفشل
python3 tests/service_worker_offline.py      # فشل SW دون قائمة فارغة
```

نتائج آخر تشغيل:

- 40/40 بطاقة في الرئيسية تعرض المصدر والتاريخ.
- 320/375/390px: لا تجاوز أفقي.
- الموجز: 17 عنوانًا فريدًا بعد منع التكرار.
- الأسواق: لا placeholders بعد انتهاء المهلة.
- القياس: وصلت الأحداث الثمانية في اختبار سطح المكتب، و`page_view`/`view_article` على الجوال.
- الموافقة: 0 أحداث قبل الموافقة، و0 بعد الرفض.

## تقارير داخلية

- `docs/audit-fixes-7.md`: إغلاق العيوب السبعة.
- `docs/editorial-sample-30.md` و`docs/editorial-sample-30.csv`: عينة 30 خبرًا والأخطاء والإصلاحات.
- `docs/compliance-initial-checklist.md`: قائمة الامتثال والعناصر غير المحسومة.
- `docs/analytics-test-report.md`: تقرير اختبار القياس.

## تنبيه تشغيلي وأمني

لا تضع مفاتيح الخدمة السرية أو مفاتيح Gemini أو Telegram في ملفات الواجهة أو المستودع. استخدم GitHub Actions Secrets أو بيئة خادم خاصة. لا تُعرض أسعار أسواق ثابتة على أنها أسعار مباشرة؛ يلزم مزود بيانات مالي مرخص وتحديث موثق. الصفحات القانونية الحالية مسودات معلوماتية وليست استشارة قانونية؛ يلزم اعتماد محامٍ قبل التقديم أو البيع.
