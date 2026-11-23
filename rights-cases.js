/* Local, progressively enhanced controls for the public evidence desk. */
(() => {
  "use strict";
  const filter = document.querySelector(".hn-filter");
  if (filter) {
    const search = document.getElementById("caseSearch");
    const topic = document.getElementById("caseTopic");
    const reset = document.getElementById("caseReset");
    const results = document.getElementById("caseResults");
    const empty = document.getElementById("caseEmpty");
    const normalize = value => value.normalize("NFKC").toLocaleLowerCase("ar")
      .replace(/[\u0640\u064b-\u065f\u0670]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي");
    const cards = [...document.querySelectorAll("#files .hn-card")].map(card => ({
      card, keywords: normalize(card.textContent)
    }));
    const number = new Intl.NumberFormat("ar");
    function update() {
      const tokens = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
      let count = 0;
      for (const { card, keywords } of cards) {
        card.hidden = Boolean(topic.value && card.dataset.topic !== topic.value) ||
          !tokens.every(token => keywords.includes(token));
        if (!card.hidden) count++;
      }
      const summary = `الملفات المعروضة: ${number.format(count)} من ${number.format(cards.length)}`;
      if (results.textContent !== summary) results.textContent = summary;
      empty.hidden = count !== 0;
      reset.disabled = !search.value && !topic.value;
    }
    search.addEventListener("input", update);
    topic.addEventListener("change", update);
    reset.addEventListener("click", () => {
      search.value = topic.value = "";
      search.focus();
      update();
    });
    window.addEventListener("pageshow", update);
    update();
    filter.hidden = false;
  }

  const nav = document.querySelector(".hn-case-nav");
  if (!nav) return;
  const links = [...nav.querySelectorAll("a")].map(link => ({
    link, section: document.getElementById(link.hash.slice(1))
  })).filter(item => item.section);
  const last = links.at(-1);
  let pending = false;
  let current;
  function updateLocation() {
    pending = false;
    const navBottom = nav.getBoundingClientRect().bottom;
    let next;
    for (const { link, section } of links) {
      const { top } = section.getBoundingClientRect();
      if (top > Math.max(navBottom, parseFloat(getComputedStyle(section).scrollMarginBlockStart)) + 8) break;
      next = link;
    }
    // A short final section cannot always scroll up to the sticky index.
    const root = document.scrollingElement;
    if (last && root && root.scrollTop > 0 && root.scrollHeight - root.clientHeight - root.scrollTop <= 2 &&
        last.section.getBoundingClientRect().top < window.innerHeight) next = last.link;
    if (next === current) return;
    current?.removeAttribute("aria-current");
    next?.setAttribute("aria-current", "location");
    current = next;
  }
  function schedule() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(updateLocation);
    }
  }
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("pageshow", schedule);
  schedule();
})();
