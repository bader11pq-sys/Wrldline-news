# Source reachability findings — 25 Nov 2026

Method: `node scripts/source-reachability-probe.mjs` (manual, read-only; no database writes, no content stored, not scheduled; this is not ingestion). It probed the 80 feeds in `source-catalog.json` from a cloud datacenter IP.

Caveat: HTTP 403 results are often bot/datacenter blocking and do not prove the feed is dead for the production worker. 404/410 and HTML-instead-of-feed are stronger evidence. I could not query the production `source_freshness_metrics` table, so the 206 flagged sources reported in TODO.md are **not** reproduced here; the 80 catalog feeds are a subset sample.

## Result tally

- `ok`: 38
- `blocked_or_auth`: 14
- `html_not_feed`: 11
- `gone`: 10
- `server_error`: 3
- `ok_redirected_host`: 2
- `client_error`: 1
- `not_a_feed`: 1

## Likely broken URLs (404/410 — replace or deactivate)

- الاقتصادية — www.aleqt.com
- فوربس الشرق الأوسط — www.forbesmiddleeast.com
- مال — maaal.com
- مباشر — www.mubasher.info
- البيان — www.albayan.ae
- الإمارات اليوم — www.emaratalyoum.com
- وكالة الأنباء القطرية — qna.org.qa
- وفا الفلسطينية — www.wafa.ps
- كووورة — www.kooora.com
- الطبي — www.altibbi.com

## Return HTML, not a feed (feed URL changed or needs a different endpoint)

- وكالة الأنباء السعودية واس — www.spa.gov.sa
- كونا — www.kuna.net.kw
- أرقام — www.argaam.com
- CNBC عربية — www.cnbcarabia.com
- وكالة أنباء الإمارات — www.wam.ae
- عكاظ — www.okaz.com.sa
- سبق — sabq.org
- المدينة — www.al-madina.com
- شفق نيوز — shafaq.com
- روداو عربية — www.rudawarabia.net
- في الجول — www.filgoal.com
- ويب طب — www.webteb.com

## Server errors / client errors (retest before acting)

- وكالة الأنباء العُمانية — omannews.gov.om (HTTP 502)
- الرياض — www.alriyadh.com (HTTP 502)
- سبورت 360 — news.google.com (HTTP 503)
- سودان تريبيون — sudantribune.net (HTTP 415)

## 403 from the probe location (re-test from the production worker)

- العربية — www.alarabiya.net
- فرانس 24 عربي — www.france24.com
- هسبريس — www.hespress.com
- رؤيا — royanews.tv
- الشرق للأعمال — asharqbusiness.com
- الخليج — www.alkhaleej.ae
- الجزيرة السعودية — www.al-jazirah.com
- مكة — makkahnewspaper.com
- الأهرام — gate.ahram.org.eg
- مصراوي — www.masrawy.com
- إيلاف — elaph.com
- الأخبار اللبنانية — al-akhbar.com
- المصدر أونلاين — almasdaronline.com
- France 24 — www.france24.com

## Key diagnosis

The existing freshness monitor cannot distinguish a broken source from the deliberate ingestion pause: once polling stops, every source becomes `attempt_overdue`/`received_stale`. The 158 'late' sources in TODO.md are therefore expected to be mostly pause artefacts. `diagnose.mjs` now separates `paused_expected` from true defects (`never_succeeded`, `last_attempt_failed`, `stale_source`), and the admin panel shows both. Re-run against production to get the real defect count.
