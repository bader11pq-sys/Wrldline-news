// ... (نفس قائمة الـ 200 مصدر السابقة، سأختصرها هنا لتوفير المساحة، تأكد من بقائها كما هي في ملفك) ...
const RSS_FEEDS = [
    // ضع هنا قائمة الـ 200 مصدر التي أرسلتها لك في الرسالة السابقة
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World', category: 'world' },
    { url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9', name: 'الجزيرة', category: 'world' }
];

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
        await new Promise(r => setTimeout(r, 500)); 
    }
    console.log("🎉 انتهى!");
}
start();