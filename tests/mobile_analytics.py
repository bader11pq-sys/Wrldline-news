import asyncio,json
from playwright.async_api import async_playwright
async def main():
 events=[]
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium')
  c=await b.new_context(**p.devices['iPhone 13'],service_workers='block')
  await c.add_init_script("try{localStorage.setItem('wrldline:analytics-consent','granted')}catch(e){};window.WRLDLINE_ANALYTICS_CONFIG={ga4MeasurementId:'',endpoint:'http://127.0.0.1:4173/__analytics'};")
  async def route(r):
   try:
    if r.request.post_data: events.append(json.loads(r.request.post_data))
   except: pass
   await r.fulfill(status=204,body='')
  await c.route('**/__analytics',route)
  pg=await c.new_page();await pg.goto('http://127.0.0.1:4173/',wait_until='domcontentloaded');await pg.wait_for_timeout(4000)
  await pg.locator('[data-open]').first.click();await pg.wait_for_timeout(300)
  print(json.dumps({'ua':await pg.evaluate('navigator.userAgent'),'events':[(e.get('event'),e.get('device_type')) for e in events]},ensure_ascii=False,indent=2))
  await b.close()
asyncio.run(main())
