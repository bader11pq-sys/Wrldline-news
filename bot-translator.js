const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function translateText(text, targetLang) {
    if (!text || text.trim() === "") return "";
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text.substring(0, 500))}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || !data[0]) return null;
        return data[0].map(item => item[0]).join("");
    } catch (e) {
        return null; 
    }
}

async function processTranslations() {
    console.log("🚀 بدء عملية الترجمة...");
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=id,title,summary,lang,article_translations(lang)&order=published_at.desc&limit=15`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    
    if (!res.ok) {
        console.error("❌ فشل الاتصال بقاعدة البيانات.");
        process.exit(1);
    }
    
    const articles = await res.json();
    console.log(`📊 فحص ${articles.length} خبراً...`);

    let count = 0;

    for (const article of articles) {
        const existingTrans = article.article_translations || [];
        
        if (article.lang === 'en' && !existingTrans.some(t => t.lang === 'ar')) {
            console.log(`🌍 ترجمة للعربية...`);
            const tTitle = await translateText(article.title, 'ar');
            if (tTitle) {
                const tSummary = article.summary ? await translateText(article.summary, 'ar') : '';
                await fetch(`${SUPABASE_URL}/rest/v1/article_translations`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ article_id: article.id, lang: 'ar', title: tTitle, summary: tSummary || "" })
                });
                count++;
            }
            await new Promise(r => setTimeout(r, 1500)); 
        }
        else if (article.lang === 'ar' && !existingTrans.some(t => t.lang === 'en')) {
            console.log(`🌍 ترجمة للإنجليزية...`);
            const tTitle = await translateText(article.title, 'en');
            if (tTitle) {
                const tSummary = article.summary ? await translateText(article.summary, 'en') : '';
                await fetch(`${SUPABASE_URL}/rest/v1/article_translations`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ article_id: article.id, lang: 'en', title: tTitle, summary: tSummary || "" })
                });
                count++;
            }
            await new Promise(r => setTimeout(r, 1500));
        }
    }
    console.log(`🎉 انتهت العملية! تمت ترجمة ${count} خبراً.`);
}

processTranslations().catch(err => {
    console.error("❌ خطأ فادح:", err);
    process.exit(1);
});