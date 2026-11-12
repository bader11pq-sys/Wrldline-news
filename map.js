const API="https://vmaxbnogmmfyrcucapnq.supabase.co";
const KEY="sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
const $=id=>document.getElementById(id);
let lang=localStorage.getItem("wrldline:language")==="en"?"en":"ar";
const labels={ar:{critical:"حرج",high:"مرتفع",elevated:"متصاعد",guarded:"مراقبة",low:"منخفض",unknown:"غير محدد"},en:{critical:"Critical",high:"High",elevated:"Elevated",guarded:"Guarded",low:"Low",unknown:"Unknown"}};
const t=(ar,en)=>lang==="ar"?ar:en;const label=r=>labels[lang][r]||labels[lang].unknown;
const colors={critical:"#541522",high:"#d94b4b",elevated:"#e9953e",guarded:"#e6c84f",low:"#42a875",unknown:"#cbd3dc"};
let map,geoLayer,markerLayer,geoCache=null,articles=[],countryEvents=new Map(),activeCountry=null,activeCountryName="";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const riskClass=r=>"risk-"+(labels[lang][r]?r:"unknown");
function riskOf(items){return items.reduce((best,a)=>((a.ai_risk_score||0)>(best?.ai_risk_score||0)?a:best),null);}
function riskColor(a){return colors[a?.ai_risk_level]||colors.unknown;}
function fmtDate(d){if(!d)return t("وقت غير محدد","Time unavailable");const date=new Date(d);return Number.isNaN(date.getTime())?t("وقت غير محدد","Time unavailable"):date.toLocaleString(lang==="ar"?"ar-SA":"en-US",{dateStyle:"medium",timeStyle:"short"});}
function initMap(){map=L.map("worldMap",{worldCopyJump:true,scrollWheelZoom:true}).setView([24,25],2);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:8,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);}
function filteredItems(items){
 const risk=$("riskFilter").value,type=$("eventTypeFilter").value,days=Number($("timeFilter").value||7),since=Date.now()-days*86400000;
 return items.filter(a=>(risk==="all"||a.ai_risk_level===risk)&&(type==="all"||a.ai_event_type===type)&&new Date(a.published_at||0).getTime()>=since);
}
async function loadData(){
 try{
  const url=API+"/rest/v1/articles?select=id,title,summary,category,country,source_name,url,published_at,article_translations(*),ai_country_code,ai_region,ai_event_type,ai_risk_level,ai_risk_score,ai_confidence,ai_summary,ai_location_name,ai_latitude,ai_longitude,ai_classification_status&editorial_status=eq.published&ai_classification_status=eq.classified&ai_country_code=not.is.null&not.or=(url.ilike.*t.me*,source_url.ilike.*t.me*,source_name.ilike.*telegram*)&order=published_at.desc&limit=1000";
  const res=await fetch(url,{headers:{apikey:KEY,Authorization:"Bearer "+KEY}});
  if(!res.ok)throw new Error("تعذر تحميل التحليلات ("+res.status+")");
  const data=await res.json(),since=Date.now()-7*86400000;
  articles=(Array.isArray(data)?data:[]).filter(a=>a.ai_confidence>=0.68&&a.ai_country_code&&new Date(a.published_at||0).getTime()>=since).map(a=>{const tr=(a.article_translations||[]).find(x=>x.lang===lang);return {...a,title:tr?.title||a.title,summary:tr?.summary||a.summary,ai_summary:tr?.ai_summary||a.ai_summary};});
  countryEvents=new Map();for(const a of articles){const code=a.ai_country_code.toUpperCase();if(!countryEvents.has(code))countryEvents.set(code,[]);countryEvents.get(code).push(a);}
  $("statEvents").textContent=articles.length;$("statCountries").textContent=countryEvents.size;
  $("statHigh").textContent=articles.filter(a=>["high","critical"].includes(a.ai_risk_level)).length;
  $("statLocations").textContent=articles.filter(a=>Number.isFinite(a.ai_latitude)&&Number.isFinite(a.ai_longitude)).length;
  $("updatedAt").textContent=t("آخر تحديث: ","Last updated: ")+new Date().toLocaleTimeString(lang==="ar"?"ar-SA":"en-US");
  const types=[...new Set(articles.map(a=>a.ai_event_type).filter(Boolean))].sort();
  $("eventTypeFilter").innerHTML='<option value="all">'+t("كل أنواع الأحداث","All event types")+"</option>"+types.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join("");
  renderEvents(filteredItems(articles),t("أبرز الأحداث","Top events"));
  const geo=await fetch("https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson");
  if(!geo.ok)throw new Error("تعذر تحميل حدود الدول الجغرافية");
  geoCache=await geo.json();drawCountries(geoCache);addEventMarkers();
 }catch(err){$("eventList").innerHTML='<div class="empty">'+esc(err.message)+'</div>';$("updatedAt").textContent="تعذر تحديث المرصد";console.error(err);}
}
function countryCode(feature){const p=feature.properties||{};return String(p.ISO_A3||p.ADM0_A3||p.iso_a3||feature.id||"").toUpperCase();}
function countryName(feature){const p=feature.properties||{};const code=String(p.ISO_A2||p.iso_a2||"").toUpperCase();try{if(code&&code!=="-")return new Intl.DisplayNames([lang==="ar"?"ar":"en"],{type:"region"}).of(code);}catch{}return p.ADMIN||p.name||p.NAME||t("دولة","Country");}
function drawCountries(data){
 if(geoLayer)map.removeLayer(geoLayer);
 geoLayer=L.geoJSON(data,{style:feature=>{
  const top=riskOf(filteredItems(countryEvents.get(countryCode(feature))||[]));
  return {color:"#fff",weight:.7,fillColor:riskColor(top),fillOpacity:top?0.72:0.12};
 },onEachFeature:(feature,layer)=>{
  const code=countryCode(feature),name=countryName(feature),top=riskOf(filteredItems(countryEvents.get(code)||[]));
  layer.bindPopup('<strong>'+esc(name)+'</strong><br>'+(top?t("إشارة المخاطر: ","Risk signal: ")+esc(label(top.ai_risk_level))+" · "+(top.ai_risk_score||0)+"/100":t("لا توجد أحداث مصنّفة كافية","No sufficiently classified events")));
  layer.on({mouseover:e=>e.target.setStyle({weight:2,color:"#18283e",fillOpacity:.9}),mouseout:e=>geoLayer.resetStyle(e.target),click:()=>showCountry(code,name)});
 }}).addTo(map);
}
function addEventMarkers(){
 if(markerLayer)map.removeLayer(markerLayer);markerLayer=L.layerGroup().addTo(map);
 filteredItems(articles).filter(a=>Number.isFinite(a.ai_latitude)&&Number.isFinite(a.ai_longitude)).forEach(a=>{
  const marker=L.circleMarker([a.ai_latitude,a.ai_longitude],{radius:6,color:"#fff",weight:1,fillColor:riskColor(a),fillOpacity:.95});
  marker.bindPopup('<strong>'+esc(a.ai_location_name||a.ai_region||a.country)+'</strong><br>'+esc(a.title)+'<br><small>'+esc(label(a.ai_risk_level))+' · '+esc(fmtDate(a.published_at))+'</small>');
  marker.on("click",()=>showCountry(a.ai_country_code,a.country));marker.addTo(markerLayer);
 });
}
function renderEvents(items,title){
 $("panelTitle").textContent=title;$("eventCount").textContent=items.length+t(" حدث"," events");
 const host=$("eventList");if(!items.length){host.innerHTML='<div class="empty">'+t("لا توجد أحداث مطابقة في البيانات المصنّفة خلال الفترة المحددة.","No matching classified events in the selected period.")+'</div>';return;}
 host.innerHTML=items.slice(0,40).map(a=>'<article class="event"><div class="event-top"><span class="risk '+riskClass(a.ai_risk_level)+'">'+esc(label(a.ai_risk_level))+' · '+(a.ai_risk_score||0)+'/100</span><small>'+esc(a.country||"")+'</small></div><h3>'+esc(a.title)+'</h3><p>'+esc(a.ai_summary||a.summary||"")+'</p><p>'+esc(a.ai_event_type||"حدث عام")+' · '+esc(fmtDate(a.published_at))+'</p>'+(a.url?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer">المصدر الأصلي ↗</a>':"")+'</article>').join("");
}
function showCountry(code,name){
 activeCountry=code;activeCountryName=name;
 const items=filteredItems(countryEvents.get(String(code).toUpperCase())||[]),top=riskOf(items);
 $("countrySummary").innerHTML='<strong>'+esc(name)+'</strong><p>'+(items.length?items.length+(lang==="ar"?" أحداث مصنّفة خلال الفترة المحددة":" classified events in the selected period"):t("لا توجد أحداث مصنّفة كافية","No sufficiently classified events"))+'</p><span class="risk '+riskClass(top?.ai_risk_level)+'">'+(top?esc(label(top.ai_risk_level))+" · "+(top.ai_risk_score||0)+"/100":"لا توجد إشارة")+'</span>';
 renderEvents(items,t("أحداث ","Events about ")+name);
}
function refreshFilters(){
 if(geoCache)drawCountries(geoCache);addEventMarkers();
 if(activeCountry)showCountry(activeCountry,activeCountryName);
 else renderEvents(filteredItems(articles),t("أبرز الأحداث","Top events"));
}
$("riskFilter").addEventListener("change",refreshFilters);
$("timeFilter").addEventListener("change",refreshFilters);
$("eventTypeFilter").addEventListener("change",refreshFilters);
document.addEventListener("wrldline:language",event=>{lang=event.detail.lang;loadData();});
initMap();loadData();setInterval(loadData,300000);
