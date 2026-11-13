(() => {
  "use strict";
  const ROOT = document.getElementById("europeanaArchive");
  if (!ROOT || ROOT.dataset.ready === "1") return;
  ROOT.dataset.ready = "1";

  const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const countries = [
    ["","كل أوروبا"],["Albania","ألبانيا"],["Andorra","أندورا"],["Austria","النمسا"],["Belarus","بيلاروس"],["Belgium","بلجيكا"],
    ["Bosnia and Herzegovina","البوسنة والهرسك"],["Bulgaria","بلغاريا"],["Croatia","كرواتيا"],["Cyprus","قبرص"],["Czechia","التشيك"],
    ["Denmark","الدنمارك"],["Estonia","إستونيا"],["Finland","فنلندا"],["France","فرنسا"],["Germany","ألمانيا"],["Greece","اليونان"],
    ["Hungary","المجر"],["Iceland","آيسلندا"],["Ireland","أيرلندا"],["Italy","إيطاليا"],["Kosovo","كوسوفو"],["Latvia","لاتفيا"],
    ["Liechtenstein","ليختنشتاين"],["Lithuania","ليتوانيا"],["Luxembourg","لوكسمبورغ"],["Malta","مالطا"],["Moldova","مولدوفا"],
    ["Monaco","موناكو"],["Montenegro","الجبل الأسود"],["Netherlands","هولندا"],["North Macedonia","مقدونيا الشمالية"],["Norway","النرويج"],
    ["Poland","بولندا"],["Portugal","البرتغال"],["Romania","رومانيا"],["Russia","روسيا"],["San Marino","سان مارينو"],["Serbia","صربيا"],
    ["Slovakia","سلوفاكيا"],["Slovenia","سلوفينيا"],["Spain","إسبانيا"],["Sweden","السويد"],["Switzerland","سويسرا"],["Ukraine","أوكرانيا"],
    ["United Kingdom","المملكة المتحدة"],["Vatican City","الفاتيكان"]
  ];
  const $ = (selector) => ROOT.querySelector(selector);
  const countrySelect = $("#europeanaCountry");
  const searchInput = $("#europeanaQuery");
  const results = $("#europeanaResults");
  const status = $("#europeanaStatus");
  const more = $("#europeanaMore");
  let page = 1, lastQuery = null, total = 0, busy = false;

  countrySelect.innerHTML = countries.map(([v, label]) => '<option value="' + v + '">' + label + '</option>').join("");

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[ch]);
  }
  function safeURL(value) {
    try { const u = new URL(value); return u.protocol === "https:" ? u.href : ""; } catch { return ""; }
  }
  function render(items, append) {
    const html = items.map((item) => {
      const image = safeURL(item.preview);
      const href = safeURL(item.recordUrl);
      const meta = [item.year, item.creator, item.dataProvider || item.provider].filter(Boolean).map(escapeHTML).join(" · ");
      const rights = item.rights ? '<small class="eu-rights">' + escapeHTML(item.rights) + '</small>' : "";
      const media = image
        ? '<img loading="lazy" src="' + escapeHTML(image) + '" alt="' + escapeHTML(item.title) + '">'
        : '<div class="eu-no-image">قطعة من الأرشيف الرقمي</div>';
      return '<article class="eu-card">' + media + '<div class="eu-card-body"><h3>' + escapeHTML(item.title) + '</h3>' +
        (meta ? '<p class="eu-meta">' + meta + '</p>' : '') +
        (item.description ? '<p class="eu-description">' + escapeHTML(item.description).slice(0, 240) + '</p>' : '') +
        '<div class="eu-card-foot">' + rights + (href ? '<a href="' + escapeHTML(href) + '" target="_blank" rel="noopener noreferrer">عرض السجل لدى المؤسسة ↗</a>' : '') + '</div></div></article>';
    }).join("");
    if (append) results.insertAdjacentHTML("beforeend", html);
    else results.innerHTML = html;
  }
  async function search(reset = true) {
    if (busy) return;
    const country = countrySelect.value;
    const query = searchInput.value.trim();
    if (!country && !query) {
      status.textContent = "اختر دولة أوروبية أو اكتب موضوعاً تاريخياً للبحث.";
      return;
    }
    if (reset) { page = 1; results.innerHTML = ""; total = 0; }
    busy = true;
    status.textContent = "جارٍ البحث في مقتنيات المتاحف والمكتبات والأرشيفات الأوروبية…";
    more.hidden = true;
    const request = { country, query, page };
    lastQuery = request;
    try {
      const response = await fetch(SUPABASE_URL + "/functions/v1/europeana-history", {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(25000),
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || ("تعذر الاتصال بخدمة Europeana (" + response.status + ")."));
      total = data.totalResults || 0;
      if (!data.items?.length && page === 1) {
        status.textContent = "لم نعثر على مقتنيات مطابقة. جرّب كلمة بحث أخرى أو دولة مختلفة.";
        results.innerHTML = "";
      } else {
        render(data.items || [], !reset);
        const shown = results.querySelectorAll(".eu-card").length;
        status.textContent = "عُثر على " + total.toLocaleString("ar") + " سجل · المعروض " + shown.toLocaleString("ar") + " · المصدر: Europeana";
        more.hidden = shown >= total || shown === 0;
      }
    } catch (error) {
      status.textContent = error?.message || "حدث خطأ أثناء جلب المقتنيات.";
      if (page === 1) results.innerHTML = "";
    } finally {
      busy = false;
    }
  }
  $("#europeanaSearch").addEventListener("click", () => search(true));
  searchInput.addEventListener("keydown", (event) => { if (event.key === "Enter") search(true); });
  countrySelect.addEventListener("change", () => search(true));
  more.addEventListener("click", () => { if (!busy && lastQuery) { page += 1; search(false); } });
  ROOT.querySelectorAll("[data-eu-topic]").forEach((button) => button.addEventListener("click", () => {
    searchInput.value = button.dataset.euTopic;
    search(true);
  }));
  searchInput.value = "European history";
  search(true);
})();
