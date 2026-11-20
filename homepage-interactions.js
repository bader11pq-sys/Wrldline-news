/* WRLDLINE homepage interactions — progressive enhancement only */
(() => {
  const ready = (fn) => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn, { once:true }) : fn();
  ready(() => {
    const root = document.documentElement;
    const themeButton = document.getElementById("themeButton");
    const applyThemeIcon = () => {
      if (!themeButton) return;
      const dark = root.dataset.theme === "dark";
      themeButton.innerHTML = '<svg aria-hidden="true"><use href="' + (dark ? '#i-sun' : '#i-moon') + '"></use></svg>';
      themeButton.setAttribute("aria-label", dark ? "التبديل إلى المظهر الفاتح" : "التبديل إلى المظهر الداكن");
      themeButton.setAttribute("aria-pressed", String(dark));
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = dark ? "#09121e" : "#f7f7f4";
    };
    applyThemeIcon();
    themeButton?.addEventListener("click", () => {
      requestAnimationFrame(() => {
        applyThemeIcon();
        window.dispatchEvent(new CustomEvent("wrldline:theme-change", { detail:{ theme:root.dataset.theme } }));
      });
    });

    const heroTitle = document.querySelector(".wl-hero-title");
    const intro = heroTitle?.querySelector("p");
    if (heroTitle && intro && !heroTitle.querySelector(".wl-hero-motto")) {
      const motto = document.createElement("div");
      motto.className = "wl-hero-motto";
      motto.setAttribute("aria-label", "هوية التغطية");
      motto.innerHTML = '<span class="motto-mark"><i aria-hidden="true"></i> نقرأ ما وراء العنوان</span><span class="wl-motto-word" aria-hidden="true">السياق يصنع الفهم</span>';
      intro.insertAdjacentElement("afterend", motto);
      const word = motto.querySelector(".wl-motto-word");
      const phrases = ["السياق يصنع الفهم", "الأثر يهم القارئ", "المصدر أساس الثقة", "الصورة الكاملة أولاً"];
      let index = 0;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce) window.setInterval(() => {
        word.classList.add("is-changing");
        window.setTimeout(() => {
          index = (index + 1) % phrases.length;
          word.textContent = phrases[index];
          word.classList.remove("is-changing");
        }, 230);
      }, 3600);
    }

    const revealTargets = document.querySelectorAll(
      ".wl-home main > section:not(.wl-hero), .wl-home .wl-signal-hub, .wl-home .coverage-pulse, .wl-home .site-footer"
    );
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if ("IntersectionObserver" in window && !reduceMotion) {
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("wl-home-reveal", "is-visible");
          obs.unobserve(entry.target);
        });
      }, { threshold:0.08, rootMargin:"0px 0px -35px 0px" });
      revealTargets.forEach(el => {
        el.classList.add("wl-home-reveal");
        observer.observe(el);
      });
    }

    const header = document.getElementById("siteHeader");
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        header?.classList.toggle("is-stuck", window.scrollY > 12);
        ticking = false;
      });
    }, { passive:true });
  });
})();
