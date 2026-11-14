import asyncio,json
from playwright.async_api import async_playwright
async def run(mode):
 events=[]
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium')
  c=await b.new_context(viewport={'width':1280,'height':800},service_workers='block')
  await c.add_init_script("window.WRLDLINE_ANALYTICS_CONFIG={ga4MeasurementId:'',endpoint:'http://127.0.0.1:4173/__analytics'};")
  async def route(r):
   try:
    if r.request.post_data: events.append(json.loads(r.request.post_data))
   except: pass
   await r.fulfill(status=204,body='')
  await c.route('**/__analytics',route)
  pg=await c.new_page();await pg.goto('http://127.0.0.1:4173/',wait_until='domcontentloaded');await pg.wait_for_timeout(3500)
  banner=pg.locator('.wrldline-consent')
  before=len(events)
  if await banner.count():
   await pg.locator(f'.wrldline-consent [data-consent="{mode}"]').click();await pg.wait_for_timeout(500)
  after=len(events)
  await b.close()
  return {'mode':mode,'before_click':before,'after_click':after,'events':[e.get('event') for e in events]}
async def main():
 print(json.dumps([await run('granted'),await run('denied')],ensure_ascii=False,indent=2))
asyncio.run(main())
