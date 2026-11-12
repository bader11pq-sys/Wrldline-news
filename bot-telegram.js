const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const TELEGRAM_CHANNELS = [
    { username: 'Alibk3', name: 'قناة علي' },
    { username: 'GhaybIntel', name: 'قناة الغيب' }
];

function cleanHTML(html) {
    if (!html) return "";
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '') 
        .replace(/<style[\s\S]*?<\/style>/gi, '')   
        .replace(/<[^>]+>/g, ' ') 
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/https?:\/\/\S+/g, '') 
        .replace(/\s+/g, ' ') 
        .trim();
}

function getRssUrl(channelUsername) {
    return `https://purfled.com/rss/telegram/${channelUsername}`;
}

// استخراج الصور بشكل أقوى، مع استخدام Proxy لصور تيليجرام
function extractImage(item) {
    // نبحث عن الصورة بأي شكل من الأشكال
    let match = item.match(/<enclosure[^>]+url="([^"]+)"/i) ||
                item.match(/<media:content[^>]+url="([^"]+)"/i) ||
                item.match(/<media:thumbnail[^>]+url="([^"]+)"/i) ||
                item.match(/<img[^>]+src="([^">]+)"/i);
    
    if (match) {
        let imgUrl = match[1];
        // إذا كانت الصورة من خوادم تيليجرام، نستخدم Proxy لتجاوز الحظر
        if (imgUrl.includes('telesco.pe') || imgUrl.includes('telegram.org')) {
            return `https://images.weserv.nl/?url=${encodeURIComponent(imgUrl)}`;
        }
        return imgUrl;
    }
    return null;
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

            const imageUrl = extractImage(item);

            let title = titleMatch ? cleanHTML(titleMatch[1]) : "";
            let description = descMatch ? cleanHTML(descMatch[1]) : "";
            const link = linkMatch ? linkMatch[1].trim() : "";
            const pubDate = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();

            if (!title && !description) continue;

            if (!title) {
                title = description.substring(0, 50) + "...";
            }
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
                summary: description.substring(0, 500),
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