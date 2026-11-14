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
  await c.route('**/rest/v1/articles**',lambda r: r.abort())
  pg=await c.new_page();await pg.goto(BASE+'/',wait_until='domcontentloaded');await pg.wait_for_timeout(13500)
  out['failure']={'hero':await pg.locator('#heroLayout').inner_text(),'retry':await pg.locator('#heroLayout button').count()}
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
