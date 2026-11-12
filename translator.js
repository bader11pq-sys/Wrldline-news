const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// دالة الترجمة المجانية باستخدام جوجل
async function translateText(text, targetLang) {
    if (!text) return "";
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const data = await res.json();
        return data[0].map(item => item[0]).join("");
    } catch (e) {
        console.error("Translation failed:", e);
        return text; 
    }
}

async function processTranslations() {
    console.log("🚀 بدء عملية الترجمة التلقائية...");
    
    // جلب أحدث 20 خبراً لم تتم ترجمتها بعد
    const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=id,title,summary,lang,article_translations(lang)&order=published_at.desc&limit=20`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const articles = await res.json();

    for (const article of articles) {
        const existingTrans = article.article_translations || [];
        
        // إذا كان الخبر إنجليزياً وليس له ترجمة عربية
        if (article.lang === 'en' && !existingTrans.some(t => t.lang === 'ar')) {
            console.log(`🌍 ترجمة للعربية: ${article.title.substring(0, 30)}...`);
            const tTitle = await translateText(article.title, 'ar');
            const tSummary = article.summary ? await translateText(article.summary, 'ar') : '';
            
            await fetch(`${SUPABASE_URL}/rest/v1/article_translations`, {
                method: 'POST',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ article_id: article.id, lang: 'ar', title: tTitle, summary: tSummary })
            });
            await new Promise(r => setTimeout(r, 1000)); 
        }
        
        // إذا كان الخبر عربياً وليس له ترجمة إنجليزية
        else if (article.lang === 'ar' && !existingTrans.some(t => t.lang === 'en')) {
            console.log(`🌍 ترجمة للإنجليزية: ${article.title.substring(0, 30)}...`);
            const tTitle = await translateText(article.title, 'en');
            const tSummary = article.summary ? await translateText(article.summary, 'en') : '';
            
            await fetch(`${SUPABASE_URL}/rest/v1/article_translations`, {
                method: 'POST',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ article_id: article.id, lang: 'en', title: tTitle, summary: tSummary })
            });
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    console.log("🎉 انتهت عملية الترجمة!");
}

processTranslations();