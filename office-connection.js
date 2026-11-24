// Leave empty for the same-domain route. Otherwise use only the HTTPS origin of the office Worker.
(() => {
  "use strict";
  const workerOrigin = "";
  let origin = "";
  if (workerOrigin) {
    const url = new URL(workerOrigin);
    if (url.protocol !== "https:" || url.origin !== workerOrigin) throw new Error("Expected an HTTPS origin without a path.");
    origin = url.origin;
  }
  const base = `${origin}/ai-office`;
  window.WRLDLINE_OFFICE_BASE = base;
  document.querySelectorAll("#office-launcher,[data-office-launcher]").forEach(link => { link.href = `${base}/`; });
})();
