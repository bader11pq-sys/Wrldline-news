/* WRLDLINE navigation renderer.
 *
 * Every navigation surface is painted from window.WRLDLINE_SITE_SECTIONS:
 *   [data-nav="primary"]  the desktop bar under the masthead
 *   [data-nav="more"]     the More menu (products and tools, never the directory)
 *   [data-nav="drawer"]   the hamburger / all-sections drawer
 *   [data-nav="footer"]   the footer columns
 *
 * No label, href or hierarchy is defined here. If the registry changes, every
 * surface changes with it, in Arabic and English, on every page.
 */
(function () {
  "use strict";
  const registry = window.WRLDLINE_SITE_SECTIONS;
  if (!registry || window.__wlSiteNav) return;
  window.__wlSiteNav = true;

  const doc = document;
  const current = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const langOf = () => (doc.documentElement.lang === "en" ? "en" : "ar");
  const esc = value => String(value).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const bi = (ar, en, tag = "span") => `<${tag} lang="ar">${esc(ar)}</${tag}><${tag} lang="en">${esc(en)}</${tag}>`;

  /* Registry hrefs are site-root relative for pages the Worker owns and
   * document relative for static pages. Both work from any page at the root. */
  /* Editorial standards and corrections have dedicated English editions that the
   * language switch has always served through data-editorial-page. */
  const EDITORIAL_PAGES = { "about.html": "about", "corrections.html": "corrections" };
  const editorialAttr = item => {
    const page = EDITORIAL_PAGES[item.href.split("#")[0]];
    return page ? ` data-editorial-page="${page}"` : "";
  };

  function hrefOf(item) {
    const href = item.href;
    const [path, hash] = href.split("#");
    if (/^https?:/.test(path) || path === "news/") return href;
    const [file, query] = path.split("?");
    const editorial = EDITORIAL_PAGES[file];
    if (editorial) {
      const suffix = langOf() === "en" ? "-en" : "";
      return `/${file.replace(/\.html$/, "")}${suffix}.html${hash ? "#" + hash : ""}`;
    }
    if (path.startsWith("/") || path === "") return href;
    return file + (query ? "?" + query : "") + (hash ? "#" + hash : "");
  }

  function isActive(item) {
    const [path] = item.href.split(/[?#]/);
    const file = path.split("/").pop();
    return Boolean(file) && file === current;
  }

  const ICONS = {
    "daily-briefing": "i-sun",
    history: "i-book",
    analysis: "i-spark",
    "context-room": "i-compass",
    map: "i-map",
    markets: "i-chart",
    shorts: "i-layers",
    "for-you": "i-user",
    sections: "i-compass"
  };
  const icon = key => `<svg aria-hidden="true"><use href="#${ICONS[key] || "i-book"}"/></svg>`;

  function primaryLink(item) {
    const active = isActive(item);
    return `<a class="wl-nav-link${active ? " is-active" : ""}" href="${esc(hrefOf(item))}"${editorialAttr(item)} data-language-managed${active ? ' aria-current="page"' : ""}>${bi(item.ar, item.en)}</a>`;
  }

  function moreLink(item) {
    return `<a href="${esc(hrefOf(item))}"${editorialAttr(item)} data-language-managed><span class="wl-more-icon">${icon(item.key)}</span><span>${bi(item.ar, item.en)}</span></a>`;
  }

  function drawerSectionHeading(ar, en) {
    return `<h3 class="wl-drawer-group">${bi(ar, en)}</h3>`;
  }

  function drawerLink(item, nested) {
    const active = isActive(item);
    return `<a class="wl-drawer-link${nested ? " is-sub" : ""}${active ? " is-active" : ""}" href="${esc(hrefOf(item))}"${editorialAttr(item)} data-language-managed${active ? ' aria-current="page"' : ""}>${bi(item.ar, item.en)}</a>`;
  }

  function drawerHTML() {
    const l = langOf();
    const desks = registry.NEWS_SECTIONS.map(section => {
      const children = section.children.map(child => drawerLink(registry.item(child.key), true)).join("");
      return `<details class="wl-drawer-desk">
        <summary>${bi(section.ar, section.en)}</summary>
        <div class="wl-drawer-sub">${drawerLink(section, true)}${children}</div>
      </details>`;
    }).join("");

    const knowledge = registry.KNOWLEDGE_GROUPS.map(group =>
      `<section class="wl-drawer-block">${drawerSectionHeading(group.ar, group.en)}<div class="wl-drawer-list">${group.items.map(entry => drawerLink(registry.item(entry.key))).join("")}</div></section>`
    ).join("");

    const group = groupData =>
      `<section class="wl-drawer-block">${drawerSectionHeading(groupData.ar, groupData.en)}<div class="wl-drawer-list">${groupData.items.map(entry => drawerLink(registry.item(entry.key))).join("")}</div></section>`;

    return `<div class="wl-drawer-panel" role="document">
      <div class="wl-drawer-head">
        <h2>${bi("كل أقسام WRLDLINE", "Every WRLDLINE section")}</h2>
        <button class="wl-drawer-close" type="button" data-wl-drawer-close aria-label="${l === "en" ? "Close menu" : "إغلاق القائمة"}"><svg aria-hidden="true"><use href="#i-close"/></svg></button>
      </div>
      <div class="wl-drawer-body">
        <section class="wl-drawer-block">
          <div class="wl-drawer-list">
            <a class="wl-drawer-link" href="${hrefOf(registry.item("home"))}" data-language-managed>${bi(registry.item("home").ar, registry.item("home").en)}</a>
          </div>
          ${drawerSectionHeading("الأقسام الإخبارية", "News sections")}
          <div class="wl-drawer-desks">${desks}</div>
          <a class="wl-drawer-directory" href="sections.html" data-language-managed>${bi("دليل الأقسام الكامل", "Open the full sections directory")}</a>
        </section>
        ${knowledge}
        ${group(registry.TOOL_GROUP)}
        ${group(registry.SERVICE_GROUP)}
        ${group(registry.SITE_GROUP)}
      </div>
    </div>`;
  }

  function footerHTML() {
    return registry.FOOTER_COLUMNS.map(column =>
      `<div class="footer-col"><h3>${bi(column.ar, column.en)}</h3>${column.items.map(key => {
        const entry = registry.item(key);
        return `<a href="${esc(hrefOf(entry))}"${editorialAttr(entry)} data-language-managed>${bi(entry.ar, entry.en)}</a>`;
      }).join("")}</div>`
    ).join("");
  }

  function fill(name, html, mode = "inner") {
    doc.querySelectorAll(`[data-nav="${name}"]`).forEach(host => {
      host.innerHTML = html;
    });
  }

  function render() {
    fill("primary", registry.PRIMARY_NAV.map(key => primaryLink(registry.item(key))).join(""));
    fill("more", registry.MORE_MENU.map(key => moreLink(registry.item(key))).join(""));
    fill("drawer", drawerHTML());
    fill("footer", footerHTML());
    bindDrawer();
    bindMore();
    const label = langOf() === "en" ? "Sections" : "الأقسام";
    doc.querySelectorAll("[data-nav='primary']").forEach(nav => nav.setAttribute("aria-label", langOf() === "en" ? "Sections" : "الأقسام الرئيسية"));
    doc.querySelectorAll("[data-wl-drawer-open]").forEach(button => {
      if (!button.dataset.wlLabelBound) {
        button.dataset.wlLabelBound = "1";
        button.setAttribute("aria-controls", "siteDrawer");
        button.setAttribute("aria-expanded", "false");
      }
      button.setAttribute("aria-label", langOf() === "en" ? "Open all sections" : "فتح كل الأقسام");
      if (!button.textContent.trim()) button.dataset.wlLabel = label;
    });
  }

  /* ---------- drawer ---------- */
  function drawer() {
    let dialog = doc.getElementById("siteDrawer");
    if (dialog) return dialog;
    dialog = doc.createElement("dialog");
    dialog.id = "siteDrawer";
    dialog.className = "wl-drawer";
    dialog.setAttribute("aria-label", langOf() === "en" ? "All sections" : "كل الأقسام");
    dialog.innerHTML = `<div data-nav="drawer"></div>`;
    doc.body.appendChild(dialog);
    return dialog;
  }

  function openDrawer() {
    const dialog = drawer();
    if (!dialog.querySelector("[data-nav='drawer']").children.length) {
      dialog.querySelector("[data-nav='drawer']").innerHTML = drawerHTML();
      bindDrawer();
    }
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    doc.body.classList.add("wl-drawer-open");
    doc.querySelectorAll("[data-wl-drawer-open]").forEach(button => button.setAttribute("aria-expanded", "true"));
    dialog.querySelector("[data-wl-drawer-close]")?.focus({ preventScroll: true });
  }

  function closeDrawer() {
    const dialog = doc.getElementById("siteDrawer");
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
    doc.body.classList.remove("wl-drawer-open");
    doc.querySelectorAll("[data-wl-drawer-open]").forEach(button => button.setAttribute("aria-expanded", "false"));
  }

  function bindDrawer() {
    const dialog = doc.getElementById("siteDrawer");
    if (!dialog || dialog.dataset.bound) return;
    dialog.dataset.bound = "1";
    dialog.addEventListener("click", event => {
      if (event.target === dialog || event.target.closest("[data-wl-drawer-close]")) closeDrawer();
    });
    dialog.addEventListener("close", () => {
      doc.body.classList.remove("wl-drawer-open");
      doc.querySelectorAll("[data-wl-drawer-open]").forEach(button => button.setAttribute("aria-expanded", "false"));
    });
    dialog.addEventListener("click", event => {
      if (event.target.closest("a")) closeDrawer();
    });
    doc.addEventListener("keydown", event => {
      if (event.key === "Escape" && dialog.open) closeDrawer();
    });
  }

  /* ---------- More menu ---------- */
  function bindMore() {
    const button = doc.getElementById("moreButton");
    const menu = doc.getElementById("moreMenu");
    if (!button || !menu || button.dataset.wlBound) return;
    button.dataset.wlBound = "1";
    const close = () => { menu.classList.remove("is-open"); button.setAttribute("aria-expanded", "false"); };
    button.addEventListener("click", event => {
      event.stopPropagation();
      const open = menu.classList.toggle("is-open");
      button.setAttribute("aria-expanded", String(open));
    });
    doc.addEventListener("click", event => {
      if (!menu.contains(event.target) && !button.contains(event.target)) close();
    });
    doc.addEventListener("keydown", event => { if (event.key === "Escape" && menu.classList.contains("is-open")) { close(); button.focus(); } });
    menu.addEventListener("click", event => { if (event.target.closest("a")) close(); });
  }

  doc.addEventListener("click", event => {
    const trigger = event.target.closest("[data-wl-drawer-open]");
    if (!trigger) return;
    event.preventDefault();
    openDrawer();
  });

  doc.addEventListener("wrldline:language", () => {
    const dialog = doc.getElementById("siteDrawer");
    if (dialog) { dialog.remove(); }
    render();
  });

  window.WLSiteNav = { render, open: openDrawer, close: closeDrawer, registry };

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", render, { once: true });
  else render();
})();
