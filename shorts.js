(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const feed = $("shortsFeed"), counter = $("shortsCounter");
  const langButton = $("shortsLanguage"), themeButton = $("shortsTheme"), musicButton = $("shortsMusic");
  const previous = $("shortsPrevious"), next = $("shortsNext"), musicStatus = $("shortsMusicStatus");
  const menu = $("shortsMenu");
  const API_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
  const API_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
  const PAGE = 24, savedKey = "wrldline:shorts:saved";
  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const arabicDate = new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" });
  const englishDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
  const labels = {
    ar: { politics: "سياسة", economy: "اقتصاد", security: "أمن ودفاع", tech: "تكنولوجيا", sports: "رياضة", culture: "ثقافة", health: "صحة", world: "حول العالم" },
    en: { politics: "Politics", economy: "Economy", security: "Security & Defence", tech: "Technology", sports: "Sports", culture: "Culture", health: "Health", world: "Around the world" },
  };
  function getPref(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function setPref(key, value) { try { localStorage.setItem(key, value); } catch {} }
  let lang = getPref("wrldline:language") === "en" ? "en" : "ar";
  let theme = getPref("wrldline:theme") === "light" ? "light" : "dark";
  let stories = [], slides = [], active = -1, nextOffset = 0, hasMore = false;
  let anchor = "", loading = false, loadingMore = false, refreshing = false, loadError = false, moreError = false, pageHidden = false, scrollFrame = 0;
  let musicState = { state: "off", enabled: false };
  const t = (ar, en) => lang === "ar" ? ar : en;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function safe(value) {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  }
  function date(value) {
    const parsed = new Date(value);
    return !value || Number.isNaN(parsed.getTime()) ? "" : t(arabicDate, englishDate).format(parsed);
  }

  const soundtrack = window.WRLDLINE_SHORTS_SOUNDTRACK?.create({ onState: (state) => {
    musicState = state;
    updateMusicButton();
  } });
  const playingVideos = new Set();
  function syncSound() { soundtrack?.setSuspended(pageHidden || document.hidden || playingVideos.size > 0); }
  function updateMusicButton() {
    const { state, enabled } = musicState;
    musicButton.setAttribute("aria-pressed", String(enabled));
    musicButton.setAttribute("aria-label", enabled ? t("إيقاف موسيقى الخلفية", "Turn off background music") : t("تشغيل موسيقى الخلفية", "Turn on background music"));
    $("shortsMusicLabel").textContent = enabled ? t("الموسيقى تعمل", "Music on") : t("الموسيقى", "Music");
    musicButton.classList.toggle("is-on", enabled);
    const message = state === "error" ? t("تعذر تشغيل الموسيقى. جرّب الضغط مرة أخرى.", "Could not play the music. Tap again to retry.")
      : state === "paused" && playingVideos.size ? t("الموسيقى متوقفة مؤقتًا أثناء الفيديو.", "Music paused while the video plays.") : "";
    if (musicStatus.textContent !== message) musicStatus.textContent = message;
    musicStatus.hidden = !message;
  }
  function setLanguage() {
    root.lang = lang;
    root.dir = t("rtl", "ltr");
    langButton.textContent = t("English", "العربية");
    langButton.lang = t("en", "ar");
    langButton.setAttribute("aria-label", t("Switch to English", "التبديل إلى العربية"));
    $("shortsBack").setAttribute("aria-label", t("العودة إلى الرئيسية", "Back to home"));
    $("shortsSkip").textContent = t("انتقل إلى الأخبار", "Skip to stories");
    $("shortsHeading").textContent = t("شورت الأخبار", "News Shorts");
    const menuLabel = t("روابط ورلدلاين", "WRLDLINE links");
    $("shortsMenuToggle").setAttribute("aria-label", menuLabel);
    $("shortsMenuLinks").setAttribute("aria-label", menuLabel);
    menu.querySelectorAll("[data-ar][data-en]").forEach((item) => { item.textContent = item.dataset[lang]; });
    $("shortsNavigation").setAttribute("aria-label", t("التنقل بين الأخبار", "Browse stories"));
    $("shortsPreviousLabel").textContent = t("السابق", "Previous");
    $("shortsNextLabel").textContent = t("التالي", "Next");
    $("shortsHint").textContent = t("اسحب للتنقّل", "Swipe to browse");
    updateMusicButton();
    updateTheme();
  }
  function updateTheme() {
    root.dataset.theme = theme;
    themeButton.textContent = theme === "dark" ? "☀" : "☾";
    themeButton.setAttribute("aria-label", theme === "dark" ? t("استخدام المظهر الفاتح", "Use light appearance") : t("استخدام المظهر الداكن", "Use dark appearance"));
  }

  function currentStoryId() { return slides[active]?.dataset.id || ""; }
  function savedSet() { try { return new Set(JSON.parse(getPref(savedKey) || "[]")); } catch { return new Set(); } }
  function articleLink(story) {
    const id = String(story.id);
    return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) ? `/news/${id.toLowerCase()}` : "";
  }
  function setActive(index, force = false) {
    if (index === active && !force) return;
    slides[active]?.classList.remove("is-active");
    active = index;
    slides[active]?.classList.add("is-active");
    for (const video of playingVideos) {
      if (!slides[active]?.contains(video)) video.pause();
    }
    updateNavigation();
  }
  function updateNavigation() {
    const count = slides.length;
    const value = count ? `${active + 1} / ${count}` : "— / —";
    if (counter.textContent !== value) counter.textContent = value;
    previous.setAttribute("aria-disabled", String(active <= 0));
    const last = active >= count - 1;
    next.setAttribute("aria-disabled", String(!count || (last && (!hasMore || loadingMore))));
    $("shortsNextLabel").textContent = last && loadingMore ? t("جارٍ التحميل…", "Loading…")
      : last && moreError ? t("إعادة المحاولة", "Retry") : t("التالي", "Next");
  }
  function scrollToSlide(index, smooth = true) {
    if (!slides[index]) return;
    feed.scrollTo({ top: slides[index].offsetTop, behavior: smooth && !reduced.matches ? "smooth" : "instant" });
    if (!smooth || reduced.matches) setActive(index);
  }
  function move(step) {
    if (!slides.length) return;
    const index = active + step;
    if (index >= slides.length && step > 0) { if (hasMore) void loadMore(true); return; }
    scrollToSlide(index);
  }

  function render(preserveId = "") {
    if (!stories.length) {
      showState(loadError ? "error" : "empty");
      return;
    }
    const focus = feed.contains(document.activeElement) && document.activeElement !== feed ? document.activeElement : null;
    const focusSelector = focus && [".shorts-read", ".shorts-source", ".shorts-save", ".shorts-share", ".shorts-video-play"]
      .find((selector) => focus.matches(selector));
    for (const video of playingVideos) video.pause();
    playingVideos.clear();
    feed.innerHTML = stories.map((story, index) => {
      const originalLanguage = /^(ar|en)/i.exec(story.lang || "")?.[1].toLowerCase() || (/[\u0600-\u06FF]/.test(story.title) ? "ar" : "en");
      const version = story.article_translations?.find((entry) => entry.lang === lang && entry.title && entry.summary);
      const title = version?.title || story.title;
      const summary = version?.summary || story.summary;
      const storyLanguage = version ? lang : originalLanguage;
      const image = safe(story.image_url), video = image && story.media_type === "video";
      const own = String(story.source_name || "").toUpperCase().includes("WRLDLINE");
      const source = safe(own ? (story.source_url || story.url) : (story.url || story.source_url));
      const reader = articleLink(story);
      const category = labels[lang][story.category] || t("غير مصنف", "Uncategorized");
      const sourceCount = Number(story.verification_independent_count) || Number(story.verification_source_count) || 0;
      const trust = story.trust_needs_review === true
        ? (story.editorial_trust_status === "disputed" ? "disputed" : (story.verification === "multi" ? "multi" : "unconfirmed"))
        : (story.editorial_trust_status || story.verification);
      const trustLabels = new Map([
        ["confirmed", t("مؤكد بمصادر متعددة", "Confirmed by multiple sources")],
        ["multi", t(`متعدد المصادر، غير مؤكد · ${sourceCount}`, `Multiple sources, unconfirmed · ${sourceCount}`)],
        ["preliminary", t("أولي", "Preliminary")],
        ["disputed", t("متنازع عليه", "Disputed")],
      ]);
      const time = date(story.published_at || story.received_at);
      const primary = index === 0;
      const art = video
        ? `<div class="shorts-video-panel"><video class="shorts-video" src="${esc(image)}" playsinline controls preload="none"></video><button class="shorts-video-play" type="button" aria-label="${t("تشغيل الفيديو", "Play video")}">▶</button></div>`
        : image ? `<img class="shorts-photo" src="${esc(image)}" alt="" decoding="async" loading="${primary ? "eager" : "lazy"}"${primary ? ' fetchpriority="high"' : ""}>` : "";
      return `<article class="shorts-slide${video ? " has-video" : ""}" data-id="${esc(story.id)}" aria-labelledby="shorts-title-${index}">
        ${art}
        <div class="shorts-copy">
          <div class="shorts-meta">
            ${story.is_breaking ? `<span class="shorts-category shorts-breaking">${t("عاجل", "BREAKING")}</span>` : ""}
            <span class="shorts-category">${esc(category)}</span>
            ${own ? `<span class="shorts-category">${esc(trustLabels.get(trust) || t("غير مؤكد", "Unconfirmed"))}</span>` : ""}
            ${time ? `<time datetime="${esc(story.published_at || story.received_at)}">${esc(time)}</time>` : ""}
          </div>
          <h2 id="shorts-title-${index}" dir="auto" lang="${storyLanguage}">${esc(title)}</h2>
          ${summary ? `<p class="shorts-summary" dir="auto" lang="${storyLanguage}">${esc(summary)}</p>` : ""}
          <div class="shorts-footer">
            <span class="shorts-credit" dir="auto">${esc(story.source_name || t("مصدر إخباري", "News source"))}</span>
            <div class="shorts-actions">
              ${reader ? `<a class="shorts-read" href="${reader}${lang === "en" ? "#lang=en" : ""}">${t("الخبر الكامل", "Full story")}</a>` : ""}
              ${source ? `<a class="shorts-source" href="${esc(source)}" target="_blank" rel="noopener noreferrer">${t("المصدر الأصلي ↗", "Original source ↗")}</a>` : ""}
            </div>
          </div>
        </div>
      </article>`;
    }).join("");
    slides = [...feed.querySelectorAll(".shorts-slide")];
    const saved = savedSet();
    slides.forEach((slide, index) => {
      const story = stories[index], actions = slide.querySelector(".shorts-actions");
      const image = slide.querySelector("img.shorts-photo");
      if (image) {
        const hideBroken = () => { image.hidden = true; };
        image.addEventListener("error", hideBroken, { once: true });
        if (image.complete && !image.naturalWidth) hideBroken();
      }
      const save = document.createElement("button");
      save.type = "button";
      save.className = "shorts-save";
      const id = String(story.id);
      const syncSave = () => {
        const on = saved.has(id);
        save.textContent = on ? t("محفوظ ✓", "Saved ✓") : t("حفظ", "Save");
        save.setAttribute("aria-pressed", String(on));
      };
      syncSave();
      save.addEventListener("click", () => {
        if (saved.has(id)) saved.delete(id); else saved.add(id);
        setPref(savedKey, JSON.stringify([...saved]));
        syncSave();
      });
      actions.append(save);
      if (window.WRLDLINE_SHARE) {
        const share = document.createElement("button");
        share.type = "button";
        share.className = "shorts-share";
        share.textContent = t("مشاركة", "Share");
        share.addEventListener("click", () => {
          const permalink = articleLink(story);
          const url = permalink ? new URL(permalink, location.origin).href : safe(story.url || story.source_url);
          return window.WRLDLINE_SHARE.share({
            title: slide.querySelector("h2").textContent,
            description: slide.querySelector(".shorts-summary")?.textContent || "",
            category: labels[lang][story.category] || "",
            source: story.source_name || "WRLDLINE NEWS", image: story.media_type === "video" ? "" : story.image_url || "",
            url, button: share,
          });
        });
        actions.append(share);
      }
      const video = slide.querySelector("video"), trigger = slide.querySelector(".shorts-video-play");
      if (!video || !trigger) return;
      const begin = () => {
        if (!video.isConnected) return;
        playingVideos.add(video);
        syncSound();
        updateMusicButton();
        trigger.hidden = true;
      };
      const finish = () => {
        if (!video.isConnected) return;
        playingVideos.delete(video);
        syncSound();
        updateMusicButton();
        trigger.hidden = false;
      };
      const videoError = () => {
        finish();
        if (!video.isConnected) return;
        trigger.classList.add("is-error");
        trigger.textContent = t("تعذر تشغيل الفيديو", "Video unavailable");
        trigger.setAttribute("aria-label", trigger.textContent);
      };
      trigger.addEventListener("click", () => {
        video.play().catch((error) => { if (error?.name !== "AbortError") videoError(); });
      });
      video.addEventListener("play", begin);
      video.addEventListener("pause", finish);
      video.addEventListener("ended", finish);
      video.addEventListener("error", videoError);
    });
    appendMore();
    const index = Math.max(0, slides.findIndex((slide) => slide.dataset.id === preserveId));
    setActive(index, true);
    scrollToSlide(index, false);
    if (focusSelector) slides[index].querySelector(focusSelector)?.focus({ preventScroll: true });
    syncSound();
    updateMusicButton();
  }

  function showState(type) {
    slides = [];
    active = -1;
    const states = {
      loading: [t("جارٍ تحميل الأخبار…", "Loading the latest stories…"), t("نجهز لك أحدث التغطيات.", "Preparing the latest coverage.")],
      empty: [t("لا توجد أخبار الآن", "No stories available"), t("يمكنك إعادة المحاولة للتحقق من وجود أخبار أحدث.", "Try again to check for newer stories.")],
      error: [t("تعذر تحميل الأخبار", "Could not load stories"), t("تحقق من اتصالك أو أعد المحاولة بعد قليل.", "Check your connection or try again in a moment.")],
    };
    const [title, detail] = states[type];
    feed.innerHTML = `<div class="shorts-state" role="status"><strong>${title}</strong><span>${detail}</span>
      ${type !== "loading" ? `<button id="shortsRetry" type="button">${t("إعادة المحاولة", "Retry")}</button>` : ""}</div>`;
    $("shortsRetry")?.addEventListener("click", loadAll);
    updateNavigation();
  }
  function appendMore() {
    if (!hasMore) return;
    feed.insertAdjacentHTML("beforeend", `<div class="shorts-more-wrap"><button id="shortsLoadMore" type="button">${moreError ? t("تعذرت الإضافة، أعد المحاولة", "Retry loading more") : t("تحميل المزيد من الأخبار", "Load more stories")}</button></div>`);
    $("shortsLoadMore").addEventListener("click", () => loadMore(true));
  }
  async function fetchPage(offset, limit, before) {
    // Only the same allowlisted public RPC as the front page; no direct table access.
    const response = await fetch(API_URL + "/rest/v1/rpc/public_home_news_recent_v3", {
      method:"POST",
      headers: { apikey: API_KEY, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        p_limit:limit, p_before: before, p_since: null, p_offset:offset,
        p_newsdata_only: null, p_is_breaking: null, p_is_exclusive: null,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`News RPC HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid news response");
    const publicStories = rows.filter((story) => story?.id && story.title && !/(?:t\.me(?:[/:]|$)|telegram\.me|telegram)/i.test([story.url, story.source_url, story.source_name].join(" ")))
      .map((story) => ({ ...story, article_translations: Array.isArray(story.article_translations)
        ? story.article_translations.filter((entry) => entry?.translation_status === "published" && entry.translation_source === "editorial") : [] }));
    return { stories: publicStories, size: rows.length };
  }
  function mergeRows(rows) {
    const merged = new Map(stories.map((story) => [String(story.id), story]));
    let changed = false;
    for (const story of rows) {
      const id = String(story.id), previous = merged.get(id);
      if (previous && JSON.stringify(previous) === JSON.stringify(story)) continue;
      merged.set(id, story);
      changed = true;
    }
    if (changed) stories = [...merged.values()].sort((a, b) => Date.parse(b.published_at || b.received_at) - Date.parse(a.published_at || a.received_at));
    return changed;
  }
  async function loadAll() {
    if (loading) return;
    const hadFocus = document.activeElement === $("shortsRetry");
    loading = true;
    loadError = false;
    feed.setAttribute("aria-busy", "true");
    showState("loading");
    try {
      anchor = new Date().toISOString();
      const page = await fetchPage(0, PAGE, anchor);
      stories = [];
      mergeRows(page.stories);
      nextOffset = page.size;
      hasMore = page.size === PAGE;
      render();
      jumpToHash();
    } catch (error) {
      loadError = true;
      console.warn("WRLDLINE Shorts:", error);
      showState("error");
    } finally {
      loading = false;
      feed.setAttribute("aria-busy", "false");
      if (hadFocus && document.activeElement === document.body) (loadError ? $("shortsRetry") : feed)?.focus({ preventScroll: true });
    }
  }
  async function loadMore(advance) {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    moreError = false;
    const button = $("shortsLoadMore"), startedOn = currentStoryId();
    if (button) {
      button.disabled = true;
      button.textContent = t("جارٍ التحميل…", "Loading…");
    }
    updateNavigation();
    try {
      const page = await fetchPage(nextOffset, PAGE, anchor);
      const preserve = currentStoryId();
      const restoreFocus = document.activeElement === button;
      nextOffset += page.size;
      hasMore = page.size === PAGE;
      loadingMore = false;
      mergeRows(page.stories);
      render(preserve);
      if (advance && startedOn === preserve && active + 1 < slides.length) scrollToSlide(active + 1);
      if (restoreFocus) next.focus({ preventScroll: true });
    } catch (error) {
      moreError = true;
      console.warn("WRLDLINE Shorts pagination:", error);
      if (button?.isConnected) {
        button.disabled = false;
        button.textContent = t("تعذرت الإضافة، أعد المحاولة", "Retry loading more");
      }
    } finally {
      loadingMore = false;
      updateNavigation();
    }
  }
  async function refresh() {
    if (!stories.length || document.hidden || loading || loadingMore || refreshing || playingVideos.size || feed.contains(document.activeElement)) return;
    refreshing = true;
    try {
      const page = await fetchPage(0, PAGE, new Date().toISOString());
      // A reader may have started a video or focused a card during the request.
      if (loadingMore || playingVideos.size || document.hidden || feed.contains(document.activeElement)) return;
      const preserve = currentStoryId();
      if (mergeRows(page.stories)) render(preserve);
    } catch (error) { console.warn("WRLDLINE Shorts refresh:", error); }
    finally { refreshing = false; }
  }
  function jumpToHash() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    if (!id) return;
    const index = slides.findIndex((slide) => slide.dataset.id === id);
    if (index >= 0) scrollToSlide(index, false);
  }
  feed.addEventListener("scroll", () => {
    if (scrollFrame || !slides.length) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      const index = Math.round(feed.scrollTop / Math.max(1, feed.clientHeight));
      setActive(Math.max(0, Math.min(slides.length - 1, index)));
    });
  }, { passive: true });
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      $("shortsMenuToggle").focus();
      return;
    }
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || !slides.length
        || event.target.closest?.("#shortsMenu,video,input,textarea,select,[contenteditable]")) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (event.target.closest?.(".shorts-slide")) feed.focus({ preventScroll: true });
      move(event.key === "ArrowDown" ? 1 : -1);
    }
  });
  document.addEventListener("click", (event) => {
    if (menu.open && (!menu.contains(event.target) || event.target.closest?.("[data-analytics-settings]"))) menu.open = false;
  });
  langButton.addEventListener("click", () => {
    const preserve = currentStoryId();
    lang = t("en", "ar");
    setPref("wrldline:language", lang);
    setLanguage();
    if (loading) showState("loading");
    else render(preserve);
  });
  themeButton.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    setPref("wrldline:theme", theme);
    updateTheme();
  });
  musicButton.addEventListener("click", () => soundtrack?.toggle());
  document.addEventListener("visibilitychange", () => {
    syncSound();
    if (!document.hidden) void refresh();
  });
  window.addEventListener("pagehide", () => { pageHidden = true; syncSound(); });
  window.addEventListener("pageshow", () => { pageHidden = false; syncSound(); });
  window.addEventListener("hashchange", jumpToHash);
  setLanguage();
  syncSound();
  void loadAll();
  window.setInterval(refresh, 60000);
})();
