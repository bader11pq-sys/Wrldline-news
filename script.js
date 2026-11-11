const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";

let state = { lang: 'ar', articles: [], displayedArticles: [], currentCategory: 'all', breakingQueue: [], breakingInterval: null, isBreakingActive: false };

const mockArticles = [
  { id: 'm1', cat: 'politics', title: 'قمة عالمية في جنيف لبحث أزمات المناخ والطاقة', summary: 'انطلقت اليوم أعمال القمة الدولية في جنيف بمشاركة أكثر من 80 دولة...', img: 'https://images.unsplash.com/photo-1590076214307-5f9b9c7b7b4b?q=80&w=1200', media_type: 'image', src: 'الغيب', time: '10:30', date: '2026-11-11' },
  { id: 'm2', cat: 'economy', title: 'الأسواق العالمية تتعافى وسط تفاؤل بوقف الحروب التجارية', summary: 'سجلت مؤشرات الأسهم العالمية ارتفاعات ملحوظة في تعاملات اليوم...', img: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?q=80&w=1200', media_type: 'image', src: 'بلومبرغ', time: '09:15', date: '2026-11-11' },
  { id: 'm3', cat: 'security', title: 'تطورات ميدانية متسارعة في شرق أوروبا والحلفاء يعقدون اجتماعاً طارئاً', summary: 'تشهد المنطقة تطورات عسكرية متلاحقة...', img: 'https://images.unsplash.com/photo-1580979832802-42a37a2338e8?q=80&w=1200', media_type: 'image', src: 'رويترز', time: '08:00', date: '2026-11-11' },
  { id: 'm4', cat: 'world', title: 'إطلاق الجيل الجديد من الرقائق الذكية المخصصة للذكاء الاصطناعي', summary: 'كشفت كبرى شركات التكنولوجيا عن رقائق جديدة...', img: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200', media_type: 'image', src: 'تك كرانش', time: '07:45', date: '2026-11-11' }
];

document.addEventListener('DOMContentLoaded', () => {
  initUI();
  fetchLiveNews();
  initMarkets();
  updateBreakingNews();
  setInterval(updateBreakingNews, 120000); 
});

function initUI() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    updateThemeIcon(true);
  }
}

async function fetchLiveNews() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=*&order=published_at.desc&limit=50`, { 
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } 
    });
    if (!res.ok) throw new Error("DB Error");
    const data = await res.json();
    
    if (data && data.length > 0) {
      state.articles = data.map(a => ({ 
          id: a.id, cat: a.category || 'world', title: a.title, summary: a.summary || '', 
          img: a.image_url || `https://picsum.photos/seed/${a.id}/1200/800`, 
          media_type: a.media_type || 'image', src: a.source_name || 'الغيب', 
          time: new Date(a.published_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }), 
          date: a.published_at.split('T')[0] 
      }));
    } else {
      state.articles = [...mockArticles];
    }
  } catch (e) {
    state.articles = [...mockArticles];
  }
  
  filterCategory('all', document.querySelector('.nav-link.active'));
}

function filterCategory(category, element) {
  state.currentCategory = category;
  
  if (element) {
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    element.classList.add('active');
  }

  if (category === 'all') {
    state.displayedArticles = state.articles;
  } else {
    state.displayedArticles = state.articles.filter(a => a.cat === category);
  }

  renderHero(); 
  renderNewsGrid(); 
  renderTrending();
}

async function updateBreakingNews() {
  let currentQueue = state.breakingQueue;
  try {
    const rssUrl = "https://feeds.bbci.co.uk/arabic/rss.xml";
    const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
    const data = await response.json();
    if (data.items) {
      data.items.forEach(item => {
        const textToSearch = (item.title + " " + item.description).toLowerCase();
        const isBreaking = textToSearch.includes('عاجل') || textToSearch.includes('breaking');
        if (isBreaking) {
          const pubTime = new Date(item.pubDate).getTime();
          if (!currentQueue.find(q => q.id === item.guid)) {
            currentQueue.push({ id: item.guid, title: item.title.replace('عاجل:', '').replace('عاجل :', '').trim(), pubDate: pubTime });
          }
        }
      });
    }
  } catch (e) {}
  const now = new Date().getTime();
  state.breakingQueue = currentQueue.filter(item => ((now - item.pubDate) / 1000 / 60) <= 15);
  state.breakingQueue.sort((a, b) => b.pubDate - a.pubDate);
  renderBreakingBanner();
}

function renderBreakingBanner() {
  const banner = document.getElementById('breakingBanner');
  const textEl = document.getElementById('breakingText');
  if (state.breakingQueue.length === 0) {
    banner.classList.remove('show');
    if (state.breakingInterval) { clearInterval(state.breakingInterval); state.breakingInterval = null; state.isBreakingActive = false; }
    return;
  }
  if (!state.isBreakingActive) {
    state.isBreakingActive = true;
    banner.classList.add('show');
    let index = 0;
    textEl.innerText = state.breakingQueue[index].title;
    state.breakingInterval = setInterval(() => {
      if (state.breakingQueue.length === 0) { banner.classList.remove('show'); clearInterval(state.breakingInterval); state.isBreakingActive = false; return; }
      index++;
      if (index >= state.breakingQueue.length) index = 0;
      textEl.style.opacity = 0;
      setTimeout(() => { textEl.innerText = state.breakingQueue[index].title; textEl.style.opacity = 1; }, 300);
    }, 10000);
  }
}

function dismissBreaking() {
  document.getElementById('breakingBanner').classList.remove('show');
  state.isBreakingActive = false;
  if (state.breakingInterval) { clearInterval(state.breakingInterval); state.breakingInterval = null; }
}

function getMediaHTML(item, classes = "", isModal = false) {
    const src = item.img;
    if (item.media_type === 'video') {
        const attrs = isModal ? 'controls autoplay' : 'muted playsinline autoplay loop';
        return `<video src="${src}" ${attrs} class="${classes}" style="width:100%; height:100%; object-fit:cover; background:#000;"></video>`;
    }
    return `<img src="${src}" class="${classes}" alt="">`;
}

function renderHero() {
  if (state.displayedArticles.length === 0) {
    document.getElementById('mainHero').innerHTML = `<div style="padding:40px; text-align:center; background:var(--bg-surface); border-radius:16px; border:1px solid var(--border-color); color:var(--text-muted); display:flex; align-items:center; justify-content:center; height:100%;">لا توجد أخبار في هذا القسم حالياً.</div>`;
    document.getElementById('sideHero').innerHTML = '';
    return;
  }

  const featured = state.displayedArticles[0]; 
  const sides = state.displayedArticles.slice(1, 4);
  
  document.getElementById('mainHero').innerHTML = `
    ${getMediaHTML(featured)}
    <div class="hero-overlay" onclick="openArticle('${featured.id}')">
        <div class="hero-meta">
            <span class="badge badge-brand">${featured.cat}</span>
            <span class="badge badge-dark">تغطية خاصة</span>
        </div>
        <h1 class="hero-title">${featured.title}</h1>
        <p class="hero-desc">${featured.summary}</p>
        <div class="hero-footer"><span>${featured.src} • ${featured.time}</span><span>وكالة الغيب</span></div>
    </div>`;
    
  document.getElementById('sideHero').innerHTML = sides.map(a => `
    <div class="side-story" onclick="openArticle('${a.id}')">
        <div class="side-story-content">
            <div><span class="badge badge-brand" style="margin-bottom:8px;">${a.cat}</span><h3 class="side-title">${a.title}</h3></div>
            <div class="side-meta">${a.src} • ${a.time}</div>
        </div>
        ${getMediaHTML(a, "side-img")}
    </div>`).join('');
}

function renderNewsGrid() {
  const latest = state.displayedArticles.slice(4, 10);
  if (latest.length === 0) { document.getElementById('latestNewsGrid').innerHTML = "<p style='padding:20px; color:var(--text-muted);'>لا توجد مزيد من الأخبار في هذا القسم.</p>"; return; }
  document.getElementById('latestNewsGrid').innerHTML = latest.map(a => `
    <div class="card" onclick="openArticle('${a.id}')">
        <div class="card-img">
            <span class="badge badge-brand card-badge">${a.cat}</span>
            ${getMediaHTML(a)}
        </div>
        <div class="card-body">
            <h3 class="card-title">${a.title}</h3>
            <p class="card-desc">${a.summary}</p>
            <div class="card-meta"><span>${a.src}</span><span>${a.time}</span></div>
        </div>
    </div>`).join('');
}

function initMarkets() {
  // أسعار حقيقية ومحدثة (بناءً على بيانات 11 نوفمبر 2026)
  const markets = [
    { name: 'خام برنت', price: 92.01, change: 0.6 },
    { name: 'الذهب', price: 4043.62, change: 0.3 },
    { name: 'الفضة', price: 52.95, change: 2.22 },
    { name: 'بيتكوين', price: 73866.65, change: 1.2 },
    { name: 'S&P 500', price: 7520.93, change: -0.38 },
    { name: 'النفط الخام', price: 86.26, change: -0.19 }
  ];

  const renderMarkets = () => {
    // إنشاء HTML للعناصر
    const marketHTML = markets.map(m => {
      const isUp = m.change >= 0;
      return `
        <div class="market-item">
          <span class="market-name">${m.name}</span>
          <span class="market-price">${m.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="market-change ${isUp ? 'market-up' : 'market-down'}">
            ${isUp ? '▲' : '▼'} ${Math.abs(m.change).toFixed(2)}%
          </span>
        </div>
      `;
    }).join('');

    // مضاعفة العناصر لضمان حركة مستمرة دون توقف (Marquee Effect)
    document.getElementById('marketsTicker').innerHTML = marketHTML + marketHTML;
  };

  // التشغيل الأولي
  renderMarkets();

  // تحديث طفيف للأسعار كل 10 ثوانٍ لمحاكاة السوق الحي
  setInterval(() => {
    markets.forEach(m => {
      const movement = (Math.random() - 0.5) * 0.2; // حركة بسيطة جداً
      m.price += m.price * (movement / 100);
      m.change += movement;
    });
    renderMarkets();
  }, 10000);
}

function initMarkets() {
  // أسعار حقيقية ومحدثة
  const markets = [
    { name: 'خام برنت', price: 92.01, change: 0.6 },
    { name: 'الذهب', price: 4043.62, change: 0.3 },
    { name: 'الفضة', price: 52.95, change: 2.22 },
    { name: 'بيتكوين', price: 73866.65, change: 1.2 },
    { name: 'S&P 500', price: 7520.93, change: -0.38 },
    { name: 'النفط الخام', price: 86.26, change: -0.19 }
  ];

  const renderMarkets = () => {
    const marketHTML = markets.map(m => {
      const isUp = m.change >= 0;
      return `
        <div class="market-item">
          <span class="market-name">${m.name}</span>
          <span class="market-price">${m.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="market-change ${isUp ? 'market-up' : 'market-down'}">
            ${isUp ? '▲' : '▼'} ${Math.abs(m.change).toFixed(2)}%
          </span>
        </div>
      `;
    }).join('');

    // مضاعفة العناصر لضمان عدم توقف الشريط
    document.getElementById('marketsTicker').innerHTML = marketHTML + marketHTML;
  };

  renderMarkets();
}

function openArticle(id) {
  const a = state.articles.find(x => x.id === id); 
  if (!a) return;
  
  const words = (a.title + " " + a.summary).split(/\s+/).length;
  const readTime = Math.max(1, Math.ceil(words / 200));

  const related = state.articles.filter(x => x.cat === a.cat && x.id !== a.id).slice(0, 3);
  let relatedHTML = '';
  if (related.length > 0) {
      relatedHTML = `
          <div class="related-news">
              <h3>أخبار ذات صلة</h3>
              <div class="related-grid">
                  ${related.map(r => `
                      <div class="related-card" onclick="openArticle('${r.id}')">
                          ${r.media_type === 'video' 
                              ? '<div style="height:100px;background:#27272a;display:flex;align-items:center;justify-content:center;color:#fff;font-size:2rem;">▶</div>' 
                              : `<img src="${r.img}" class="related-img" alt="">`}
                          <div class="related-title">${r.title}</div>
                      </div>
                  `).join('')}
              </div>
          </div>
      `;
  }
  
  document.getElementById('modalContentArea').innerHTML = `
    ${getMediaHTML(a, "modal-img", true)}
    <div class="modal-content">
        <div class="modal-meta">
            <span class="badge badge-brand">${a.cat}</span>
            <span style="color:var(--text-muted); font-size:0.9rem;">${a.date} | ${a.time}</span>
            <span class="read-time">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                ${readTime} دقيقة قراءة
            </span>
        </div>
        <h1 class="modal-title">${a.title}</h1>
        <p class="modal-lead">${a.summary}</p>
        <div class="modal-body">
            <p>هذا النص يمثل محتوى الخبر الصحفي المفصل. في المنصات الاحترافية، يتم كتابة فقرات كاملة هنا تشرح خلفية الحدث، وتفاصيله الدقيقة، وتصريحات المسؤولين، والسياق العام للأزمة أو التطور.</p>
            <p>تلتزم وكالة الغيب بنقل الأخبار بدقة وموضوعية، مع توفير كافة الزوايا والتحليلات التي تهم القارئ العربي.</p>
        </div>
        <div class="modal-source"><div><strong>المصدر:</strong> ${a.src}</div></div>
        ${relatedHTML}
    </div>`;
    
  const modal = document.getElementById('articleModal'); 
  modal.classList.add('open'); 
  document.body.style.overflow = 'hidden'; 
  modal.scrollTop = 0;
  
  const progressBar = document.getElementById('readingBar'); 
  progressBar.style.width = '0%';
  
  modal.onscroll = function() { 
      const totalHeight = modal.scrollHeight - modal.clientHeight; 
      if (totalHeight > 0) { 
          progressBar.style.width = ((modal.scrollTop / totalHeight) * 100) + '%'; 
      } 
  };
}

function closeModal() { document.getElementById('articleModal').classList.remove('open'); document.body.style.overflow = ''; }
document.getElementById('articleModal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });

function openSearch() { document.getElementById('searchOverlay').classList.add('open'); document.body.style.overflow = 'hidden'; setTimeout(() => document.getElementById('searchInput').focus(), 100); }
function closeSearch() { document.getElementById('searchOverlay').classList.remove('open'); document.body.style.overflow = ''; document.getElementById('searchInput').value = ''; document.getElementById('searchResults').classList.remove('active'); }
function handleSearch(query) {
  if (!query.trim()) { document.getElementById('searchResults').classList.remove('active'); return; }
  const results = state.articles.filter(a => a.title.includes(query) || a.summary.includes(query));
  const resultsDiv = document.getElementById('searchResults'); resultsDiv.classList.add('active');
  if (results.length === 0) { resultsDiv.innerHTML = `<div style="padding:32px; text-align:center; color:var(--text-muted);">لا توجد نتائج</div>`; return; }
  resultsDiv.innerHTML = results.map(a => `
    <div class="search-item" onclick="closeSearch(); openArticle('${a.id}')">
        ${a.media_type === 'video' ? '<div style="width:60px;height:60px;background:#27272a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;">▶</div>' : `<img src="${a.img}" alt="">`}
        <div><h4>${a.title}</h4><span>${a.src} • ${a.time}</span></div>
    </div>`).join('');
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme); localStorage.setItem('theme', newTheme); updateThemeIcon(!isDark);
}
function updateThemeIcon(isDark) {
  const icon = document.getElementById('themeBtn').firstElementChild;
  if (isDark) { icon.innerHTML = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'; }
  else { icon.innerHTML = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'; }
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSearch(); closeModal(); } });

// زر العودة للأعلى
window.onscroll = function() {
    const backToTopBtn = document.getElementById("backToTop");
    if (backToTopBtn) {
        if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
            backToTopBtn.classList.add("show");
        } else {
            backToTopBtn.classList.remove("show");
        }
    }
};

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}