const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const TELEGRAM_CHANNELS = [
    { username: 'Alibk3', name: 'قناة علي' },
    { username: 'GhaybIntel', name: 'قناة الغيب' }
];

// دالة تنظيف النص من وسوم HTML والروابط
function cleanHTML(html) {
    if (!html) return "";
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '') 
        .replace(/<style[\s\S]*?<\/style>/gi, '')   
        .replace(/<[^>]+>/g, ' ') // إزالة جميع الوسوم
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/https?:\/\/\S+/g, '') // إزالة الروابط الطويلة
        .replace(/\s+/g, ' ') // إزالة المسافات الزائدة
        .trim();
}

function getRssUrl(channelUsername) {
    return `https://purfled.com/rss/telegram/${channelUsername}`;
}

// استخراج الصور من محتوى RSS
function extractImage(item) {
    let match = item.match(/<enclosure[^>]+url="([^"]+)"/i) ||
                item.match(/<media:content[^>]+url="([^"]+)"/i) ||
                item.match(/<media:thumbnail[^>]+url="([^"]+)"/i) ||
                item.match(/<img[^>]+src="([^">]+)"/i);
    return match ? match[1] : null;
}

async function analyzeWithAI(title, summary) {
    const prompt = `صنف هذا الخبر وأعد JSON فقط بمفتاحين:
    "category": واحدة من (politics, economy, security, sports, tech, culture, health, world)
    "country": اسم الدولة العربية أو "دولي"
    العنوان: ${title}
    الملخص: ${summary}`;
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
        });
        const data = await res.json();
        return JSON.parse(data.candidates[0].content.parts[0].text);
    } catch (e) {
        return { category: 'world', country: 'دولي' };
    }
}

async function fetchTelegramChannel(channel) {
    console.log(`📥 جلب من قناة: ${channel.name} (@${channel.username})`);
    const rssUrl = getRssUrl(channel.username);

    try {
        const response = await fetch(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const xml = await response.text();
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g);
        if (!items) return;

        for (const item of items.slice(0, 3)) {
            const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
            const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
            const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
            const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

            // 1. استخراج الصورة أولاً قبل التنظيف
            const imageUrl = extractImage(item);

            // 2. تنظيف النص
            let title = titleMatch ? cleanHTML(titleMatch[1]) : "";
            let description = descMatch ? cleanHTML(descMatch[1]) : "";
            const link = linkMatch ? linkMatch[1].trim() : "";
            const pubDate = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();

            if (!title && !description) continue; // تخطي إذا كان فارغاً

            // إذا لم يوجد عنوان، نأخذ أول 50 حرف من الوصف كعنوان
            if (!title) {
                title = description.substring(0, 50) + "...";
            }

            // إذا كان الوصف يحتوي على نفس نص العنوان، نفرغه
            if (description === title) {
                description = "";
            }

            console.log(`🧠 تحليل تيليجرام: ${title.substring(0, 30)}...`);
            const aiResult = await analyzeWithAI(title, description);

            const isEnglish = /[a-zA-Z]/.test(title) && !/[\u0600-\u06FF]/.test(title);
            const origLang = isEnglish ? 'en' : 'ar';

            const articleData = {
                url: link,
                title: title,
                summary: description.substring(0, 500), // سيتم حفظ النص النظيف فقط
                image_url: imageUrl,
                category: aiResult.category,
                country: aiResult.country,
                source_name: channel.name,
                source_url: `https://t.me/${channel.username}`,
                lang: origLang,
                verification: 'multi',
                published_at: new Date(pubDate).toISOString()
            };

            await fetch(`${SUPABASE_URL}/rest/v1/articles?on_conflict=url`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=ignore-duplicates'
                },
                body: JSON.stringify(articleData)
            });
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (error) {
        console.error(`❌ فشل قناة ${channel.name}: ${error.message}`);
    }
}

async function start() {
    console.log("🚀 بدء جلب قنوات تيليجرام...");
    for (const channel of TELEGRAM_CHANNELS) {
        await fetchTelegramChannel(channel);
        await new Promise(r => setTimeout(r, 1000));
    }
    console.log("🎉 انتهى!");
}

start();