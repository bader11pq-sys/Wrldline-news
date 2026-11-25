# WRLDLINE Phase 2 — site architecture

## Editorial promise

**WRLDLINE — الخبر. سياقه. أثره عليك.**

A focused Arabic newsroom for political and economic developments in the Arab region and globally. Its differentiator is not headline volume; it is the reader-facing explanation of why a story matters, what is supported by evidence, and what remains uncertain.

## Navigation hierarchy

1. **News:** الرئيسية، سياسة، اقتصاد، عاجل، أحدث الأخبار، الأكثر قراءة، الأرشيف.
2. **Understanding a story:** غرفة السياق، ميزان الروايات، أطلس التأثير.
3. **Reference:** الموضوعات، دليل المصادر، افهمها في دقيقة، مرآة التاريخ، الموسوعة التاريخية.
4. **Daily return:** الموجز اليومي، Shorts، النشرة المجانية.
5. **Trust and business:** عن الموقع، سياسة التحرير والتصحيح، الخصوصية، الشروط، للمعلنين، التواصل.

## Public page map

| Route | Purpose |
|---|---|
| `/` | Homepage: lead stories, latest coverage, topic filters, newsroom tools and newsletter CTA |
| `/news/` | Crawlable public news archive |
| `/news/{uuid}` | Standalone article page: summary, original source, verification context and reader impact |
| `/sections.html` | Canonical section directory; `/topics.html` redirects here |
| `/tags.html` | Public tag directory mapped to existing article categories; no invented tag counts |
| `/context.html` | Background and key actors for important files |
| `/balance.html` | Compare how different sources report the same event |
| `/impact.html` | Trace potential economic and social consequences |
| `/markets.html` | Market data and prices |
| `/map.html` | Geographic view of coverage |
| `/daily-briefing.html` | Daily world briefing |
| `/shorts.html` | Vertical short-form news experience |
| `/history*.html`, `/mirror.html` | Historical reference and comparisons |
| `/explainers.html`, `/promises.html` | Explain recurring concepts and track public commitments |
| `/sources.html` | Source directory and provenance |
| `/newsletter.html` | Confirmed free daily/weekly newsletter registration |
| `/advertise.html` | Sponsorship and advertising principles; no invented reach or rates |
| `/about.html`, `/contact.html`, `/privacy.html`, `/terms.html`, `/corrections.html` | Trust, contact and legal information |
| `/account.html`, `/admin.html`, `/audience.html` | Private account and editorial tools; excluded from public sitemap |

## Article experience

The public article page keeps the publisher's original summary and source link separate from WRLDLINE's explanatory layer:

- **ملخص الخبر:** concise attributed summary, not a copied full article.
- **قراءة WRLDLINE:** AI-assisted neutral synopsis.
- **وش يعني لك؟:** potential relevance to Arabic readers, only when supported by the source text.
- **ما الذي نراقبه تالياً؟:** a concrete indicator or development to follow; no invented dates or predictions.
- **سياق التحقق:** human review/evidence status remains distinct from AI analysis.

The impact and watch-next fields are optional. Legacy stories with no generated context do not show an empty or fabricated panel. The database migration is versioned, and new public RPCs preserve the old RPC signatures for backward compatibility.

## Editorial operating principle

RSS is discovery and attribution, not the product. Original WRLDLINE analysis, reporting and explainers should become the distinctive layer. No story receives a human-confirmed label solely because a model classified it or because multiple feeds repeated the same claim.
