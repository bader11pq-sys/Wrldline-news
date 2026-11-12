const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";

let state = {
    articles: [],
    filtered: [],
    category: 'all',
    country: 'all',
    lang: 'ar',
    limit: 12
};

// تشغيل الموقع
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchNews();
    initMarkets();
});

// جلب الأخبار من Supabase
async function fetchNews() {
    try {
        // جلب الأخبار مع جدول الترجمات المرتبط بها
        const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=*,article_translations(*)&order=published_at.desc&limit=100`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
        });
        const data = await res.json();
        
        if (data && data.length > 0) {
            state.articles = data.map(a => {
                // البحث عن ترجمة باللغة المطلوبة
                const trans = a.article_translations?.find(t => t.lang === state.lang);

                return {
                    id: a.id,
                    // إذا وجدنا ترجمة نستخدمها، وإلا نستخدم النص الأصلي
                    title: trans ? trans.title : a.title,
                    summary: trans ? trans.summary : a.summary,
                    img: a.image_url && a.image_url.startsWith('http') ? a.image_url : `https://picsum.photos/seed/${a.id}/800/500`,
                    cat: a.category || 'world',
                    country: a.country || 'دولي',
                    src: a.source_name,
                    time: new Date(a.published_at).toLocaleTimeString(state.lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })
                };
            });
        } else {
            state.articles = []; 
        }
    } catch (e) {
        state.articles = [];
    }
    
    populateCountries();
    applyFilters();
}

// تعبئة قائمة الدول
function populateCountries() {
    const select = document.getElementById('countryFilter');
    const countries = [...new Set(state.articles.map(a => a.country))].filter(c => c && c !== 'دولي');
    countries.sort();
    select.innerHTML = '<option value="all">🌍 كل الدول</option>';
    countries.forEach(c => { select.innerHTML += `<option value="${c}">${c}</option>`; });
}

// الفلترة
function filterCategory(cat, el) {
    state.category = cat;
    state.limit = 12;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(el) el.classList.add('active');
    applyFilters();
}

function filterCountry(country) {
    state.country = country;
    state.limit = 12;
    applyFilters();
}

function applyFilters() {
    state.filtered = state.articles.filter(a => {
        const matchCat = state.category === 'all' || a.cat === state.category;
        const matchCountry = state.country === 'all' || a.country === state.country;
        return matchCat && matchCountry;
    });
    renderUI();
}

// رسم الواجهة
function renderUI() {
    const heroArea = document.getElementById('heroLayout');
    const gridArea = document.getElementById('newsGrid');
    
    if (state.filtered.length === 0) {
        heroArea.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);grid-column:1/-1;">لا توجد أخبار حالياً.</div>`;
        gridArea.innerHTML = '';
        document.getElementById('loadMoreWrap').style.display = 'none';
        return;
    }

    // الخبر الرئيسي
    const main = state.filtered[0];
    const sides = state.filtered.slice(1, 4);
    
    heroArea.innerHTML = `
        <div class="hero-main" onclick="openArticle('${main.id}')">
            <img src="${main.img}" alt="">
            <div class="hero-meta"><span>${main.cat.toUpperCase()}</span><span>📍 ${main.country}</span></div>
            <h1 class="hero-title">${main.title}</h1>
            <p class="hero-desc">${main.summary}</p>
            <div style="font-size:0.8rem; color:var(--text-muted);">${main.src} • ${main.time}</div>
        </div>
        <div class="hero-side">
            ${sides.map(s => `
                <div class="side-card" onclick="openArticle('${s.id}')">
                    <img src="${s.img}" alt="">
                    <div>
                        <div class="side-title">${s.title}</div>
                        <div class="side-meta">${s.src} • ${s.time}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // شبكة الأخبار
    const rest = state.filtered.slice(4, state.limit);
    gridArea.innerHTML = rest.map(a => `
        <div class="card" onclick="openArticle('${a.id}')">
            <img src="${a.img}" alt="">
            <div class="card-body">
                <div class="card-cat">${a.cat}</div>
                <h3 class="card-title">${a.title}</h3>
                <p class="card-desc">${a.summary}</p>
                <div class="card-footer">
                    <span>${a.src} • ${a.time}</span>
                    <span class="country-badge">📍 ${a.country}</span>
                </div>
            </div>
        </div>
    `).join('');

    // زر المزيد
    const wrap = document.getElementById('loadMoreWrap');
    wrap.style.display = state.limit >= state.filtered.length ? 'none' : 'block';
}

function loadMore() {
    state.limit += 9;
    renderUI();
}

// فتح الخبر
function openArticle(id) {
    const a = state.articles.find(x => x.id === id);
    if(!a) return;
    
    document.getElementById('modalContent').innerHTML = `
        <button class="close-modal" onclick="closeArticle()">✕</button>
        <img src="${a.img}" class="modal-img">
        <div class="modal-body">
            <div class="card-cat">${a.cat} | 📍 ${a.country}</div>
            <h1 class="modal-title">${a.title}</h1>
            <p class="modal-lead">${a.summary}</p>
            <div class="modal-text">
                <p>هذا نص تجريبي للخبر. في المنصة الحقيقية، يتم وضع تفاصيل الخبر هنا.</p>
                <p>المصدر: ${a.src} - التوقيت: ${a.time}</p>
            </div>
        </div>
    `;
    document.getElementById('articleModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeArticle() {
    document.getElementById('articleModal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

// الأسعار
function initMarkets() {
    const markets = [
        { n: 'برنت', p: 92.01, c: 0.6 }, { n: 'الذهب', p: 4043.62, c: 0.3 }, 
        { n: 'بيتكوين', p: 73866, c: 1.2 }, { n: 'S&P 500', p: 7520.93, c: -0.38 }
    ];
    const html = markets.map(m => `
        <div class="market-item">
            <span>${m.n}</span>
            <span>${m.p.toLocaleString()}</span>
            <span class="${m.c >= 0 ? 'market-up' : 'market-down'}">${m.c >= 0 ? '▲' : '▼'} ${Math.abs(m.c)}%</span>
        </div>
    `).join('');
    document.getElementById('marketsTicker').innerHTML = html + html;
}

// أدوات مساعدة
function toggleMenu() { document.getElementById('mainNav').classList.toggle('active'); }
function toggleSearch() { document.getElementById('searchOverlay').classList.toggle('active'); }
function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    document.getElementById('themeBtn').innerText = isDark ? '🌙' : '☀️';
}
function initTheme() {
    if(localStorage.getItem('theme') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('themeBtn').innerText = '☀️';
    }
}
function toggleLang() {
    state.lang = state.lang === 'ar' ? 'en' : 'ar';
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    document.getElementById('langBtn').innerText = state.lang === 'ar' ? 'EN' : 'ع';
    // لاحقاً: أضف كود جلب الترجمة هنا
}
function handleSearch(q) {
    const resDiv = document.getElementById('searchResults');
    if(!q) { resDiv.innerHTML = ''; return; }
    const results = state.articles.filter(a => a.title.includes(q));
    resDiv.innerHTML = results.map(a => `
        <div class="search-item" onclick="closeArticle(); toggleSearch(); openArticle('${a.id}')">
            <h4>${a.title}</h4>
            <span style="font-size:0.8rem;color:var(--text-muted)">${a.src}</span>
        </div>
    `).join('');
}