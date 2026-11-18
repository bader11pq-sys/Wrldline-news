import asyncio,json
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:4173'
async def main():
 out={}
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium')
  for w in [375,320,390]:
   c=await b.new_context(viewport={'width':w,'height':844},is_mobile=True,has_touch=True)
   pg=await c.new_page();await pg.goto(BASE+'/',wait_until='domcontentloaded');await pg.wait_for_timeout(4500)
   out[f'mobile_{w}']=await pg.evaluate("()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,body:document.body.scrollWidth,cards:document.querySelectorAll('.news-card').length,untranslated:document.querySelectorAll('.content-untranslated').length})")
   await c.close()
  # failure state
  c=await b.new_context(viewport={'width':1280,'height':800})
  await c.route('**/rest/v1/rpc/public_home_news_recent**',lambda r: r.abort())
  pg=await c.new_page();await pg.goto(BASE+'/',wait_until='domcontentloaded');await pg.wait_for_timeout(13500)
  out['failure']={'hero':await pg.locator('#heroLayout').inner_text(),'retry':await pg.locator('#heroLayout button').count()}
  await c.close()
  # cached homepage recovery: a prior public snapshot remains visible when the RPC is unavailable
  c=await b.new_context(viewport={'width':1280,'height':800})
  pg=await c.new_page()
  fixture={
   'savedAt':int(__import__('time').time()*1000),
   'rows':[{
    'id':'00000000-0000-4000-8000-000000000099',
    'title':'WRLDLINE cached homepage recovery test: a previously published story remains readable during a short service interruption',
    'summary':'A public published news story cached for a brief period so the homepage can remain readable during an API interruption.',
    'url':'https://example.test/wrldline-cache-recovery',
    'source_url':'https://example.test/wrldline-cache-recovery',
    'source_name':'اختبار الاستقرار',
    'published_at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
    'lang':'ar','source_language':'ar','category':'politics','country':'السعودية',
    'editorial_status':'published','article_translations':[],
    'newsdata_only':False,'is_breaking':False,'is_exclusive':False,
    'verification':'unconfirmed'
   }],
   'popularRows':[]
  }
  await pg.add_init_script("sessionStorage.setItem('wrldline:home-feed-cache:v1', "+json.dumps(json.dumps(fixture,ensure_ascii=False)) + ");")
  await pg.goto(BASE+'/',wait_until='domcontentloaded');await pg.wait_for_timeout(4000)
  out['cached_home']={
   'hero':await pg.locator('#heroLayout').inner_text(),
   'connection':await pg.locator('#connectionLabel').inner_text(),
   'retry_buttons':await pg.locator('#heroLayout button').count()
  }
  await c.close()
  # briefing dedupe
  c=await b.new_context(viewport={'width':1280,'height':900})
  pg=await c.new_page();await pg.goto(BASE+'/daily-briefing.html',wait_until='domcontentloaded');await pg.wait_for_timeout(6000)
  out['briefing']=await pg.evaluate("()=>({status:document.querySelector('#briefingStatus')?.innerText,top:document.querySelectorAll('#topDevelopments .briefing-story').length,sections:[...document.querySelectorAll('.briefing-category')].map(s=>s.querySelectorAll('.briefing-story').length),all:[...document.querySelectorAll('.briefing-story h3')].map(h=>h.innerText.trim())})")
  # generic titles public
  await pg.goto(BASE+'/',wait_until='domcontentloaded');await pg.wait_for_timeout(4000)
  out['generic_public']=await pg.evaluate("()=>[...document.querySelectorAll('.news-card h3,.rail-story h3,.lead-story h2')].map(h=>h.innerText.trim()).filter(t=>/^(- reuters|business|politics|tech now|tech life|al jazeera - al jazeera|kuna news agency - kuwait - kuna|quickreads:)/i.test(t)).slice(0,20)")
  # admin fields exist and no analytics
  await pg.goto(BASE+'/admin.html',wait_until='domcontentloaded');await pg.wait_for_timeout(1000)
  out['admin']={'articleKind':await pg.locator('#articleKind').count(),'sponsorName':await pg.locator('#sponsorName').count(),'correctionNote':await pg.locator('#correctionNote').count(),'analytics':await pg.evaluate("()=>typeof window.WRLDLINE_ANALYTICS")}
  await c.close();await b.close()
 print(json.dumps(out,ensure_ascii=False,indent=2))
asyncio.run(main())
