// قائمة المصادر (يمكنك إضافة أو حذف أي رابط من هنا)
const RSS_FEEDS = [
    { url: 'https://feeds.bbci.co.uk/arabic/rss.xml', name: 'BBC عربي', category: 'world' },
    { url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9', name: 'الجزيرة', category: 'world' },
    { url: 'https://www.skynewsarabia.com/rss', name: 'سكاي نيوز عربية', category: 'world' },
    { url: 'https://www.spa.gov.sa/rss', name: 'واس', category: 'politics' }
];

// إعدادات قاعدة البيانات
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function fetchAndPublish() {
    console.log("بدء عملية جلب الأخبار...");
    
    for (const feed of RSS_FEEDS) {
        try {
            console.log(`جاري جلب الأخبار من: ${feed.name}`);
            const response = await fetch(feed.url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const xml = await response.text();
            
            // استخراج الأخبار باستخدام Regex
            const items = xml.match(/<item>([\s\S]*?)<\/item>/g);
            if (!items) continue;

            // جلب أول 5 أخبار فقط من كل مصدر لتجنب التكرار
            for (const item of items.slice(0, 5)) {
                const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
                const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
                const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
                const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

                const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
                const link = linkMatch ? linkMatch[1].trim() : "";
                let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";
                const pubDate = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();

                if (!title || !link) continue;

                // تجهيز البيانات لإرسالها إلى Supabase
                const articleData = {
                    url: link, // الرابط الفريد لمنع التكرار
                    title: title,
                    summary: description.substring(0, 500),
                    category: feed.category,
                    source_name: feed.name,
                    source_url: feed.url,
                    lang: 'ar',
                    verification: 'multi',
                    published_at: new Date(pubDate).toISOString()
                };

                // إرسال الخبر إلى Supabase
                const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?on_conflict=url`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'resolution=ignore-duplicates'
                    },
                    body: JSON.stringify(articleData)
                });

                if (!res.ok) {
                    console.log(`فشل إدخال خبر من ${feed.name}:`, await res.text());
                }
            }
            console.log(`تم الانتهاء من ${feed.name}`);
        } catch (error) {
            console.error(`خطأ في المصدر ${feed.name}:`, error.message);
        }
    }
    console.log("تمت العملية بالكامل!");
}

fetchAndPublish();