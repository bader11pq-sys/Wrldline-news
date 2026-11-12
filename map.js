<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
<title>خريطة الأحداث | وكالة الغيب</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<style>
    :root { --bg: #09090b; --surface: #18181b; --text: #f4f4f5; --brand: #ef4444; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body, html { height: 100%; font-family: 'IBM Plex Sans Arabic', sans-serif; background: var(--bg); color: var(--text); overflow: hidden; }
    
    .header { height: 60px; background: var(--surface); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid #27272a; position: relative; z-index: 1000; }
    .header h1 { font-size: 1.2rem; color: var(--brand); }
    .btn-back { color: var(--text); text-decoration: none; font-weight: 600; font-size: 0.9rem; background: #27272a; padding: 8px 16px; border-radius: 8px; transition: 0.2s; }
    .btn-back:hover { background: var(--brand); }

    #map { height: calc(100vh - 60px); width: 100%; background: #000; }

    /* تخصيص شكل النوافذ المنبثقة */
    .leaflet-popup-content-wrapper { background: var(--surface); color: var(--text); border-radius: 12px; padding: 0; overflow: hidden; border: 1px solid #3f3f46; }
    .leaflet-popup-content { margin: 0; width: 280px !important; }
    .leaflet-popup-tip { background: var(--surface); }
    .popup-img { width: 100%; height: 120px; object-fit: cover; }
    .popup-body { padding: 16px; }
    .popup-title { font-size: 1rem; font-weight: 700; margin-bottom: 8px; color: var(--brand); }
    .popup-desc { font-size: 0.85rem; color: #a1a1aa; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
</style>
</head>
<body>

<div class="header">
    <h1>خريطة الأحداث العالمية</h1>
    <a href="index.html" class="btn-back">&larr; العودة للرئيسية</a>
</div>

<div id="map"></div>

<script>
    const SUPABASE_URL = "https://vmaxbnogmmfyrcucapnq.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_D3c88u75_LcEN460Y3Jcpw__EfqUnBx";

    // ربط أسماء الدول العربية بالرموز العالمية (ISO Codes) التي تفهمها الخريطة
    const countryMap = {
        'السعودية': 'SAU', 'فلسطين': 'PSE', 'أوكرانيا': 'UKR', 'الولايات المتحدة': 'USA',
        'روسيا': 'RUS', 'إيران': 'IRN', 'تركيا': 'TUR', 'مصر': 'EGY',
        'اليمن': 'YEM', 'الإمارات': 'ARE', 'الصين': 'CHN', 'فرنسا': 'FRA',
        'ألمانيا': 'DEU', 'بريطانيا': 'GBR', 'سوريا': 'SYR', 'العراق': 'IRQ',
        'لبنان': 'LBN', 'الأردن': 'JOR', 'الكويت': 'KWT', 'قطر': 'QAT'
    };

    // 1. تهيئة الخريطة
    const map = L.map('map', { zoomControl: false }).setView([25, 20], 2);
    L.control.zoom({ position: 'topright' }).addTo(map);

    // خلفية الخريطة الداكنة (Esri)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri', maxZoom: 16
    }).addTo(map);

    let countryLayers = {}; // لحفظ طبقات الدول لكي نلونها لاحقاً

    // 2. تحميل خرائط العالم (GeoJSON)
    fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
        .then(res => res.json())
        .then(data => {
            L.geoJSON(data, {
                style: function(feature) {
                    return {
                        fillColor: 'transparent',
                        weight: 1,
                        opacity: 1,
                        color: '#3f3f46', // لون حدود الدول
                        fillOpacity: 0.1
                    };
                },
                onEachFeature: function(feature, layer) {
                    // حفظ الطبقة باسم الدولة
                    countryLayers[feature.id] = layer;
                    
                    layer.on('mouseover', function() {
                        this.setStyle({ weight: 2, color: '#fff' });
                    });
                    layer.on('mouseout', function() {
                        this.setStyle({ weight: 1, color: '#3f3f46' });
                    });
                }
            }).addTo(map);
            
            // بعد رسم الخريطة، نبدأ بجلب الأخبار الحقيقية
            loadMapNews();
        });

    // 3. جلب الأخبار وتلوين الدول
    async function loadMapNews() {
        try {
            // جلب الأخبار التي لها "دولة" محددة فقط
            const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=*&country=not.is.null&order=published_at.desc&limit=50`, {
                headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
            });
            const data = await res.json();

            data.forEach(article => {
                const isoCode = countryMap[article.country];
                const layer = countryLayers[isoCode];

                if (layer) {
                    // تحديد اللون بناءً على القسم
                    let fillColor = '#3b82f6'; // أزرق (سياسة وعالم)
                    if (article.category === 'security') fillColor = '#ef4444'; // أحمر (أمن وحروب)
                    if (article.category === 'economy') fillColor = '#f59e0b'; // برتقالي (اقتصاد)

                    // تلوين الدولة بالكامل
                    layer.setStyle({
                        fillColor: fillColor,
                        fillOpacity: 0.6, // شفافية اللون
                        color: fillColor,
                        weight: 2
                    });

                    // إضافة النافذة المنبثقة
                    const popupContent = `
                        <img src="${article.image_url || 'https://picsum.photos/300/200'}" class="popup-img">
                        <div class="popup-body">
                            <div class="popup-title">${article.country}: ${article.title}</div>
                            <div class="popup-desc">${article.summary}</div>
                        </div>
                    `;
                    layer.bindPopup(popupContent);
                }
            });

        } catch (error) {
            console.error("خطأ:", error);
        }
    }
</script>
</body>
</html>