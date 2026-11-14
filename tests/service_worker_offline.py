import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium')
  c=await b.new_context(viewport={'width':1280,'height':800})
  await c.route('**/rest/v1/articles**',lambda r: r.abort())
  pg=await c.new_page();await pg.goto('http://127.0.0.1:4173/',wait_until='domcontentloaded');await pg.wait_for_timeout(6000)
  await pg.reload(wait_until='domcontentloaded');await pg.wait_for_timeout(14000)
  print(json.dumps({'hero':await pg.locator('#heroLayout').inner_text(),'retry':await pg.locator('#heroLayout button').count(),'controller':await pg.evaluate('!!navigator.serviceWorker.controller')},ensure_ascii=False,indent=2))
  await b.close()
asyncio.run(main())
