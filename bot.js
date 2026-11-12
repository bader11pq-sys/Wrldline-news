const RSS_FEEDS = [
    { url: 'https://feeds.bbci.co.uk/arabic/rss.xml', name: 'BBC عربي' },
    { url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9', name: 'الجزيرة' },
    { url: 'https://www.skynewsarabia.com/rss', name: 'سكاي نيوز عربية' },
    { url: 'https://www.spa.gov.sa/rss', name: 'واس' },
    { url: 'https://www.alarabiya.net/feed', name: 'العربية' },
    { url: 'https://arabic.cnn.com/api/v1/rss/rss.xml', name: 'CNN عربية' },
    { url: 'https://www.youm7.com/rss', name: 'اليوم السابع' },
    { url: 'https://www.alkhaleej.ae/rss', name: 'الخليج' },
    { url: 'https://www.alittihad.ae/rss', name: 'الاتحاد' },
    { url: 'https://www.albayan.ae/rss', name: 'البيان' },
    { url: 'https://www.alwatanvoice.com/arabic/rss.xml', name: 'دنيا الوطن' },
    { url: 'https://www.alghad.com/feed', name: 'الغد' },
    { url: 'https://royanews.tv/rss', name: 'رؤيا' },
    { url: 'https://www.assafir.com/rss', name: 'السفير' },
    { url: 'https://www.almodon.com/rss', name: 'المدن' },
    { url: 'https://www.alalam.ir/rss', name: 'العالم' },
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World' },
    { url: 'https://www.theguardian.com/world/rss', name: 'The Guardian' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera English' },
    { url: 'https://www.france24.com/en/rss', name: 'France 24' },
    { url: 'https://www.ft.com/rss/world', name: 'Financial Times' },
    { url: 'https://techcrunch.com/feed/', name: 'TechCrunch' },
    { url: 'https://www.espn.com/espn/rss/news', name: 'ESPN' }
];

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

function extractImage(item) {
    let match = item.match(/<enclosure[^>]+url="([^"]+)"/i) || item.match(/<media:content[^>]+url="([^"]+)"/i) || item.match(/<media:thumbnail[^>]+url="([^"]+)"/i) || item.match(/<img[^>]+src="([^">]+)"/i);
    return match ? match[1] : null;
}

// تصنيف الخبر بالذكاء الاصطناعي
async function analyzeWithAI(title, summary) {
    const prompt = `أنت خبير تصنيف أخبار. اقرأ هذا الخبر وأعد JSON فقط (بدون أي نصوص إضافية) يحتوي على مفتاحين:
    1. "category": اختر واحدة فقط من (politics, economy, security, sports, tech, culture, health, world).
    2. "country": اسم الدولة العربية التي يتحدث عنها الخبر (مثال: السعودية، الإمارات، مصر). إذا كان يخص عدة دول أو دولياً اكتب "دولي".
    
    العنوان: ${title}
    الملخص: ${summary}`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });
        const data = await res.json();
        return JSON.parse(data.candidates[0].content.parts[0].text);
    } catch (e) {
        // في حال فشل الذكاء الاصطناعي، نستخدم تصنيف افتراضي
        return { category: 'world', country: 'دولي' }; 
    }
}

async function fetchFeed(feed) {
    try {
        const response = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const xml = await response.text();
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g);
        if (!items) return;

        // نأخذ خبراً واحداً فقط من كل مصدر لتجنب بطء الـ AI
        for (const item of items.slice(0, 1)) { 
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

            console.log(`🧠 تحليل: ${title.substring(0, 30)}...`);
            const aiResult = await analyzeWithAI(title, description);
            
            const isEnglish = /[a-zA-Z]/.test(title) && !/[\u0600-\u06FF]/.test(title);
            const origLang = isEnglish ? 'en' : 'ar';

            const articleData = {
                url: link, 
                title: title,
                summary: description.substring(0, 500),
                image_url: imageUrl,
                category: aiResult.category,
                country: aiResult.country,
                source_name: feed.name,
                source_url: feed.url,
                lang: origLang,
                verification: 'multi',
                published_at: new Date(pubDate).toISOString()
            };

            await fetch(`${SUPABASE_URL}/rest/v1/articles?on_conflict=url`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates'
                },
                body: JSON.stringify(articleData)
            });
            // تأخير لتجنب حظر جوجل
            await new Promise(r => setTimeout(r, 2000)); 
        }
    } catch (error) {
        console.error(`❌ فشل ${feed.name}: ${error.message}`);
    }
}

async function start() {
    for (const feed of RSS_FEEDS) {
        await fetchFeed(feed);
        await new Promise(r => setTimeout(r, 500)); 
    }
}
start();