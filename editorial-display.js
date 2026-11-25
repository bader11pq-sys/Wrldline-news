// ISO labels shared by the homepage and monitor. The ISO table is checked against the Edge fixture.
(function (root) {
  const pairs = [
    "ABWAW AFGAF AGOAO AIAAI ALAAX ALBAL ANDAD AREAE ARGAR ARMAM ASMAS ATAAQ",
    "ATFTF ATGAG AUSAU AUTAT AZEAZ BDIBI BELBE BENBJ BESBQ BFABF BGDBD BGRBG",
    "BHRBH BHSBS BIHBA BLMBL BLRBY BLZBZ BMUBM BOLBO BRABR BRBBB BRNBN BTNBT",
    "BVTBV BWABW CAFCF CANCA CCKCC CHECH CHLCL CHNCN CIVCI CMRCM CODCD COGCG",
    "COKCK COLCO COMKM CPVCV CRICR CUBCU CUWCW CXRCX CYMKY CYPCY CZECZ DEUDE",
    "DJIDJ DMADM DNKDK DOMDO DZADZ ECUEC EGYEG ERIER ESHEH ESPES ESTEE ETHET",
    "FINFI FJIFJ FLKFK FRAFR FROFO FSMFM GABGA GBRGB GEOGE GGYGG GHAGH GIBGI",
    "GINGN GLPGP GMBGM GNBGW GNQGQ GRCGR GRDGD GRLGL GTMGT GUFGF GUMGU GUYGY",
    "HKGHK HMDHM HNDHN HRVHR HTIHT HUNHU IDNID IMNIM INDIN IOTIO IRLIE IRNIR",
    "IRQIQ ISLIS ISRIL ITAIT JAMJM JEYJE JORJO JPNJP KAZKZ KENKE KGZKG KHMKH",
    "KIRKI KNAKN KORKR KWTKW LAOLA LBNLB LBRLR LBYLY LCALC LIELI LKALK LSOLS",
    "LTULT LUXLU LVALV MACMO MAFMF MARMA MCOMC MDAMD MDGMG MDVMV MEXMX MHLMH",
    "MKDMK MLIML MLTMT MMRMM MNEME MNGMN MNPMP MOZMZ MRTMR MSRMS MTQMQ MUSMU",
    "MWIMW MYSMY MYTYT NAMNA NCLNC NERNE NFKNF NGANG NICNI NIUNU NLDNL NORNO",
    "NPLNP NRUNR NZLNZ OMNOM PAKPK PANPA PCNPN PERPE PHLPH PLWPW PNGPG POLPL",
    "PRIPR PRKKP PRTPT PRYPY PSEPS PYFPF QATQA REURE ROURO RUSRU RWARW SAUSA",
    "SDNSD SENSN SGPSG SGSGS SHNSH SJMSJ SLBSB SLESL SLVSV SMRSM SOMSO SPMPM",
    "SRBRS SSDSS STPST SURSR SVKSK SVNSI SWESE SWZSZ SXMSX SYCSC SYRSY TCATC",
    "TCDTD TGOTG THATH TJKTJ TKLTK TKMTM TLSTL TONTO TTOTT TUNTN TURTR TUVTV",
    "TWNTW TZATZ UGAUG UKRUA UMIUM URYUY USAUS UZBUZ VATVA VCTVC VENVE VGBVG",
    "VIRVI VNMVN VUTVU WLFWF WSMWS YEMYE ZAFZA ZMBZM",
    "ZWEZW",
  ].join(" ").split(" ");
  const alpha2 = new Map(pairs.map(pair=>[pair.slice(0,3),pair.slice(3)]));
  const alpha3 = new Map([...alpha2].map(([three,two])=>[two,three]));
  const language = code=>code==="en"?"en":"ar";
  const names = {};
  function codeOf(iso3) { return alpha2.get(String(iso3||"").trim().toUpperCase()) || null; }
  function iso3Of(value) {
    if(typeof value!=="string")return null;
    const key=value.trim().toUpperCase();
    return alpha2.has(key)?key:alpha3.get(key)||null;
  }
  function countryName(iso3, locale) {
    const code=codeOf(iso3), lang=language(locale);
    if(!code)return "";
    try { names[lang] ||= new Intl.DisplayNames([lang],{type:"region",fallback:"none"});return names[lang].of(code)||""; }
    catch { return ""; }
  }
  function eventCountry(article) {
    const value=typeof article.event_country==="string"?article.event_country.trim():"";
    return /^(?:دولي|غير محدد|unknown|international|world|)$/iu.test(value)?null:value;
  }
  const countryAliases = {
    ARE:["الإمارات","الإمارات العربية المتحدة","UAE","U.A.E."],
    GBR:["بريطانيا","المملكة المتحدة","UK","U.K.","Britain"],
    SAU:["السعودية","المملكة العربية السعودية"],
    USA:["الولايات المتحدة الأمريكية","أمريكا","United States of America","USA","U.S.","U.S.A."],
    TUR:["Turkey"], PSE:["فلسطين","Palestine","State of Palestine"], RUS:["Russian Federation"],
    SYR:["سورية","Syrian Arab Republic"], CZE:["Czech Republic"], CIV:["Ivory Coast"], VNM:["Viet Nam"]
  };
  const countryKey = value => value.normalize("NFKD").toLowerCase()
    .replace(/[\p{M}\p{Cf}\u0640]/gu,"").replace(/ى/g,"ي").replace(/[.’']/g,"").replace(/\s+/g," ").trim();
  let countryIndex;
  function eventCountryCode(article) {
    const value=eventCountry(article);
    if(!value)return null;
    // The editorial field is authoritative; never substitute the publisher or an unrelated AI code.
    // Names such as Chad/Oman are not treated as ISO tokens unless the input is already uppercase.
    if(/^[A-Z]{2,3}$/.test(value)&&iso3Of(value))return iso3Of(value);
    if(!countryIndex){
      countryIndex=new Map();
      for(const iso3 of alpha2.keys()){
        for(const name of [countryName(iso3,"ar"),countryName(iso3,"en"),...(countryAliases[iso3]||[])]){
          if(!name)continue;
          const key=countryKey(name), previous=countryIndex.get(key);
          countryIndex.set(key,previous===undefined||previous===iso3?iso3:null);
        }
      }
    }
    return countryIndex.get(countryKey(value))||null;
  }
  const types={
    announcement:["إعلان","Announcement"],diplomacy:["دبلوماسية","Diplomacy"],election:["انتخابات","Election"],
    conflict:["نزاع","Conflict"],crime:["جريمة","Crime"],legal:["قضاء","Legal"],protest:["احتجاج","Protest"],
    disaster:["كارثة","Disaster"],accident:["حادث","Accident"],public_health:["صحة عامة","Public health"],
    market:["أسواق","Markets"],technology:["تقنية","Technology"],sports:["رياضة","Sports"],
    science:["علوم","Science"],culture:["ثقافة","Culture"],other:["أخرى","Other"]
  };
  function eventType(value) { return typeof value==="string"&&Object.hasOwn(types,value)?value:null; }
  function eventTypeLabel(value,locale) {
    const key=eventType(value), english=language(locale)==="en";
    return key?types[key][english?1:0]:(english?"Unspecified event type":"نوع الحدث غير محدد");
  }
  const iso3List=()=>[...alpha2.keys()];
  const api=Object.freeze({iso3List,codeOf,iso3Of,countryName,eventCountry,eventCountryCode,eventType,eventTypeLabel});
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.WLEditorial=api;
})(typeof window==="undefined"?globalThis:window);
