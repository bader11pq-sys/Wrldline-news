// ==========================================================
// قاعدة بيانات ضخمة لأكثر من 200 مصدر إخباري (مصنفة)
// ==========================================================
const RSS_FEEDS = [
    // ========== 1. الشؤون السياسية والدولية (Politics & World) ==========
    { url: 'https://feeds.bbci.co.uk/arabic/rss.xml', name: 'BBC عربي', category: 'politics' },
    { url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9', name: 'الجزيرة', category: 'politics' },
    { url: 'https://www.skynewsarabia.com/rss', name: 'سكاي نيوز عربية', category: 'politics' },
    { url: 'https://www.spa.gov.sa/rss', name: 'واس (السعودية)', category: 'politics' },
    { url: 'https://www.alarabiya.net/feed', name: 'العربية', category: 'politics' },
    { url: 'https://arabic.cnn.com/api/v1/rss/rss.xml', name: 'CNN عربية', category: 'politics' },
    { url: 'https://aawsat.com/feed', name: 'الشرق الأوسط', category: 'politics' },
    { url: 'https://www.alquds.co.uk/feed/', name: 'القدس العربي', category: 'politics' },
    { url: 'https://www.youm7.com/rss', name: 'اليوم السابع (مصر)', category: 'politics' },
    { url: 'https://www.almasryalyoum.com/rss', name: 'المصري اليوم', category: 'politics' },
    { url: 'https://www.alkhaleej.ae/rss', name: 'الخليج (الإمارات)', category: 'politics' },
    { url: 'https://www.alroeya.com/rss', name: 'الرؤية (الإمارات)', category: 'politics' },
    { url: 'https://www.alittihad.ae/rss', name: 'الاتحاد (الإمارات)', category: 'politics' },
    { url: 'https://www.albayan.ae/rss', name: 'البيان (الإمارات)', category: 'politics' },
    { url: 'https://www.emaratalyoum.com/rss', name: 'الإمارات اليوم', category: 'politics' },
    { url: 'https://www.gulf-times.com/rss', name: 'Gulf Times (قطر)', category: 'politics' },
    { url: 'https://www.thepeninsulaqatar.com/rss', name: 'The Peninsula (قطر)', category: 'politics' },
    { url: 'https://www.omanobserver.om/rss', name: 'Oman Observer', category: 'politics' },
    { url: 'https://www.kuna.net.kw/rss', name: 'كونا (الكويت)', category: 'politics' },
    { url: 'https://www.alraimedia.com/rss', name: 'الرأي (الكويت)', category: 'politics' },
    { url: 'https://www.alayam.com/rss', name: 'الأيام (البحرين)', category: 'politics' },
    { url: 'https://www.akhbar-alkhaleej.com/rss', name: 'أخبار الخليج', category: 'politics' },
    { url: 'https://www.alwatan.com/rss', name: 'الوطن (عمان)', category: 'politics' },
    { url: 'https://www.alsharq.net/rss', name: 'الشرق (قطر)', category: 'politics' },
    { url: 'https://www.alwatanvoice.com/arabic/rss.xml', name: 'دنيا الوطن (فلسطين)', category: 'politics' },
    { url: 'https://www.maannews.net/rss', name: 'معاً (فلسطين)', category: 'politics' },
    { url: 'https://sana.sy/en/?feed=rss2', name: 'سانا (سوريا)', category: 'politics' },
    { url: 'https://www.alweehdat.net/rss', name: 'الوحدات', category: 'politics' },
    { url: 'https://www.assafir.com/rss', name: 'السفير (لبنان)', category: 'politics' },
    { url: 'https://arabi21.com/feed', name: 'عربي21', category: 'politics' },
    { url: 'https://www.almodon.com/rss', name: 'المدن', category: 'politics' },
    { url: 'https://www.alaraby.co.uk/rss', name: 'العربي الجديد', category: 'politics' },
    { url: 'https://www.alalam.ir/rss', name: 'العالم (إيران)', category: 'politics' },
    { url: 'https://sabreennews.com/rss', name: 'صابرين نيوز', category: 'politics' },
    { url: 'https://www.murasiloon.com/feed/', name: 'مراسلون', category: 'politics' },
    { url: 'https://www.alghad.com/feed', name: 'الغد (الأردن)', category: 'politics' },
    { url: 'https://www.alrai.com/rss', name: 'الرأي (الأردن)', category: 'politics' },
    { url: 'https://ammonnews.net/feed', name: 'عمون (الأردن)', category: 'politics' },
    { url: 'https://royanews.tv/rss', name: 'رؤيا (الأردن)', category: 'politics' },
    { url: 'https://www.annahar.com/rss', name: 'النهار (لبنان)', category: 'politics' },
    { url: 'https://www.alakhbar.com/rss', name: 'الأخبار (لبنان)', category: 'politics' },
    { url: 'https://arabi21.com/Rss/SectionNewsRSS', name: 'عربي21 - صحافة دولية', category: 'politics' },
    { url: 'https://arabi21.com/Rss/SectionNewsRSS?id=320', name: 'عربي21 - سياسة دولية', category: 'politics' },
    { url: 'https://arabi21.com/Rss/SectionNewsRSS?id=288', name: 'عربي21 - سياسة عربية', category: 'politics' },
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World', category: 'politics' },
    { url: 'https://feeds.bbci.co.uk/news/rss.xml', name: 'BBC Top Stories', category: 'politics' },
    { url: 'https://www.theguardian.com/world/rss', name: 'The Guardian', category: 'politics' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera English', category: 'politics' },
    { url: 'https://www.france24.com/en/rss', name: 'France 24', category: 'politics' },
    { url: 'https://feeds.skynews.com/feeds/rss/world.xml', name: 'Sky News World', category: 'politics' },
    { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR News', category: 'politics' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', name: 'NYT World', category: 'politics' },
    { url: 'https://www.cbc.ca/webfeed/rss/rss-world', name: 'CBC World', category: 'politics' },
    { url: 'https://www.reutersagency.com/feed/?best-topics=world&post_type=best', name: 'Reuters World', category: 'politics' },
    { url: 'https://apnews.com/hub/world-news?format=rss', name: 'AP World', category: 'politics' },
    { url: 'https://rss.dw.com/rdf/rss-en-world', name: 'DW World', category: 'politics' },
    { url: 'https://www.euronews.com/rss', name: 'Euronews', category: 'politics' },
    { url: 'https://www.rfi.fr/en/rss', name: 'RFI English', category: 'politics' },
    { url: 'https://www.lemonde.fr/rss/en_continu.xml', name: 'Le Monde', category: 'politics' },
    { url: 'https://www.france24.com/fr/rss', name: 'France 24 French', category: 'politics' },
    { url: 'https://www.rfi.fr/fr/rss', name: 'RFI French', category: 'politics' },
    { url: 'https://www.spiegel.de/international/index.rss', name: 'Der Spiegel', category: 'politics' },
    { url: 'https://www.zeit.de/index', name: 'Die Zeit', category: 'politics' },
    { url: 'https://www.faz.net/rss/aktuell/', name: 'FAZ', category: 'politics' },
    { url: 'https://www.sueddeutsche.de/news/rss', name: 'Süddeutsche', category: 'politics' },
    { url: 'https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml', name: 'ANSA', category: 'politics' },
    { url: 'https://www.corriere.it/rss/homepage.xml', name: 'Corriere della Sera', category: 'politics' },
    { url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml', name: 'La Repubblica', category: 'politics' },
    { url: 'https://elpais.com/rss/elpais/portada.xml', name: 'El País', category: 'politics' },
    { url: 'https://www.elmundo.es/rss/portada.xml', name: 'El Mundo', category: 'politics' },
    { url: 'https://www.abc.es/rss/2.0/portada.xml', name: 'ABC (Spain)', category: 'politics' },
    { url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml', name: 'Le Figaro', category: 'politics' },
    { url: 'https://www.lesechos.fr/rss/rss_une.xml', name: 'Les Echos', category: 'politics' },
    { url: 'https://www.liberation.fr/rss/', name: 'Libération', category: 'politics' },
    { url: 'https://www.nrc.nl/rss/', name: 'NRC', category: 'politics' },
    { url: 'https://www.volkskrant.nl/rss/', name: 'De Volkskrant', category: 'politics' },
    { url: 'https://www.nos.nl/rss/', name: 'NOS Nieuws', category: 'politics' },
    { url: 'https://www.dn.se/rss/', name: 'Dagens Nyheter', category: 'politics' },
    { url: 'https://www.svt.se/rss.xml', name: 'SVT Nyheter', category: 'politics' },
    { url: 'https://www.aftenposten.no/rss/', name: 'Aftenposten', category: 'politics' },
    { url: 'https://www.politiken.dk/rss/', name: 'Politiken', category: 'politics' },
    { url: 'https://www.hs.fi/rss/', name: 'Helsingin Sanomat', category: 'politics' },
    { url: 'https://www.kyivpost.com/feed', name: 'Kyiv Post', category: 'politics' },
    { url: 'https://www.themoscowtimes.com/rss/news', name: 'Moscow Times', category: 'politics' },
    { url: 'https://www.thehindu.com/news/international/feeder/default.rss', name: 'The Hindu', category: 'politics' },
    { url: 'https://indianexpress.com/section/world/feed/', name: 'Indian Express', category: 'politics' },
    { url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms', name: 'Times of India', category: 'politics' },
    { url: 'https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml', name: 'Hindustan Times', category: 'politics' },
    { url: 'https://www.dawn.com/feeds/home', name: 'Dawn', category: 'politics' },
    { url: 'https://tribune.com.pk/feed/world', name: 'Express Tribune', category: 'politics' },
    { url: 'https://www.bangkokpost.com/rss/data/world.xml', name: 'Bangkok Post', category: 'politics' },
    { url: 'https://www.straitstimes.com/news/world/rss.xml', name: 'Straits Times', category: 'politics' },
    { url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml', name: 'CNA', category: 'politics' },
    { url: 'https://www.scmp.com/rss/91/feed', name: 'SCMP', category: 'politics' },
    { url: 'https://www.japantimes.co.jp/feed/', name: 'Japan Times', category: 'politics' },
    { url: 'https://www3.nhk.or.jp/rss/news/cat0.xml', name: 'NHK', category: 'politics' },
    { url: 'https://www.koreatimes.co.kr/www/rss/rss.xml', name: 'Korea Times', category: 'politics' },
    { url: 'https://en.yna.co.kr/RSS/news.xml', name: 'Yonhap', category: 'politics' },
    { url: 'https://www.globaltimes.cn/rss/outbrain.xml', name: 'Global Times', category: 'politics' },
    { url: 'https://www.chinadaily.com.cn/rss/world_rss.xml', name: 'China Daily', category: 'politics' },
    { url: 'https://www.xinhuanet.com/english/rss/worldrss.xml', name: 'Xinhua', category: 'politics' },
    { url: 'https://www.arabnews.com/cat/2/rss.xml', name: 'Arab News', category: 'politics' },
    { url: 'https://www.middleeasteye.net/rss', name: 'Middle East Eye', category: 'politics' },
    { url: 'https://www.timesofisrael.com/feed/', name: 'Times of Israel', category: 'politics' },
    { url: 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx', name: 'Jerusalem Post', category: 'politics' },
    { url: 'https://www.haaretz.com/srv/htz-rss', name: 'Haaretz', category: 'politics' },
    { url: 'https://www.ynetnews.com/Integration/StoryRss2.xml', name: 'Ynetnews', category: 'politics' },
    { url: 'https://www.tehrantimes.com/rss', name: 'Tehran Times', category: 'politics' },
    { url: 'https://en.mehrnews.com/rss', name: 'Mehr News', category: 'politics' },
    { url: 'https://www.irna.ir/rss.aspx', name: 'IRNA', category: 'politics' },
    { url: 'https://www.hurriyetdailynews.com/rss', name: 'Hurriyet Daily News', category: 'politics' },
    { url: 'https://www.dailysabah.com/rss', name: 'Daily Sabah', category: 'politics' },
    { url: 'https://www.aa.com.tr/en/rss/default?cat=guncel', name: 'Anadolu Agency', category: 'politics' },
    { url: 'https://www.france24.com/en/rss', name: 'France 24', category: 'politics' },
    { url: 'https://www.rfi.fr/en/rss', name: 'RFI', category: 'politics' },
    { url: 'https://www.euronews.com/rss', name: 'Euronews', category: 'politics' },
    { url: 'https://www.dw.com/en/rss', name: 'DW', category: 'politics' },
    { url: 'https://www.bbc.com/news/world/rss.xml', name: 'BBC', category: 'politics' },
    { url: 'https://www.cnn.com/rss/edition_world.rss', name: 'CNN', category: 'politics' },
    { url: 'https://feeds.foxnews.com/foxnews/world', name: 'Fox News', category: 'politics' },
    { url: 'https://moxie.foxnews.com/google-publisher/world.xml', name: 'Fox News World', category: 'politics' },
    { url: 'https://www.nbcnews.com/id/3032619/device/rss/rss.xml', name: 'NBC News', category: 'politics' },
    { url: 'https://abcnews.go.com/abcnews/internationalheadlines', name: 'ABC News', category: 'politics' },
    { url: 'https://www.cbsnews.com/latest/rss/world', name: 'CBS News', category: 'politics' },
    { url: 'https://www.usatoday.com/rss/world/', name: 'USA Today', category: 'politics' },
    { url: 'https://www.latimes.com/world-nation/rss2.0.xml', name: 'LA Times', category: 'politics' },
    { url: 'https://www.washingtonpost.com/rss/world', name: 'Washington Post', category: 'politics' },
    { url: 'https://www.wsj.com/xml/rss/3_7085.xml', name: 'WSJ World', category: 'politics' },
    { url: 'https://rss.politico.com/politics-news.xml', name: 'Politico', category: 'politics' },
    { url: 'https://thehill.com/news/feed/', name: 'The Hill', category: 'politics' },
    { url: 'https://feeds.washingtonpost.com/rss/politics', name: 'Washington Post Politics', category: 'politics' },
    { url: 'https://www.al-monitor.com/rss', name: 'Al-Monitor', category: 'politics' },
    { url: 'https://www.foreignaffairs.com/rss.xml', name: 'Foreign Affairs', category: 'politics' },
    { url: 'https://www.cfr.org/rss', name: 'Council on Foreign Relations', category: 'politics' },
    { url: 'https://www.chathamhouse.org/rss', name: 'Chatham House', category: 'politics' },
    { url: 'https://www.brookings.edu/feed/', name: 'Brookings', category: 'politics' },
    { url: 'https://carnegieendowment.org/rss', name: 'Carnegie Endowment', category: 'politics' },

    // ========== 2. الاقتصاد والأعمال (Economy & Business) ==========
    { url: 'https://www.ft.com/rss/world', name: 'Financial Times', category: 'economy' },
    { url: 'https://www.bloomberg.com/feed/podcast/trillions.xml', name: 'Bloomberg', category: 'economy' },
    { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', name: 'CNBC', category: 'economy' },
    { url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml', name: 'WSJ Markets', category: 'economy' },
    { url: 'https://www.marketwatch.com/rss/topstories', name: 'MarketWatch', category: 'economy' },
    { url: 'https://www.investing.com/rss/news.rss', name: 'Investing.com', category: 'economy' },
    { url: 'https://seekingalpha.com/market_currents.xml', name: 'Seeking Alpha', category: 'economy' },
    { url: 'https://www.zerohedge.com/fullrss2.xml', name: 'ZeroHedge', category: 'economy' },
    { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', name: 'MarketWatch Top', category: 'economy' },
    { url: 'https://www.ft.com/rss/home', name: 'Financial Times Home', category: 'economy' },
    { url: 'https://www.economist.com/finance-and-economics/rss.xml', name: 'The Economist', category: 'economy' },
    { url: 'https://www.forbes.com/business/feed/', name: 'Forbes', category: 'economy' },
    { url: 'https://www.businessinsider.com/rss', name: 'Business Insider', category: 'economy' },
    { url: 'https://www.economist.com/the-world-this-week/rss.xml', name: 'The Economist World', category: 'economy' },
    { url: 'https://www.arabnews.com/cat/3/rss.xml', name: 'Arab News Business', category: 'economy' },
    { url: 'https://www.alarabiya.net/feed/economy', name: 'العربية اقتصاد', category: 'economy' },
    { url: 'https://www.cnbcarabia.com/rss', name: 'CNBC عربية', category: 'economy' },
    { url: 'https://www.argaam.com/ar/rss', name: 'أرقام', category: 'economy' },
    { url: 'https://www.maaal.com/feed/', name: 'مال', category: 'economy' },
    { url: 'https://www.asharqbusiness.com/rss', name: 'الشرق للأعمال', category: 'economy' },
    { url: 'https://www.economy-today.com/feed/', name: 'الاقتصاد اليوم', category: 'economy' },
    { url: 'https://www.arabfinance.com/rss', name: 'آراب فاينانس', category: 'economy' },
    { url: 'https://www.arabictrader.com/rss', name: 'المتداول العربي', category: 'economy' },
    { url: 'https://www.alborsaanews.com/rss', name: 'البورصة', category: 'economy' },
    { url: 'https://www.amwalalghad.com/feed/', name: 'أموال الغد', category: 'economy' },
    { url: 'https://www.hayatoukom.com/feed/', name: 'حياتك', category: 'economy' },
    { url: 'https://www.almalnews.com/rss', name: 'المال نيوز', category: 'economy' },
    { url: 'https://www.dostor.org/rss', name: 'الدستور', category: 'economy' },
    { url: 'https://www.albawabhnews.com/rss', name: 'البوابة نيوز', category: 'economy' },
    { url: 'https://www.youm7.com/rss/Section/2', name: 'اليوم السابع اقتصاد', category: 'economy' },
    { url: 'https://www.almasryalyoum.com/rss/economy', name: 'المصري اليوم اقتصاد', category: 'economy' },

    // ========== 3. العلوم والتكنولوجيا (Science & Tech) ==========
    { url: 'https://techcrunch.com/feed/', name: 'TechCrunch', category: 'tech' },
    { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge', category: 'tech' },
    { url: 'https://www.wired.com/feed/rss', name: 'Wired', category: 'tech' },
    { url: 'https://arstechnica.com/feed/', name: 'Ars Technica', category: 'tech' },
    { url: 'https://www.engadget.com/rss.xml', name: 'Engadget', category: 'tech' },
    { url: 'https://www.cnet.com/rss/news/', name: 'CNET', category: 'tech' },
    { url: 'https://www.zdnet.com/news/rss.xml', name: 'ZDNet', category: 'tech' },
    { url: 'https://www.technologyreview.com/feed/', name: 'MIT Technology Review', category: 'tech' },
    { url: 'https://www.sciencedaily.com/rss/all.xml', name: 'ScienceDaily', category: 'tech' },
    { url: 'https://www.nature.com/nature.rss', name: 'Nature', category: 'tech' },
    { url: 'https://www.sciencemag.org/rss/news_current.xml', name: 'Science', category: 'tech' },
    { url: 'https://www.space.com/feeds/all', name: 'Space.com', category: 'tech' },
    { url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', name: 'NASA', category: 'tech' },
    { url: 'https://www.esa.int/rssfeed/Our_Activities/Space_News', name: 'ESA', category: 'tech' },
    { url: 'https://www.alarabiya.net/feed/technology', name: 'العربية تكنولوجيا', category: 'tech' },
    { url: 'https://www.aljazeera.net/aljazeerarss/technology', name: 'الجزيرة تكنولوجيا', category: 'tech' },
    { url: 'https://www.tech-wd.com/wd/feed/', name: 'عالم التقنية', category: 'tech' },
    { url: 'https://www.tech3arabi.com/feed/', name: 'تك عربي', category: 'tech' },
    { url: 'https://www.newtqnia.com/feed/', name: 'NewTqnia', category: 'tech' },
    { url: 'https://www.aitnews.com/feed/', name: 'AI News', category: 'tech' },
    { url: 'https://www.technologyreview.com/feed/', name: 'MIT Tech Review', category: 'tech' },
    { url: 'https://www.unite.ai/feed/', name: 'Unite.AI', category: 'tech' },
    { url: 'https://www.artificialintelligence-news.com/feed/', name: 'AI News', category: 'tech' },
    { url: 'https://venturebeat.com/feed/', name: 'VentureBeat', category: 'tech' },
    { url: 'https://www.therobotreport.com/feed/', name: 'The Robot Report', category: 'tech' },

    // ========== 4. الثقافة والمجتمع (Culture & Society) ==========
    { url: 'https://shaqaeq.net/feed/thkaf-ofn', name: 'شقائق - ثقافة وفن', category: 'culture' },
    { url: 'https://zawia3.com/category/culture/feed/', name: 'زاوية ثالثة - ثقافة', category: 'culture' },
    { url: 'https://zawia3.com/category/society/feed/', name: 'زاوية ثالثة - مجتمع', category: 'culture' },
    { url: 'https://www.aljazeera.net/aljazeerarss/culture', name: 'الجزيرة ثقافة', category: 'culture' },
    { url: 'https://www.alarabiya.net/feed/culture', name: 'العربية ثقافة', category: 'culture' },
    { url: 'https://www.albayan.ae/rss/culture', name: 'البيان ثقافة', category: 'culture' },
    { url: 'https://www.alittihad.ae/rss/culture', name: 'الاتحاد ثقافة', category: 'culture' },
    { url: 'https://www.alkhaleej.ae/rss/culture', name: 'الخليج ثقافة', category: 'culture' },
    { url: 'https://www.emaratalyoum.com/rss/culture', name: 'الإمارات اليوم ثقافة', category: 'culture' },
    { url: 'https://www.7iber.com/feed/', name: '7iber', category: 'culture' },
    { url: 'https://www.almodon.com/rss/culture', name: 'المدن ثقافة', category: 'culture' },
    { url: 'https://www.alaraby.co.uk/rss/culture', name: 'العربي الجديد ثقافة', category: 'culture' },
    { url: 'https://www.madamasr.com/feed/', name: 'مدى مصر', category: 'culture' },
    { url: 'https://www.al-fanarmedia.org/feed/', name: 'الفنار', category: 'culture' },
    { url: 'https://www.nytimes.com/svc/collections/v1/publish/http%3A%2F%2Fwww.nytimes.com%2Fsection%2Farts/rss.xml', name: 'NYT Arts', category: 'culture' },
    { url: 'https://www.theguardian.com/culture/rss', name: 'Guardian Culture', category: 'culture' },
    { url: 'https://www.bbc.co.uk/news/entertainment_and_arts/rss.xml', name: 'BBC Entertainment', category: 'culture' },
    { url: 'https://www.artnews.com/feed/', name: 'ARTnews', category: 'culture' },
    { url: 'https://www.artforum.com/feed/', name: 'Artforum', category: 'culture' },
    { url: 'https://www.frieze.com/rss', name: 'Frieze', category: 'culture' },

    // ========== 5. الصحة والبيئة (Health & Environment) ==========
    { url: 'https://www.medicalnewstoday.com/rss', name: 'Medical News Today', category: 'health' },
    { url: 'https://www.webmd.com/rss/rss.aspx?RSSSource=RSS_PUBLIC', name: 'WebMD', category: 'health' },
    { url: 'https://www.healthline.com/rss/news', name: 'Healthline', category: 'health' },
    { url: 'https://www.who.int/rss-feeds/news-english.xml', name: 'WHO', category: 'health' },
    { url: 'https://www.cdc.gov/rss/press.xml', name: 'CDC', category: 'health' },
    { url: 'https://www.nhs.uk/feed/', name: 'NHS', category: 'health' },
    { url: 'https://www.aljazeera.net/aljazeerarss/health', name: 'الجزيرة صحة', category: 'health' },
    { url: 'https://www.alarabiya.net/feed/health', name: 'العربية صحة', category: 'health' },
    { url: 'https://www.albayan.ae/rss/health', name: 'البيان صحة', category: 'health' },
    { url: 'https://www.alittihad.ae/rss/health', name: 'الاتحاد صحة', category: 'health' },
    { url: 'https://www.alkhaleej.ae/rss/health', name: 'الخليج صحة', category: 'health' },
    { url: 'https://www.nytimes.com/svc/collections/v1/publish/http%3A%2F%2Fwww.nytimes.com%2Fsection%2Fhealth/rss.xml', name: 'NYT Health', category: 'health' },
    { url: 'https://www.theguardian.com/society/health/rss', name: 'Guardian Health', category: 'health' },
    { url: 'https://www.bbc.co.uk/news/health/rss.xml', name: 'BBC Health', category: 'health' },
    { url: 'https://www.nature.com/nclimate.rss', name: 'Nature Climate', category: 'environment' },
    { url: 'https://www.carbonbrief.org/feed/', name: 'Carbon Brief', category: 'environment' },
    { url: 'https://www.climatechangenews.com/feed/', name: 'Climate Home News', category: 'environment' },
    { url: 'https://www.theguardian.com/environment/rss', name: 'Guardian Environment', category: 'environment' },
    { url: 'https://www.bbc.co.uk/news/science_and_environment/rss.xml', name: 'BBC Science & Environment', category: 'environment' },
    { url: 'https://www.nationalgeographic.com/environment/rss', name: 'National Geographic Environment', category: 'environment' },

    // ========== 6. الرياضة (Sports) ==========
    { url: 'https://www.espn.com/espn/rss/news', name: 'ESPN', category: 'sports' },
    { url: 'https://www.skysports.com/rss/12040', name: 'Sky Sports', category: 'sports' },
    { url: 'https://www.bbc.com/sport/rss.xml', name: 'BBC Sport', category: 'sports' },
    { url: 'https://www.theguardian.com/sport/rss', name: 'Guardian Sport', category: 'sports' },
    { url: 'https://www.cbssports.com/rss/headlines/', name: 'CBS Sports', category: 'sports' },
    { url: 'https://www.foxsports.com/rss', name: 'Fox Sports', category: 'sports' },
    { url: 'https://www.si.com/rss/si_topstories.rss', name: 'Sports Illustrated', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/soccer/news', name: 'ESPN Soccer', category: 'sports' },
    { url: 'https://www.aljazeera.net/aljazeerarss/sport', name: 'الجزيرة رياضة', category: 'sports' },
    { url: 'https://www.alarabiya.net/feed/sport', name: 'العربية رياضة', category: 'sports' },
    { url: 'https://www.albayan.ae/rss/sport', name: 'البيان رياضة', category: 'sports' },
    { url: 'https://www.alittihad.ae/rss/sport', name: 'الاتحاد رياضة', category: 'sports' },
    { url: 'https://www.alkhaleej.ae/rss/sport', name: 'الخليج رياضة', category: 'sports' },
    { url: 'https://www.emaratalyoum.com/rss/sport', name: 'الإمارات اليوم رياضة', category: 'sports' },
    { url: 'https://www.kooora.com/rss', name: 'كووورة', category: 'sports' },
    { url: 'https://www.filgoal.com/rss', name: 'في الجول', category: 'sports' },
    { url: 'https://www.yallakora.com/rss', name: 'يلا كورة', category: 'sports' },
    { url: 'https://www.goal.com/feeds/en/news', name: 'Goal', category: 'sports' },
    { url: 'https://www.skysports.com/rss/12040', name: 'Sky Sports', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/nfl/news', name: 'ESPN NFL', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/nba/news', name: 'ESPN NBA', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/mlb/news', name: 'ESPN MLB', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/nhl/news', name: 'ESPN NHL', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/f1/news', name: 'ESPN F1', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/tennis/news', name: 'ESPN Tennis', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/golf/news', name: 'ESPN Golf', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/MMA/news', name: 'ESPN MMA', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/boxing/news', name: 'ESPN Boxing', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/racing/news', name: 'ESPN Racing', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/cricket/news', name: 'ESPN Cricket', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/rugby/news', name: 'ESPN Rugby', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/cycling/news', name: 'ESPN Cycling', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/olympics/news', name: 'ESPN Olympics', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/xgames/news', name: 'ESPN X Games', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/eSports/news', name: 'ESPN eSports', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/college-football/news', name: 'ESPN College Football', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/college-basketball/news', name: 'ESPN College Basketball', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/college-baseball/news', name: 'ESPN College Baseball', category: 'sports' },
    { url: 'https://www.espn.com/espn/rss/college-hockey/news', name: 'ESPN College Hockey', category: 'sports' },

    // ========== 7. مصادر إضافية متنوعة (Google News Query Feeds) ==========
    { url: 'https://news.google.com/rss/search?q=world&hl=en-US&gl=US&ceid=US:en', name: 'Google News World', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=saudi+arabia&hl=ar&gl=SA&ceid=SA:ar', name: 'Google News Saudi', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=egypt&hl=ar&gl=EG&ceid=EG:ar', name: 'Google News Egypt', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=uae&hl=ar&gl=AE&ceid=AE:ar', name: 'Google News UAE', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=france&hl=fr&gl=FR&ceid=FR:fr', name: 'Google News France', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=germany&hl=de&gl=DE&ceid=DE:de', name: 'Google News Germany', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=spain&hl=es&gl=ES&ceid=ES:es', name: 'Google News Spain', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=italy&hl=it&gl=IT&ceid=IT:it', name: 'Google News Italy', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=japan&hl=ja&gl=JP&ceid=JP:ja', name: 'Google News Japan', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=china&hl=zh-CN&gl=CN&ceid=CN:zh-Hans', name: 'Google News China', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=india&hl=en-IN&gl=IN&ceid=IN:en', name: 'Google News India', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=russia&hl=ru&gl=RU&ceid=RU:ru', name: 'Google News Russia', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=brazil&hl=pt-BR&gl=BR&ceid=BR:pt-419', name: 'Google News Brazil', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=canada&hl=en-CA&gl=CA&ceid=CA:en', name: 'Google News Canada', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=australia&hl=en-AU&gl=AU&ceid=AU:en', name: 'Google News Australia', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=south+africa&hl=en-ZA&gl=ZA&ceid=ZA:en', name: 'Google News South Africa', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=nigeria&hl=en-NG&gl=NG&ceid=NG:en', name: 'Google News Nigeria', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=kenya&hl=en-KE&gl=KE&ceid=KE:en', name: 'Google News Kenya', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=mexico&hl=es-419&gl=MX&ceid=MX:es-419', name: 'Google News Mexico', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=argentina&hl=es-419&gl=AR&ceid=AR:es-419', name: 'Google News Argentina', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=colombia&hl=es-419&gl=CO&ceid=CO:es-419', name: 'Google News Colombia', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=chile&hl=es-419&gl=CL&ceid=CL:es-419', name: 'Google News Chile', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=peru&hl=es-419&gl=PE&ceid=PE:es-419', name: 'Google News Peru', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=venezuela&hl=es-419&gl=VE&ceid=VE:es-419', name: 'Google News Venezuela', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=iraq&hl=ar&gl=IQ&ceid=IQ:ar', name: 'Google News Iraq', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=jordan&hl=ar&gl=JO&ceid=JO:ar', name: 'Google News Jordan', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=lebanon&hl=ar&gl=LB&ceid=LB:ar', name: 'Google News Lebanon', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=syria&hl=ar&gl=SY&ceid=SY:ar', name: 'Google News Syria', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=yemen&hl=ar&gl=YE&ceid=YE:ar', name: 'Google News Yemen', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=palestine&hl=ar&gl=PS&ceid=PS:ar', name: 'Google News Palestine', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=israel&hl=en&gl=IL&ceid=IL:en', name: 'Google News Israel', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=turkey&hl=tr&gl=TR&ceid=TR:tr', name: 'Google News Turkey', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=iran&hl=fa&gl=IR&ceid=IR:fa', name: 'Google News Iran', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=pakistan&hl=en-PK&gl=PK&ceid=PK:en', name: 'Google News Pakistan', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=indonesia&hl=id&gl=ID&ceid=ID:id', name: 'Google News Indonesia', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=malaysia&hl=en-MY&gl=MY&ceid=MY:en', name: 'Google News Malaysia', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=philippines&hl=en-PH&gl=PH&ceid=PH:en', name: 'Google News Philippines', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=thailand&hl=th&gl=TH&ceid=TH:th', name: 'Google News Thailand', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=vietnam&hl=vi&gl=VN&ceid=VN:vi', name: 'Google News Vietnam', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=south+korea&hl=ko&gl=KR&ceid=KR:ko', name: 'Google News South Korea', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=ukraine&hl=uk&gl=UA&ceid=UA:uk', name: 'Google News Ukraine', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=poland&hl=pl&gl=PL&ceid=PL:pl', name: 'Google News Poland', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=romania&hl=ro&gl=RO&ceid=RO:ro', name: 'Google News Romania', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=greece&hl=el&gl=GR&ceid=GR:el', name: 'Google News Greece', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=portugal&hl=pt-PT&gl=PT&ceid=PT:pt-150', name: 'Google News Portugal', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=netherlands&hl=nl&gl=NL&ceid=NL:nl', name: 'Google News Netherlands', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=belgium&hl=nl&gl=BE&ceid=BE:nl', name: 'Google News Belgium', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=switzerland&hl=de&gl=CH&ceid=CH:de', name: 'Google News Switzerland', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=austria&hl=de&gl=AT&ceid=AT:de', name: 'Google News Austria', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=sweden&hl=sv&gl=SE&ceid=SE:sv', name: 'Google News Sweden', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=norway&hl=no&gl=NO&ceid=NO:no', name: 'Google News Norway', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=denmark&hl=da&gl=DK&ceid=DK:da', name: 'Google News Denmark', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=finland&hl=fi&gl=FI&ceid=FI:fi', name: 'Google News Finland', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=ireland&hl=en-IE&gl=IE&ceid=IE:en', name: 'Google News Ireland', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=new+zealand&hl=en-NZ&gl=NZ&ceid=NZ:en', name: 'Google News New Zealand', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=singapore&hl=en-SG&gl=SG&ceid=SG:en', name: 'Google News Singapore', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=hong+kong&hl=zh-HK&gl=HK&ceid=HK:zh-Hant', name: 'Google News Hong Kong', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=taiwan&hl=zh-TW&gl=TW&ceid=TW:zh-Hant', name: 'Google News Taiwan', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=bangladesh&hl=en-BD&gl=BD&ceid=BD:en', name: 'Google News Bangladesh', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=sri+lanka&hl=en-LK&gl=LK&ceid=LK:en', name: 'Google News Sri Lanka', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=nepal&hl=en-NP&gl=NP&ceid=NP:en', name: 'Google News Nepal', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=afghanistan&hl=en-AF&gl=AF&ceid=AF:en', name: 'Google News Afghanistan', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=ethiopia&hl=en-ET&gl=ET&ceid=ET:en', name: 'Google News Ethiopia', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=ghana&hl=en-GH&gl=GH&ceid=GH:en', name: 'Google News Ghana', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=tanzania&hl=en-TZ&gl=TZ&ceid=TZ:en', name: 'Google News Tanzania', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=uganda&hl=en-UG&gl=UG&ceid=UG:en', name: 'Google News Uganda', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=senegal&hl=fr&gl=SN&ceid=SN:fr', name: 'Google News Senegal', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=morocco&hl=ar&gl=MA&ceid=MA:ar', name: 'Google News Morocco', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=algeria&hl=ar&gl=DZ&ceid=DZ:ar', name: 'Google News Algeria', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=tunisia&hl=ar&gl=TN&ceid=TN:ar', name: 'Google News Tunisia', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=libya&hl=ar&gl=LY&ceid=LY:ar', name: 'Google News Libya', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=sudan&hl=ar&gl=SD&ceid=SD:ar', name: 'Google News Sudan', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=mauritania&hl=ar&gl=MR&ceid=MR:ar', name: 'Google News Mauritania', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=somalia&hl=en-SO&gl=SO&ceid=SO:en', name: 'Google News Somalia', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=djibouti&hl=fr&gl=DJ&ceid=DJ:fr', name: 'Google News Djibouti', category: 'world' },
    { url: 'https://news.google.com/rss/search?q=comoros&hl=fr&gl=KM&ceid=KM:fr', name: 'Google News Comoros', category: 'world' },
];

// ==========================================================
// دوال جلب الأخبار ومعالجتها
// ==========================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// دالة ترجمة مجانية باستخدام جوجل
async function translateText(text, targetLang = 'ar') {
    if (!text) return "";
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const data = await res.json();
        return data[0].map(item => item[0]).join("");
    } catch (e) {
        console.error("خطأ في الترجمة:", e);
        return text; 
    }
}

function extractImage(item) {
    let match = item.match(/<enclosure[^>]+url="([^"]+)"/i) || item.match(/<media:content[^>]+url="([^"]+)"/i) || item.match(/<media:thumbnail[^>]+url="([^"]+)"/i) || item.match(/<img[^>]+src="([^">]+)"/i);
    return match ? match[1] : null;
}

async function fetchFeed(feed) {
    try {
        const response = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const xml = await response.text();
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g);
        if (!items) return;

        for (const item of items.slice(0, 3)) { // 3 أخبار فقط لتجنب البطء
            const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
            const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
            const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
            const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

            let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
            let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";
            const link = linkMatch ? linkMatch[1].trim() : "";
            const pubDate = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();
            const imageUrl = extractImage(item);

            if (!title || !link) continue;

            // كشف اللغة (إذا كانت إنجليزية نترجمها)
            const isEnglish = /^[a-zA-Z\s.,!?'"()-]+$/.test(title);
            let finalTitle = title;
            let finalSummary = description.substring(0, 500);
            let originalTitle = title;
            let originalSummary = finalSummary;
            let lang = 'ar';

            if (isEnglish) {
                lang = 'en';
                finalTitle = await translateText(title, 'ar');
                finalSummary = await translateText(description.substring(0, 500), 'ar');
            }

            // 1. إدخال الخبر باللغة العربية (أو الأصلية إذا كانت عربية)
            const articleData = {
                url: link, 
                title: finalTitle,
                summary: finalSummary,
                image_url: imageUrl,
                category: feed.category,
                source_name: feed.name,
                source_url: feed.url,
                lang: lang,
                verification: 'multi',
                published_at: new Date(pubDate).toISOString()
            };

            const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?on_conflict=url`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates,return=representation'
                },
                body: JSON.stringify(articleData)
            });

            // 2. إذا كان الخبر جديداً وإنجليزياً، نحفظ النص الأصلي في جدول الترجمات
            if (isEnglish) {
                const inserted = await res.json();
                if (inserted && inserted.length > 0) {
                    const articleId = inserted[0].id;
                    await fetch(`${SUPABASE_URL}/rest/v1/article_translations`, {
                        method: 'POST',
                        headers: {
                            'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            article_id: articleId,
                            lang: 'en',
                            title: originalTitle,
                            summary: originalSummary
                        })
                    });
                }
            }
        }
        console.log(`✅ تم ${feed.name}`);
    } catch (error) {
        console.error(`❌ فشل ${feed.name}: ${error.message}`);
    }
}

async function start() {
    console.log(`🚀 بدء الجلب...`);
    for (const feed of RSS_FEEDS) {
        await fetchFeed(feed);
        await new Promise(r => setTimeout(r, 200)); 
    }
    console.log("🎉 انتهى!");
}
start();