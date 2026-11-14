import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium')
  c=await b.new_context(viewport={'width':390,'height':844},service_workers='block')
  pg=await c.new_page();await pg.goto('http://127.0.0.1:4173/',wait_until='domcontentloaded');await pg.wait_for_timeout(4000)
  before=await pg.locator('.news-card .image-placeholder').count()
  ok=await pg.evaluate("""()=>{const img=document.querySelector('.news-card img');if(!img)return false;img.dispatchEvent(new Event('error'));return true;}""")
  await pg.wait_for_timeout(200)
  after=await pg.locator('.news-card .image-placeholder').count()
  print(json.dumps({'has_image':ok,'placeholders_before':before,'placeholders_after':after,'delta':after-before},ensure_ascii=False))
  await b.close()
asyncio.run(main())
