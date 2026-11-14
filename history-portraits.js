(() => {
  const aliases = {
    "نابليون بونابرت":"Napoleon portrait", "ماري كوري":"Marie Curie portrait", "شارل ديغول":"Charles de Gaulle portrait",
    "مارتن لوثر":"Martin Luther portrait", "أوتو فون بسمارك":"Otto von Bismarck portrait", "ونستون تشرشل":"Winston Churchill portrait",
    "إليزابيث الأولى":"Elizabeth I portrait", "آن فرانك":"Anne Frank portrait", "رامبرانت":"Rembrandt portrait",
    "نيكولاس كوبرنيكوس":"Nicolaus Copernicus portrait", "ألفريد نوبل":"Alfred Nobel portrait", "فلاديمير لينين":"Vladimir Lenin portrait",
    "ابن رشد":"Averroes Ibn Rushd portrait", "ابن بطوطة":"Ibn Battuta portrait", "يوسف بن تاشفين":"Yusuf ibn Tashfin portrait",
    "فاطمة المرنيسي":"Fatema Mernissi portrait", "نيلسون مانديلا":"Nelson Mandela portrait", "ديزموند توتو":"Desmond Tutu portrait",
    "إيفا بيرون":"Eva Peron portrait", "خوسيه دي سان مارتين":"Jose de San Martin portrait", "سيمون بوليفار":"Simon Bolivar portrait",
    "جواهر لال نهرو":"Jawaharlal Nehru portrait", "سوكارنو":"Sukarno portrait", "هو تشي منه":"Ho Chi Minh portrait",
    "الملك سيجونغ":"King Sejong portrait", "ألفريد العظيم":"Alfred the Great portrait", "جستنيان الأول":"Justinian portrait"
  };
  const key = name => "wrldline:portrait:" + name;
  const getCached = name => { try { return localStorage.getItem(key(name)) || ""; } catch { return ""; } };
  const setCached = (name, value) => { try { localStorage.setItem(key(name), value || "none"); } catch {} };
  async function find(name) {
    const cached = getCached(name);
    if (cached) return cached === "none" ? "" : cached;
    const query = aliases[name] || name + " historical figure portrait";
    try {
      const url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=" + encodeURIComponent(query) + "&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url|mime&iiurlwidth=360&format=json&origin=*";
      const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
      const data = await response.json();
      const page = Object.values(data.query?.pages || {})[0];
      const info = page?.imageinfo?.[0];
      const image = info && /^image\/(jpeg|png|webp)$/i.test(info.mime || "") ? (info.thumburl || info.url || "") : "";
      setCached(name, image || "none");
      return image;
    } catch { setCached(name, "none"); return ""; }
  }
  window.WLPortraits = { find };
})();
