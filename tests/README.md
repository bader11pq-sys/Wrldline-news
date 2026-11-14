# اختبارات WRLDLINE

تشغيل خادم الموقع أولًا:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

ثم من جذر المستودع:

```bash
python3 tests/audit_flow.py
python3 tests/layout_failure_briefing.py
python3 tests/mobile_analytics.py
python3 tests/consent.py
python3 tests/image_fallback.py
python3 tests/service_worker_offline.py
```

المتطلبات:

- Python 3.10+
- Playwright Python
- Chromium نظامي في `/usr/bin/chromium`، أو عدّل `executable_path` في السكربتات.

ملاحظات:

- السكربتات تستخدم خادمًا محليًا ونقطة قياس وهمية؛ لا تنشئ صفوفًا في قاعدة الإنتاج.
- `service_worker_offline.py` يعترض طلبات Supabase ويتحقق من ظهور حالة الفشل.
- `mobile_analytics.py` يستخدم وكيل iPhone 13 من Playwright.
