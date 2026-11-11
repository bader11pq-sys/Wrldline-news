const RSS_FEEDS = [
    { url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9', name: 'الجزيرة', category: 'world' },
    { url: 'https://www.skynewsarabia.com/rss', name: 'سكاي نيوز عربية', category: 'world' },
    { url: 'https://www.spa.gov.sa/rss', name: 'واس', category: 'politics' },
    { url: 'https://www.alarabiya.net/feed', name: 'العربية', category: 'world' },
    { url: 'https://arabic.cnn.com/api/v1/rss/rss.xml', name: 'CNN عربية', category: 'world' },
    { url: 'https://www.youm7.com/rss', name: 'اليوم السابع', category: 'world' },
    { url: 'https://aawsat.com/feed', name: 'الشرق الأوسط', category: 'world' },
    { url: 'https://www.alquds.co.uk/feed/', name: 'القدس العربي', category: 'world' },
    { url: 'https://www.alraimedia.com/rss', name: 'الرأي', category: 'world' },
    { url: 'https://arabnews.com/rss', name: 'Arab News', category: 'world' },
    { url: 'https://feeds.bbci.co.uk/arabic/rss.xml', name: 'BBC عربي', category: 'world' },
    { url: 'https://www.alwatanvoice.com/arabic/rss.xml', name: 'دنيا الوطن', category: 'world' },
    { url: 'https://www.maannews.net/rss', name: 'معاً', category: 'world' },
    { url: 'https://www.almasryalyoum.com/rss', name: 'المصري اليوم', category: 'world' },
    { url: 'https://www.alkhaleej.ae/rss', name: 'الخليج', category: 'world' }
];

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function extractImage(item) {
    let match = item.match(/<enclosure[^>]+url="([^"]+)"/i) || item.match(/<media:content[^>]+url="([^"]+)"/i) || item.match(/<media:thumbnail[^>]+url="([^"]+)"/i) || item.match(/<img[^>]+src="([^">]+)"/i);
    return match ? match[1] : null;
}

async function fetchFeed(feed) {
    try {
        console.log(`جاري جلب: ${feed.name}`);
        const response = await fetch(feed.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const xml = await response.text();
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g);
        if (!items) return;

        for (const item of items.slice(0, 5)) {
            const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
            const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
            const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
            const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

            const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
            const link = linkMatch ? linkMatch[1].trim() : "";
            let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";
            const pubDate = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();
            const imageUrl = extractImage(item);

            if (!title || !link) continue;

            const articleData = {
                url: link, title: title, summary: description.substring(0, 500), image_url: imageUrl,
                category: feed.category, source_name: feed.name, source_url: feed.url,
                lang: 'ar', verification: 'multi', published_at: new Date(pubDate).toISOString()
            };

            await fetch(`${SUPABASE_URL}/rest/v1/articles?on_conflict=url`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates'
                },
                body: JSON.stringify(articleData)
            });
        }
        console.log(`✅ تم ${feed.name}`);
    } catch (error) {
        console.error(`❌ فشل ${feed.name}: ${error.message}`);
    }
}

async function start() {
    console.log("🚀 بدء الجلب...");
    for (const feed of RSS_FEEDS) {
        await fetchFeed(feed);
        await new Promise(r => setTimeout(r, 500)); // تأخير بسيط لمنع الحظر
    }
    console.log("🎉 انتهى!");
}
start();