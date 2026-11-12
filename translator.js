const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// دالة مساعدة لتنفيذ الطلبات مع معالجة الأخطاء
async function safeFetch(url, options = {}) {
    try {
        const res = await fetch(url, options);
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`❌ HTTP Error ${res.status}: ${errorText.substring(0, 200)}`);
            return null;
        }
        return res;
    } catch (e) {
        console.error(`❌ Network Error: ${e.message}`);
        return null;
    }
}

// دالة الترجمة
async function translateText(text, targetLang) {
    if (!text || text.trim() === "") return "";
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text.substring(0, 500))}`;
        const res = await safeFetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (!res) return null; // فشل الاتصال

        const data = await res.json();
        if (!data || !data[0]) return null;
        
        return data[0].map(item => item[0]).join("");
    } catch (e) {
        console.error("Translation parse error:", e.message);
        return null; 
    }
}

async function processTranslations() {
    console.log("🚀 بدء عملية الترجمة التلقائية...");
    
    // 1. جلب الأخبار التي تحتاج ترجمة
    const res = await safeFetch(`${SUPABASE_URL}/rest/v1/articles?select=id,title,summary,lang,article_translations(lang)&order=published_at.desc&limit=10`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    
    if (!res) {
        console.error("❌ فشل الاتصال بقاعدة البيانات. تأكد من صحة SUPABASE_URL و SUPABASE_KEY.");
        return;
    }
    
    const articles = await res.json();
    console.log(`📊 تم جلب ${articles.length} خبراً للفحص.`);

    let translatedCount = 0;

    for (const article of articles) {
        const existingTrans = article.article_translations || [];
        
        // ترجمة من الإنجليزي للعربي
        if (article.lang === 'en' && !existingTrans.some(t => t.lang === 'ar')) {
            console.log(`🌍 ترجمة للعربية: ${article.title.substring(0, 30)}...`);
            const tTitle = await translateText(article.title, 'ar');
            if (tTitle) {
                const tSummary = article.summary ? await translateText(article.summary, 'ar') : '';
                
                const insertRes = await safeFetch(`${SUPABASE_URL}/rest/v1/article_translations`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ article_id: article.id, lang: 'ar', title: tTitle, summary: tSummary || "" })
                });
                
                if (insertRes) {
                    translatedCount++;
                    console.log(`✅ تم حفظ الترجمة العربية.`);
                }
            }
            await new Promise(r => setTimeout(r, 2000)); // تأخير لتجنب الحظر
        }
        
        // ترجمة من العربي للإنجليزي
        else if (article.lang === 'ar' && !existingTrans.some(t => t.lang === 'en')) {
            console.log(`🌍 ترجمة للإنجليزية: ${article.title.substring(0, 30)}...`);
            const tTitle = await translateText(article.title, 'en');
            if (tTitle) {
                const tSummary = article.summary ? await translateText(article.summary, 'en') : '';
                
                const insertRes = await safeFetch(`${SUPABASE_URL}/rest/v1/article_translations`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ article_id: article.id, lang: 'en', title: tTitle, summary: tSummary || "" })
                });
                
                if (insertRes) {
                    translatedCount++;
                    console.log(`✅ تم حفظ الترجمة الإنجليزية.`);
                }
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    console.log(`🎉 انتهت العملية! تمت ترجمة ${translatedCount} خبراً.`);
}

processTranslations().catch(err => {
    console.error("❌ خطأ فادح في السكربت:", err);
    process.exit(1);
});