/* WRLDLINE site sections registry.
 * One source of truth for the reader-facing section hierarchy: the main news
 * desks, their subsections, and the knowledge/analysis desks that sit beside
 * the newsroom. Every reader-facing destination appears exactly once so the
 * Arabic and English interfaces cannot drift apart.
 *
 * Works in the browser (window.WRLDLINE_SITE_SECTIONS) and in Node
 * (module.exports) so sections.html can be generated from the same data.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WRLDLINE_SITE_SECTIONS = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "wrldline-sections-2";

  /* Main news desks. Each child is a real destination (a published section
   * page or a desk page), never a duplicate of its parent. */
  const NEWS_SECTIONS = [
    {
      key: "politics",
      ar: "السياسة والعالم",
      en: "Politics & World",
      href: "/section/politics",
      arIntro: "القرار السياسي والدبلوماسية والانتخابات، والتطورات الدولية التي تمسّ المنطقة.",
      enIntro: "Political decisions, diplomacy, elections, and international developments that affect the region.",
      children: [
        { key: "world", href: "/section/world", ar: "حول العالم", en: "Around the world", arNote: "أحداث دولية تتجاوز حدود دولة واحدة.", enNote: "International events that cross borders." },
        { key: "security", href: "/section/security", ar: "الأمن والدفاع", en: "Security & defence", arNote: "النزاعات والعمليات العسكرية والاتفاقيات الأمنية.", enNote: "Conflicts, military operations and security agreements." }
      ]
    },
    {
      key: "economy",
      ar: "الاقتصاد والطاقة",
      en: "Economy & Energy",
      href: "/section/economy",
      arIntro: "النفط والغاز والتجارة والشحن والأسواق والموازنات، بأرقام منسوبة إلى مصادرها.",
      enIntro: "Oil, gas, trade, shipping, markets and budgets, with every figure attributed to its source.",
      children: [
        { key: "markets", href: "markets.html", ar: "الأسواق العالمية", en: "World markets", arNote: "مؤشرات وأسعار محدّثة مع مصدرها.", enNote: "Live indices and prices with their source." },
        { key: "economy-dashboards", href: "economy.html", ar: "لوحات الذكاء الاقتصادي", en: "Economy dashboards", arNote: "بيانات الاقتصاد الكلي في لوحات مقارنة.", enNote: "Macroeconomic data in comparable dashboards." }
      ]
    },
    {
      key: "rights",
      ar: "الحقوق والحريات",
      en: "Rights & Freedoms",
      href: "/section/rights",
      arIntro: "الحريات المدنية والسياسية والعدالة والقانون، مع فصل الاتهام عن الحكم.",
      enIntro: "Civil and political freedoms, justice and the law, keeping accusation separate from verdict.",
      children: [
        { key: "rights-desk", href: "rights.html", ar: "مكتب الحقوق والحريات", en: "Rights desk", arNote: "الملفات والأدلة والتصحيحات.", enNote: "Case files, guides and corrections." },
        { key: "rights-cases", href: "rights-cases/index.html", ar: "ملفات القضايا", en: "Case files", arNote: "ملفات مرجعية موثقة بالروابط.", enNote: "Reference case files with linked evidence." },
        { key: "rights-guides", href: "rights.html#rightsGuides", ar: "الأدلة الحقوقية المبسّطة", en: "Plain-language rights guides", arNote: "ما يقوله القانون وما يعنيه عمليًا.", enNote: "What the law says and what it means in practice." }
      ]
    },
    {
      key: "tech",
      ar: "التقنية والعلوم",
      en: "Technology & Science",
      href: "/section/tech",
      arIntro: "التقنية والذكاء الاصطناعي والبنية الرقمية والبحث العلمي، وتأثيرها على المنطقة.",
      enIntro: "Technology, AI, digital infrastructure and research, and their effect on the region.",
      children: [
        { key: "science", href: "/section/science", ar: "العلوم", en: "Science", arNote: "البحث والاكتشافات بلغة مفهومة.", enNote: "Research and discoveries in plain language." },
        { key: "ai-governance", href: "context.html#ai-governance", ar: "خلفية: حوكمة الذكاء الاصطناعي", en: "Background: AI governance", arNote: "السياق المرجعي لسياسات الذكاء الاصطناعي.", enNote: "Reference context for AI policy." }
      ]
    },
    {
      key: "society",
      ar: "المجتمع والثقافة والرياضة",
      en: "Society, Culture & Sport",
      href: "/section/society",
      arIntro: "التعليم والصحة والعمل والثقافة والرياضة، وكيف تؤثر في حياة الناس اليومية.",
      enIntro: "Education, health, work, culture and sport, and how they shape daily life.",
      children: [
        { key: "culture", href: "/section/culture", ar: "الثقافة", en: "Culture", arNote: "الفنون والكتب والهوية بعيداً عن أخبار المشاهير.", enNote: "Arts, books and identity, away from celebrity news." },
        { key: "sports", href: "/section/sports", ar: "الرياضة", en: "Sport", arNote: "المنافسات والفرق والأحداث الرياضية.", enNote: "Competitions, teams and sporting events." },
        { key: "health", href: "/section/health", ar: "الصحة", en: "Health", arNote: "الصحة العامة والسياسات وحق الوصول إلى الرعاية.", enNote: "Public health, policy and access to care." }
      ]
    },
    {
      key: "environment",
      ar: "البيئة والمناخ",
      en: "Environment & Climate",
      href: "/section/environment",
      arIntro: "المناخ والطاقة النظيفة والمياه والكربون، وأثر السياسات البيئية على الاقتصاد الخليجي.",
      enIntro: "Climate, clean energy, water and carbon, and how environmental policy lands on Gulf economies.",
      children: []
    }
  ];

  /* Knowledge and analysis desks. These are not article categories; they are
   * editorial products that sit beside the newsroom. */
  const KNOWLEDGE_GROUPS = [
    {
      key: "today",
      ar: "اليوم والأحداث",
      en: "Today & events",
      arIntro: "ملخصات يومية وملفات أحداث ونشرات.",
      enIntro: "Daily summaries, event dossiers and editions.",
      items: [
        { key: "daily-briefing", href: "daily-briefing.html", ar: "الملخص اليومي", en: "Daily Briefing", arNote: "ما حدث وما يعنيه، في قراءة واحدة.", enNote: "What happened and why it matters, in one read." },
        { key: "dossiers", href: "dossier/index.html", ar: "ملفات الأحداث", en: "Event dossiers", arNote: "ملفات مرجعية لأحداث جارية.", enNote: "Reference files for running events." },
        { key: "watchlist", href: "dossier/watchlist.html", ar: "ما نراقبه", en: "Watchlist", arNote: "المواعيد والقرارات القادمة.", enNote: "Upcoming dates and decisions." },
        { key: "newsletter", href: "newsletter.html", ar: "النشرة البريدية", en: "Newsletter", arNote: "ملخص دوري يصلك بالبريد.", enNote: "A periodic digest by email." },
        { key: "office-edition", href: "office-edition.html", ar: "نشرة غرفة الأخبار", en: "Newsroom edition", arNote: "إصدار موجز لغرفة الأخبار.", enNote: "A compact newsroom edition." },
        { key: "shorts", href: "shorts.html", ar: "ريلز WRLDLINE", en: "WRLDLINE Shorts", arNote: "موجز عمودي سريع.", enNote: "Short vertical briefings." }
      ]
    },
    {
      key: "context",
      ar: "الفهم والسياق",
      en: "Understanding & context",
      arIntro: "أدوات تنتقل بالقارئ من الخبر إلى معناه.",
      enIntro: "Tools that move the reader from the story to its meaning.",
      items: [
        { key: "analysis", href: "analysis.html", ar: "مكتب الفهم والتحليل", en: "Analysis desk", arNote: "بوابة التحليل والسياق والأدوات.", enNote: "The gateway to analysis, context and tools." },
        { key: "context-room", href: "context.html", ar: "غرفة السياق", en: "Context room", arNote: "خلفيات ومراجع لكل قضية.", enNote: "Background and references for each issue." },
        { key: "balance", href: "balance.html", ar: "ميزان الروايات", en: "Narrative balance", arNote: "الروايات المتاحة دون ادعاء استقلالها.", enNote: "Available narratives without claiming independence." },
        { key: "impact", href: "impact.html", ar: "أطلس التأثير", en: "Impact atlas", arNote: "أثر القرارات على الناس والاقتصاد.", enNote: "How decisions land on people and economies." },
        { key: "explainers", href: "explainers.html", ar: "افهمها في دقيقة", en: "Explained in a minute", arNote: "شرح موجز لقضية معقدة.", enNote: "A short explanation of a complex issue." },
        { key: "promises", href: "promises.html", ar: "ذاكرة الوعود", en: "Promise ledger", arNote: "ما وُعد به وما تحقق.", enNote: "What was promised and what was delivered." },
        { key: "reading", href: "reading.html", ar: "مسارات القراءة", en: "Reading paths", arNote: "مسارات متتابعة لفهم موضوع.", enNote: "Sequenced paths through a topic." }
      ]
    },
    {
      key: "history",
      ar: "الموسوعة التاريخية",
      en: "Historical Encyclopedia",
      arIntro: "التاريخ منظّمًا بالدول والعصور والفصول، وبمصادره.",
      enIntro: "History organised by country, era and chapter, with its sources.",
      items: [
        { key: "history", href: "history.html", ar: "الموسوعة التاريخية", en: "Historical Encyclopedia", arNote: "الدول والعصور والفصول والمصادر.", enNote: "Countries, eras, chapters and sources." },
        { key: "history-explore", href: "history-explore.html", ar: "أطلس الحضارات", en: "Civilisations atlas", arNote: "استكشاف التاريخ بالخرائط والخط الزمني.", enNote: "Explore history through maps and timelines." },
        { key: "history-compare", href: "history-compare.html", ar: "مقارنة تاريخية", en: "Historical comparison", arNote: "قارن ملفين أو عصرين.", enNote: "Compare two dossiers or eras." },
        { key: "history-library", href: "history-library.html", ar: "مكتبة التاريخ", en: "History library", arNote: "الكتب والمراجع والمصادر.", enNote: "Books, references and sources." },
        { key: "mirror", href: "mirror.html", ar: "مرآة التاريخ", en: "History mirror", arNote: "سوابق تاريخية تشبه حدث اليوم.", enNote: "Historical precedents for today's events." }
      ]
    },
    {
      key: "data",
      ar: "البيانات والمراجع",
      en: "Data & reference",
      arIntro: "خرائط وأدلة ومصادر لفهم التغطية.",
      enIntro: "Maps, directories and sources for understanding coverage.",
      items: [
        { key: "map", href: "map.html", ar: "مرصد العالم", en: "World monitor", arNote: "خريطة تفاعلية للأحداث والمخاطر.", enNote: "An interactive map of events and risk signals." },
        { key: "news-map", href: "news-map.html", ar: "خريطة تغطية الأخبار", en: "News coverage map", arNote: "أين تُغطّى الأخبار وأين تغيب.", enNote: "Where stories are covered and where they are not." },
        { key: "countries", href: "countries.html", ar: "الدول والملفات القطرية", en: "Countries", arNote: "ملف لكل دولة وتغطيتها.", enNote: "A dossier for each country and its coverage." },
        { key: "sources", href: "sources.html", ar: "دليل المصادر", en: "Source directory", arNote: "من نقرأ ولماذا.", enNote: "Who we read and why." },
        { key: "tags", href: "tags.html", ar: "الوسوم", en: "Tags", arNote: "تصفح دقيق بالموضوع.", enNote: "Fine-grained topic browsing." }
      ]
    },
    {
      key: "originals",
      ar: "التحقيقات والأرشيف",
      en: "Investigations & archive",
      arIntro: "إنتاج WRLDLINE الأصلي وأرشيف الأخبار المنشورة.",
      enIntro: "WRLDLINE originals and the archive of published news.",
      items: [
        { key: "originals", href: "originals/index.html", ar: "إنتاج WRLDLINE الأصلي", en: "WRLDLINE originals", arNote: "تحقيقات وتحليلات من تحريرنا.", enNote: "Investigations and analysis by our desk." },
        { key: "archive", href: "news/", ar: "أرشيف الأخبار", en: "News archive", arNote: "كل الأخبار المنشورة.", enNote: "Every published story." }
      ]
    }
  ];

  const ALL_LINKS = [];
  const seen = new Set();
  for (const section of NEWS_SECTIONS) {
    if (!seen.has(section.href)) { seen.add(section.href); ALL_LINKS.push(section); }
    else throw new Error("Duplicate section href: " + section.href);
    for (const child of section.children) {
      if (seen.has(child.href)) throw new Error("Duplicate section href: " + child.href);
      seen.add(child.href);
      ALL_LINKS.push(child);
    }
  }
  for (const group of KNOWLEDGE_GROUPS) {
    for (const item of group.items) {
      if (seen.has(item.href)) throw new Error("Duplicate section href: " + item.href);
      seen.add(item.href);
      ALL_LINKS.push(item);
    }
  }

  const NEWS_CATEGORIES = ["politics", "economy", "security", "tech", "sports", "culture", "health", "science", "environment", "society", "world", "rights"];

  function parentOf(key) {
    return NEWS_SECTIONS.find(section => section.key === key || section.children.some(child => child.key === key)) || null;
  }

  function sectionForCategory(category) {
    const key = String(category || "").trim().toLowerCase();
    if (!NEWS_CATEGORIES.includes(key)) return null;
    return parentOf(key);
  }

  function allHrefs() {
    return ALL_LINKS.map(item => item.href);
  }

  return { VERSION, NEWS_SECTIONS, KNOWLEDGE_GROUPS, ALL_LINKS, NEWS_CATEGORIES, parentOf, sectionForCategory, allHrefs };
});
