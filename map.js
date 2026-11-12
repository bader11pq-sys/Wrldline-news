const API="https://vmaxbnogmmfyrcucapnq.supabase.co";
const KEY="sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";
const $=id=>document.getElementById(id);
const labels={critical:"حرج",high:"مرتفع",elevated:"متصاعد",guarded:"مراقبة",low:"منخفض",unknown:"غير محدد"};
const colors={critical:"#541522",high:"#d94b4b",elevated:"#e9953e",guarded:"#e6c84f",low:"#42a875",unknown:"#cbd3dc"};
let map,geoLayer,markerLayer,geoCache=null,articles=[],countryEvents=new Map(),activeCountry=null,activeCountryName="";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const riskClass=r=>"risk-"+(labels[r]?r:"unknown");
function riskOf(items){return items.reduce((best,a)=>((a.ai_risk_score||0)>(best?.ai_risk_score||0)?a:best),null);}
function riskColor(a){return colors[a?.ai_risk_level]||colors.unknown;}
function fmtDate(d){if(!d)return"وقت غير محدد";const date=new Date(d);return Number.isNaN(date.getTime())?"وقت غير محدد":date.toLocaleString("ar-SA",{dateStyle:"medium",timeStyle:"short"});}
function initMap(){map=L.map("worldMap",{worldCopyJump:true,scrollWheelZoom:true}).setView([24,25],2);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:8,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);}
function filteredItems(items){
 const risk=$("riskFilter").value,type=$("eventTypeFilter").value,days=Number($("timeFilter").value||7),since=Date.now()-days*86400000;
 return items.filter(a=>(risk==="all"||a.ai_risk_level===risk)&&(type==="all"||a.ai_event_type===type)&&new Date(a.published_at||0).getTime()>=since);
}
async function loadData(){
 try{
  const url=API+"/rest/v1/articles?select=id,title,summary,category,country,source_name,url,published_at,ai_country_code,ai_region,ai_event_type,ai_risk_level,ai_risk_score,ai_confidence,ai_summary,ai_location_name,ai_latitude,ai_longitude,ai_classification_status&editorial_status=eq.published&ai_classification_status=eq.classified&ai_country_code=not.is.null&not.or=(url.ilike.*t.me*,source_url.ilike.*t.me*,source_name.ilike.*telegram*)&order=published_at.desc&limit=1000";
  const res=await fetch(url,{headers:{apikey:KEY,Authorization:"Bearer "+KEY}});
  if(!res.ok)throw new Error("تعذر تحميل التحليلات ("+res.status+")");
  const data=await res.json(),since=Date.now()-7*86400000;
  articles=(Array.isArray(data)?data:[]).filter(a=>a.ai_confidence>=0.68&&a.ai_country_code&&new Date(a.published_at||0).getTime()>=since);
  countryEvents=new Map();for(const a of articles){const code=a.ai_country_code.toUpperCase();if(!countryEvents.has(code))countryEvents.set(code,[]);countryEvents.get(code).push(a);}
  $("statEvents").textContent=articles.length;$("statCountries").textContent=countryEvents.size;
  $("statHigh").textContent=articles.filter(a=>["high","critical"].includes(a.ai_risk_level)).length;
  $("statLocations").textContent=articles.filter(a=>Number.isFinite(a.ai_latitude)&&Number.isFinite(a.ai_longitude)).length;
  $("updatedAt").textContent="آخر تحديث: "+new Date().toLocaleTimeString("ar-SA");
  const types=[...new Set(articles.map(a=>a.ai_event_type).filter(Boolean))].sort();
  $("eventTypeFilter").innerHTML='<option value="all">كل أنواع الأحداث</option>'+types.map(t=>'<option value="'+esc(t)+'">'+esc(t)+'</option>').join("");
  renderEvents(filteredItems(articles),"أبرز الأحداث");
  const geo=await fetch("https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson");
  if(!geo.ok)throw new Error("تعذر تحميل حدود الدول الجغرافية");
  geoCache=await geo.json();drawCountries(geoCache);addEventMarkers();
 }catch(err){$("eventList").innerHTML='<div class="empty">'+esc(err.message)+'</div>';$("updatedAt").textContent="تعذر تحديث المرصد";console.error(err);}
}
function countryCode(feature){const p=feature.properties||{};return String(p.ISO_A3||p.ADM0_A3||p.iso_a3||"").toUpperCase();}
function countryName(feature){const p=feature.properties||{};return p.ADMIN||p.name||p.NAME||"دولة";}
function drawCountries(data){
 if(geoLayer)map.removeLayer(geoLayer);
 geoLayer=L.geoJSON(data,{style:feature=>{
  const top=riskOf(filteredItems(countryEvents.get(countryCode(feature))||[]));
  return {color:"#fff",weight:.7,fillColor:riskColor(top),fillOpacity:top?0.72:0.12};
 },onEachFeature:(feature,layer)=>{
  const code=countryCode(feature),name=countryName(feature),top=riskOf(filteredItems(countryEvents.get(code)||[]));
  layer.bindPopup('<strong>'+esc(name)+'</strong><br>'+(top?"إشارة المخاطر: "+esc(labels[top.ai_risk_level]||"غير محدد")+" · "+(top.ai_risk_score||0)+"/100":"لا توجد أحداث مصنّفة كافية"));
  layer.on({mouseover:e=>e.target.setStyle({weight:2,color:"#18283e",fillOpacity:.9}),mouseout:e=>geoLayer.resetStyle(e.target),click:()=>showCountry(code,name)});
 }}).addTo(map);
}
function addEventMarkers(){
 if(markerLayer)map.removeLayer(markerLayer);markerLayer=L.layerGroup().addTo(map);
 filteredItems(articles).filter(a=>Number.isFinite(a.ai_latitude)&&Number.isFinite(a.ai_longitude)).forEach(a=>{
  const marker=L.circleMarker([a.ai_latitude,a.ai_longitude],{radius:6,color:"#fff",weight:1,fillColor:riskColor(a),fillOpacity:.95});
  marker.bindPopup('<strong>'+esc(a.ai_location_name||a.ai_region||a.country)+'</strong><br>'+esc(a.title)+'<br><small>'+esc(labels[a.ai_risk_level]||"غير محدد")+' · '+esc(fmtDate(a.published_at))+'</small>');
  marker.on("click",()=>showCountry(a.ai_country_code,a.country));marker.addTo(markerLayer);
 });
}
function renderEvents(items,title){
 $("panelTitle").textContent=title;$("eventCount").textContent=items.length+" حدث";
 const host=$("eventList");if(!items.length){host.innerHTML='<div class="empty">لا توجد أحداث مطابقة في البيانات المصنّفة خلال الفترة المحددة.</div>';return;}
 host.innerHTML=items.slice(0,40).map(a=>'<article class="event"><div class="event-top"><span class="risk '+riskClass(a.ai_risk_level)+'">'+esc(labels[a.ai_risk_level]||"غير محدد")+' · '+(a.ai_risk_score||0)+'/100</span><small>'+esc(a.country||"")+'</small></div><h3>'+esc(a.title)+'</h3><p>'+esc(a.ai_summary||a.summary||"")+'</p><p>'+esc(a.ai_event_type||"حدث عام")+' · '+esc(fmtDate(a.published_at))+'</p>'+(a.url?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer">المصدر الأصلي ↗</a>':"")+'</article>').join("");
}
function showCountry(code,name){
 activeCountry=code;activeCountryName=name;
 const items=filteredItems(countryEvents.get(String(code).toUpperCase())||[]),top=riskOf(items);
 $("countrySummary").innerHTML='<strong>'+esc(name)+'</strong><p>'+(items.length?items.length+" أحداث مصنّفة خلال الفترة المحددة":"لا توجد أحداث مصنّفة كافية")+'</p><span class="risk '+riskClass(top?.ai_risk_level)+'">'+(top?esc(labels[top.ai_risk_level]||"غير محدد")+" · "+(top.ai_risk_score||0)+"/100":"لا توجد إشارة")+'</span>';
 renderEvents(items,"أحداث "+name);
}
function refreshFilters(){
 if(geoCache)drawCountries(geoCache);addEventMarkers();
 if(activeCountry)showCountry(activeCountry,activeCountryName);
 else renderEvents(filteredItems(articles),"أبرز الأحداث");
}
$("riskFilter").addEventListener("change",refreshFilters);
$("timeFilter").addEventListener("change",refreshFilters);
$("eventTypeFilter").addEventListener("change",refreshFilters);
initMap();loadData();setInterval(loadData,300000);
