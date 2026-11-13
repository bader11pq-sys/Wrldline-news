(()=> {
 const $=(s)=>document.querySelector(s);
 const lang=localStorage.getItem("wrldline:language")==="en"?"en":"ar";
 const now=new Date();
 $("#marketYear").textContent=now.getFullYear();
 $("#marketDate").textContent=new Intl.DateTimeFormat(lang==="ar"?"ar-SA":"en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"}).format(now);
 if(lang==="en"){document.documentElement.lang="en";document.documentElement.dir="ltr";$("#marketLanguage").textContent="العربية";document.querySelector(".markets-hero h1").innerHTML='Global Markets<span>.</span>';document.querySelector(".welcome-subtitle").textContent="Energy, metals, currencies, equities and funds in one dashboard.";}
 $("#marketLanguage").addEventListener("click",()=>{localStorage.setItem("wrldline:language",lang==="ar"?"en":"ar");location.reload();});
 const theme=localStorage.getItem("wrldline:theme")||"light";document.documentElement.dataset.theme=theme;$("#marketThemeButton").textContent=theme==="dark"?"☀":"☾";
 $("#marketThemeButton").addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;localStorage.setItem("wrldline:theme",next);$("#marketThemeButton").textContent=next==="dark"?"☀":"☾";});
 const nav=$("#marketNav");$("#marketMenuButton").addEventListener("click",()=>{const open=nav.classList.toggle("mobile-open");$("#marketMenuButton").setAttribute("aria-expanded",String(open));});
 function widget(host,src,config){const script=document.createElement("script");script.src=src;script.async=true;script.type="text/javascript";script.text=JSON.stringify(config);host.appendChild(script);}
 const containers=document.querySelectorAll(".tradingview-widget-container");
 widget(containers[0],"https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js",{symbols:[{proName:"TVC:UKOIL",title:"Brent"},{proName:"TVC:USOIL",title:"WTI"},{proName:"TVC:GOLD",title:"Gold"},{proName:"TVC:SILVER",title:"Silver"},{proName:"FX:EURUSD",title:"EUR/USD"},{proName:"FX:USDJPY",title:"USD/JPY"},{proName:"BINANCE:BTCUSDT",title:"Bitcoin"},{proName:"BINANCE:ETHUSDT",title:"Ethereum"},{proName:"TADAWUL:2222",title:"Saudi Aramco"},{proName:"TADAWUL:1120",title:"Al Rajhi"}],showSymbolLogo:true,colorTheme:theme,isTransparent:false,displayMode:"adaptive",locale:lang==="ar"?"ar":"en"});
 widget(containers[1],"https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js",{colorTheme:theme,dateRange:"1D",showChart:true,locale:lang==="ar"?"ar":"en",width:"100%",height:490,largeChartUrl:"",isTransparent:false,showSymbolLogo:true,showFloatingTooltip:false,plotLineColorGrowing:"#26a69a",plotLineColorFalling:"#ef5350",tabs:[{title:"الطاقة والمعادن",symbols:[{s:"NYMEX:CL1!",d:"WTI Crude Oil"},{s:"ICEEUR:BRN1!",d:"Brent Crude Oil"},{s:"NYMEX:NG1!",d:"Natural Gas"},{s:"COMEX:GC1!",d:"Gold"},{s:"COMEX:SI1!",d:"Silver"},{s:"COMEX:HG1!",d:"Copper"}]},{title:"العملات",symbols:[{s:"FX:EURUSD",d:"EUR/USD"},{s:"FX:GBPUSD",d:"GBP/USD"},{s:"FX:USDJPY",d:"USD/JPY"},{s:"TVC:DXY",d:"US Dollar Index"},{s:"FX:USDSAR",d:"USD/SAR"}]},{title:"العملات الرقمية",symbols:[{s:"BINANCE:BTCUSDT",d:"Bitcoin"},{s:"BINANCE:ETHUSDT",d:"Ethereum"},{s:"BINANCE:BNBUSDT",d:"BNB"},{s:"BINANCE:SOLUSDT",d:"Solana"},{s:"BINANCE:XRPUSDT",d:"XRP"}]},{title:"الأسهم والصناديق",symbols:[{s:"NASDAQ:AAPL",d:"Apple"},{s:"NASDAQ:NVDA",d:"NVIDIA"},{s:"NASDAQ:MSFT",d:"Microsoft"},{s:"AMEX:SPY",d:"S&P 500 ETF"},{s:"NASDAQ:QQQ",d:"Nasdaq 100 ETF"},{s:"TADAWUL:2222",d:"Saudi Aramco"},{s:"TADAWUL:1120",d:"Al Rajhi Bank"},{s:"TADAWUL:7010",d:"stc"}]}]});
 widget(containers[2],"https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js",{exchanges:[],dataSource:"SPX500",grouping:"sector",blockSize:"market_cap_basic",blockColor:"change",locale:lang==="ar"?"ar":"en",symbolUrl:"",colorTheme:theme,hasTopBar:true,isDataSetEnabled:true,isZoomEnabled:true,isTransparent:false,width:"100%",height:"540"});

 const feedStatus=$("#marketFeedStatus"),feedGrid=$("#directMarketGrid");
 const apiBase="https://vmaxbnogmmfyrcucapnq.supabase.co/functions/v1/market-data";
 const money=(v,currency)=>new Intl.NumberFormat(lang==="ar"?"ar-SA":"en-US",{maximumFractionDigits:v<1?5:2,minimumFractionDigits:v<1?4:2}).format(v)+" "+currency;
 const loadDirectQuotes=async()=>{
  if(!feedGrid)return;
  try{
   const response=await fetch(apiBase+"?mode=quotes",{cache:"no-store",signal:AbortSignal.timeout(18000)});
   const payload=await response.json();
   if(!response.ok||!Array.isArray(payload.quotes))throw new Error(payload.error||"Market feed unavailable");
   const good=payload.quotes.filter(q=>q.ok);
   feedGrid.innerHTML=good.map(q=>{
    const positive=Number(q.change)>=0,change=(positive?"+":"")+Number(q.change).toFixed(2),pct=(positive?"+":"")+Number(q.changePercent).toFixed(2)+"%";
    const name=lang==="ar"?q.labelAr:q.label;
    const updated=q.timestamp?new Date(q.timestamp).toLocaleTimeString(lang==="ar"?"ar-SA":"en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"";
    return '<article class="direct-market-card"><div class="direct-market-top"><span>'+name+'</span><small>'+q.category.toUpperCase()+'</small></div><strong class="direct-market-price">'+money(Number(q.price),q.currency||"USD")+'</strong><div class="direct-market-change '+(positive?"up":"down")+'">'+change+' ('+pct+')</div><div class="direct-market-foot"><span>'+q.provider+'</span><time>'+updated+'</time></div><button class="direct-market-share" type="button" data-share-market="'+q.symbol+'">↗ '+(lang==="ar"?"مشاركة السعر":"Share price")+'</button></article>';
   }).join("")||'<div class="market-loading">'+(lang==="ar"?"لم تصل أسعار صالحة من المزودين حتى الآن.":"No valid quotes received from providers yet.")+'</div>';
   feedStatus.textContent=(lang==="ar"?"آخر استجابة: ":"Last response: ")+new Date(payload.checkedAt||Date.now()).toLocaleTimeString(lang==="ar"?"ar-SA":"en-US");
   feedGrid.querySelectorAll("[data-share-market]").forEach(button=>button.addEventListener("click",()=>{
    const q=good.find(item=>item.symbol===button.dataset.shareMarket);if(!q||!window.WRLDLINE_SHARE)return;
    window.WRLDLINE_SHARE.share({title:(lang==="ar"?q.labelAr:q.label)+" — "+money(Number(q.price),q.currency||"USD"),description:(lang==="ar"?"التغير: ":"Change: ")+Number(q.change).toFixed(2)+" ("+Number(q.changePercent).toFixed(2)+"%)",category:lang==="ar"?"أسعار الأسواق":"Market quote",source:q.provider});
   }));
  }catch(error){feedStatus.textContent=lang==="ar"?"تعذر الاتصال":"Connection failed";feedGrid.innerHTML='<div class="market-loading">'+(lang==="ar"?"تعذر جلب الأسعار: ":"Could not load provider quotes: ")+String(error.message||error)+'</div>';console.error("WRLDLINE market feed:",error);}
 };
 loadDirectQuotes();setInterval(loadDirectQuotes,60000);
 const fxGrid=$("#directFxGrid"),fxStatus=$("#directFxStatus");
 const loadFxRate=async()=>{
  if(!fxGrid)return;
  try{
   const response=await fetch(apiBase+"?mode=fx",{cache:"no-store",signal:AbortSignal.timeout(18000)});
   const payload=await response.json();
   if(!response.ok||!payload.quote?.ok)throw new Error(payload.error||"FX feed unavailable");
   const q=payload.quote,asOf=[q.asOf,q.timeZone].filter(Boolean).join(" · ")||"";
   fxGrid.innerHTML='<article class="direct-market-card"><div class="direct-market-top"><span>الدولار الأمريكي / الريال السعودي</span><small>FX</small></div><strong class="direct-market-price">'+money(Number(q.price),"SAR")+'</strong><div class="direct-market-change">'+(lang==="ar"?"سعر الصرف المرجعي":"Reference exchange rate")+'</div><div class="direct-market-foot"><span>'+q.provider+'</span><time>'+asOf+'</time></div><button class="direct-market-share" type="button" id="directFxShare">↗ '+(lang==="ar"?"مشاركة السعر":"Share rate")+'</button></article>';
   fxStatus.textContent=(lang==="ar"?"آخر تحديث لدى المزود: ":"Provider update: ")+asOf;
   $("#directFxShare")?.addEventListener("click",()=>{
    if(!window.WRLDLINE_SHARE)return;
    window.WRLDLINE_SHARE.share({title:"الدولار الأمريكي مقابل الريال السعودي",description:"1 USD = "+Number(q.price).toFixed(5)+" SAR",category:"أسعار صرف العملات",source:"Alpha Vantage"});
   });
  }catch(error){fxStatus.textContent=lang==="ar"?"تعذر تحديث الصرف":"FX update failed";fxGrid.innerHTML='<div class="market-loading">'+(lang==="ar"?"تعذر جلب سعر الصرف: ":"Could not load FX rate: ")+String(error.message||error)+'</div>';console.error("WRLDLINE FX:",error);}
 };
 loadFxRate();setInterval(loadFxRate,3600000);

})();