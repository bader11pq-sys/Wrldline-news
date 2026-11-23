(() => {
  "use strict";
  const form = document.getElementById("newsletterForm");
  const output = document.getElementById("dispatchPreview");
  if (!form || !output) return;
  const lists = new Intl.ListFormat("ar", {type:"conjunction"});
  function draw() {
    const checked = group => [...form.querySelectorAll(`input[name="${group}"]:checked`)]
      .map(input => input.closest("label").textContent.trim());
    const topics = checked("topics"), countries = checked("countries");
    output.textContent = [
      form.elements.namedItem("cadence").value === "weekly" ? "أسبوعيًا" : "يوميًا",
      topics.length ? lists.format(topics) : "جميع الأقسام",
      countries.length ? lists.format(countries) : "جميع الدول",
    ].join(" · ");
  }
  form.addEventListener("change", event => {
    if (["cadence","topics","countries"].includes(event.target.name)) draw();
  });
  form.addEventListener("reset", () => setTimeout(draw, 0));
  draw();
})();
