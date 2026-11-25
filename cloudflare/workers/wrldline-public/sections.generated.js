/* GENERATED FILE - do not edit. Source: site-sections.js (wrldline-sections-3).
 * Regenerate with: node scripts/build-sections.mjs */
export const SECTION_ROUTES = [
  {
    "slug": "politics",
    "key": "politics",
    "ar": "السياسة والعالم",
    "en": "Politics & World",
    "parent": null,
    "intro": "القرار السياسي والدبلوماسية والانتخابات، والتطورات الدولية التي تمسّ المنطقة.",
    "introEn": "Political decisions, diplomacy, elections, and international developments that affect the region."
  },
  {
    "slug": "world",
    "key": "world",
    "ar": "حول العالم",
    "en": "Around the world",
    "parent": "politics",
    "intro": "التطورات الدولية التي تمسّ المنطقة أو تقدم مقارنة مفيدة للقارئ العربي.",
    "introEn": "International developments that affect the region or offer a useful comparison."
  },
  {
    "slug": "security",
    "key": "security",
    "ar": "الأمن والدفاع",
    "en": "Security & defence",
    "parent": "politics",
    "intro": "النزاعات والعمليات العسكرية والاتفاقيات الأمنية، مع فصل ما تحقق عمّا لم يتحقق.",
    "introEn": "Conflicts, military operations and security agreements, separating what is established from what is not."
  },
  {
    "slug": "economy",
    "key": "economy",
    "ar": "الاقتصاد والطاقة",
    "en": "Economy & Energy",
    "parent": null,
    "intro": "النفط والغاز والتجارة والشحن والأسواق والموازنات، بأرقام منسوبة إلى مصادرها.",
    "introEn": "Oil, gas, trade, shipping, markets and budgets, with every figure attributed to its source."
  },
  {
    "slug": "rights",
    "key": "rights",
    "ar": "الحقوق والحريات",
    "en": "Rights & Freedoms",
    "parent": null,
    "intro": "الحريات المدنية والسياسية والعدالة والقانون، مع فصل الاتهام عن الحكم.",
    "introEn": "Civil and political freedoms, justice and the law, keeping accusation separate from verdict."
  },
  {
    "slug": "tech",
    "key": "tech",
    "ar": "التقنية والعلوم",
    "en": "Technology & Science",
    "parent": null,
    "intro": "التقنية والذكاء الاصطناعي والبنية الرقمية والبحث العلمي، وتأثيرها على المنطقة.",
    "introEn": "Technology, AI, digital infrastructure and research, and their effect on the region."
  },
  {
    "slug": "science",
    "key": "science",
    "ar": "العلوم",
    "en": "Science",
    "parent": "tech",
    "intro": "البحث والاكتشافات بلغة مفهومة ودون مبالغة.",
    "introEn": "Research and discoveries in plain language, without exaggeration."
  },
  {
    "slug": "society",
    "key": "society",
    "ar": "المجتمع والثقافة والرياضة",
    "en": "Society, Culture & Sport",
    "parent": null,
    "intro": "التعليم والصحة والعمل والثقافة والرياضة، وكيف تؤثر في حياة الناس اليومية.",
    "introEn": "Education, health, work, culture and sport, and how they shape daily life."
  },
  {
    "slug": "culture",
    "key": "culture",
    "ar": "الثقافة",
    "en": "Culture",
    "parent": "society",
    "intro": "الفنون والكتب والهوية بعيداً عن أخبار المشاهير.",
    "introEn": "Arts, books and identity, away from celebrity coverage."
  },
  {
    "slug": "sports",
    "key": "sports",
    "ar": "الرياضة",
    "en": "Sport",
    "parent": "society",
    "intro": "المنافسات والفرق والأحداث الرياضية بوصفها شأناً عاماً.",
    "introEn": "Competitions, teams and sporting events as public affairs."
  },
  {
    "slug": "health",
    "key": "health",
    "ar": "الصحة",
    "en": "Health",
    "parent": "society",
    "intro": "الصحة العامة والسياسات الصحية وحق الوصول إلى الرعاية.",
    "introEn": "Public health, health policy and the right to access care."
  },
  {
    "slug": "environment",
    "key": "environment",
    "ar": "البيئة والمناخ",
    "en": "Environment & Climate",
    "parent": null,
    "intro": "المناخ والطاقة النظيفة والمياه والكربون، وأثر السياسات البيئية على الاقتصاد الخليجي.",
    "introEn": "Climate, clean energy, water and carbon, and how environmental policy lands on Gulf economies."
  }
];
export const PRIMARY_NAV = [
  {
    "key": "home",
    "kind": "core",
    "href": "index.html",
    "ar": "الرئيسية",
    "en": "Home",
    "arNote": "الصفحة الأولى وآخر الأخبار.",
    "enNote": "The front page and the latest news.",
    "group": "core",
    "children": []
  },
  {
    "key": "politics",
    "slug": "politics",
    "kind": "news",
    "ar": "السياسة والعالم",
    "en": "Politics & World",
    "href": "/section/politics",
    "arIntro": "القرار السياسي والدبلوماسية والانتخابات، والتطورات الدولية التي تمسّ المنطقة.",
    "enIntro": "Political decisions, diplomacy, elections, and international developments that affect the region.",
    "children": [
      "world",
      "security"
    ],
    "group": "news"
  },
  {
    "key": "economy",
    "slug": "economy",
    "kind": "news",
    "ar": "الاقتصاد والطاقة",
    "en": "Economy & Energy",
    "href": "/section/economy",
    "arIntro": "النفط والغاز والتجارة والشحن والأسواق والموازنات، بأرقام منسوبة إلى مصادرها.",
    "enIntro": "Oil, gas, trade, shipping, markets and budgets, with every figure attributed to its source.",
    "children": [
      "economy-dashboards"
    ],
    "group": "news"
  },
  {
    "key": "rights",
    "slug": "rights",
    "kind": "news",
    "ar": "الحقوق والحريات",
    "en": "Rights & Freedoms",
    "href": "/section/rights",
    "arIntro": "الحريات المدنية والسياسية والعدالة والقانون، مع فصل الاتهام عن الحكم.",
    "enIntro": "Civil and political freedoms, justice and the law, keeping accusation separate from verdict.",
    "children": [
      "rights-desk",
      "rights-cases",
      "rights-guides"
    ],
    "group": "news"
  },
  {
    "key": "tech",
    "slug": "tech",
    "kind": "news",
    "ar": "التقنية والعلوم",
    "en": "Technology & Science",
    "href": "/section/tech",
    "arIntro": "التقنية والذكاء الاصطناعي والبنية الرقمية والبحث العلمي، وتأثيرها على المنطقة.",
    "enIntro": "Technology, AI, digital infrastructure and research, and their effect on the region.",
    "children": [
      "science",
      "ai-governance"
    ],
    "group": "news"
  },
  {
    "key": "society",
    "slug": "society",
    "kind": "news",
    "ar": "المجتمع والثقافة والرياضة",
    "en": "Society, Culture & Sport",
    "href": "/section/society",
    "arIntro": "التعليم والصحة والعمل والثقافة والرياضة، وكيف تؤثر في حياة الناس اليومية.",
    "enIntro": "Education, health, work, culture and sport, and how they shape daily life.",
    "children": [
      "culture",
      "sports",
      "health"
    ],
    "group": "news"
  },
  {
    "key": "environment",
    "slug": "environment",
    "kind": "news",
    "ar": "البيئة والمناخ",
    "en": "Environment & Climate",
    "href": "/section/environment",
    "arIntro": "المناخ والطاقة النظيفة والمياه والكربون، وأثر السياسات البيئية على الاقتصاد الخليجي.",
    "enIntro": "Climate, clean energy, water and carbon, and how environmental policy lands on Gulf economies.",
    "children": [],
    "group": "news"
  },
  {
    "key": "sections",
    "kind": "core",
    "href": "sections.html",
    "ar": "الأقسام",
    "en": "Sections",
    "arNote": "خريطة الصحيفة الكاملة: الأقسام والمسارات والأدوات.",
    "enNote": "The complete newspaper map: sections, desks and tools.",
    "group": "core",
    "children": []
  }
];
export const MORE_MENU = [
  {
    "key": "daily-briefing",
    "kind": "knowledge",
    "href": "daily-briefing.html",
    "ar": "الملخص اليومي",
    "en": "Daily Briefing",
    "arNote": "ما حدث وما يعنيه، في قراءة واحدة.",
    "enNote": "What happened and why it matters, in one read.",
    "group": "today",
    "children": []
  },
  {
    "key": "history",
    "kind": "knowledge",
    "href": "history.html",
    "ar": "الموسوعة التاريخية",
    "en": "Historical Encyclopedia",
    "arNote": "الدول والعصور والفصول والمصادر.",
    "enNote": "Countries, eras, chapters and sources.",
    "group": "history",
    "children": []
  },
  {
    "key": "analysis",
    "kind": "knowledge",
    "href": "analysis.html",
    "ar": "مكتب الفهم والتحليل",
    "en": "Analysis desk",
    "arNote": "بوابة التحليل والسياق والأدوات.",
    "enNote": "The gateway to analysis, context and tools.",
    "group": "context",
    "children": []
  },
  {
    "key": "context-room",
    "kind": "knowledge",
    "href": "context.html",
    "ar": "غرفة السياق",
    "en": "Context room",
    "arNote": "خلفيات ومراجع لكل قضية.",
    "enNote": "Background and references for each issue.",
    "group": "context",
    "children": []
  },
  {
    "key": "map",
    "kind": "tool",
    "href": "map.html",
    "ar": "مرصد العالم",
    "en": "World monitor",
    "arNote": "خريطة تفاعلية للأحداث والمخاطر.",
    "enNote": "An interactive map of events and risk signals.",
    "group": "tools",
    "children": []
  },
  {
    "key": "markets",
    "kind": "tool",
    "href": "markets.html",
    "ar": "الأسواق العالمية",
    "en": "World markets",
    "arNote": "مؤشرات وأسعار محدّثة مع مصدرها.",
    "enNote": "Live indices and prices with their source.",
    "group": "tools",
    "children": []
  },
  {
    "key": "shorts",
    "kind": "knowledge",
    "href": "shorts.html",
    "ar": "ريلز WRLDLINE",
    "en": "WRLDLINE Shorts",
    "arNote": "موجز عمودي سريع.",
    "enNote": "Short vertical briefings.",
    "group": "today",
    "children": []
  },
  {
    "key": "for-you",
    "kind": "service",
    "href": "for-you.html",
    "ar": "صفحتك الشخصية",
    "en": "For you",
    "arNote": "تغطية مرتّبة حسب ما تقرأ.",
    "enNote": "Coverage ordered by what you read.",
    "group": "services",
    "children": []
  }
];
export const FOOTER_COLUMNS = [
  {
    "key": "news",
    "ar": "الأقسام الإخبارية",
    "en": "News sections",
    "items": [
      "politics",
      "economy",
      "rights",
      "tech",
      "society",
      "environment"
    ]
  },
  {
    "key": "knowledge",
    "ar": "المعرفة والتحليل",
    "en": "Knowledge & analysis",
    "items": [
      "daily-briefing",
      "history",
      "analysis",
      "context-room",
      "explainers",
      "reading"
    ]
  },
  {
    "key": "tools",
    "ar": "الأدوات والبيانات",
    "en": "Tools & data",
    "items": [
      "map",
      "news-map",
      "countries",
      "markets",
      "sources",
      "tags"
    ]
  },
  {
    "key": "services",
    "ar": "خدمات القارئ",
    "en": "Reader services",
    "items": [
      "for-you",
      "saved",
      "preferences",
      "account",
      "newsletter"
    ]
  },
  {
    "key": "about",
    "ar": "عن الموقع",
    "en": "About",
    "items": [
      "about",
      "corrections",
      "contact",
      "advertise",
      "privacy",
      "terms"
    ]
  }
];
export const REGISTRY_VERSION = "wrldline-sections-3";
