import asyncio, json, time
from playwright.async_api import async_playwright

BASE='http://127.0.0.1:4173'

async def main():
    events=[]
    results={}
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium')
        ctx=await browser.new_context(viewport={"width":1440,"height":900})
        await ctx.add_init_script("""
          try{localStorage.setItem('wrldline:analytics-consent','granted')}catch(e){}
          window.WRLDLINE_ANALYTICS_CONFIG={ga4MeasurementId:'',endpoint:'http://127.0.0.1:4173/__analytics'};
        """)
        async def analytics_route(route):
            try:
                body=route.request.post_data
                if body: events.append(json.loads(body))
            except Exception as e: events.append({'parse_error':str(e)})
            await route.fulfill(status=204,body='')
        await ctx.route('**/__analytics',analytics_route)
        page=await ctx.new_page()
        await page.goto(BASE+'/',wait_until='domcontentloaded')
        await page.wait_for_timeout(5000)
        results['home_status']=await page.title()
        results['home_overflow']=await page.evaluate("()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth:innerWidth,bodyScrollWidth:document.body.scrollWidth})")
        results['cards']=await page.locator('.news-card').count()
        results['card_sources']=await page.locator('.news-card .story-source a[data-source-link]').count()
        results['card_dates']=await page.locator('.news-card .story-source time').count()
        results['page_view_events']=len([e for e in events if e.get('event')=='page_view'])
        # open first article
        if await page.locator('[data-open]').count():
            await page.locator('[data-open]').first.click()
            await page.wait_for_timeout(400)
            results['modal_source_box']=await page.locator('.source-box').count()
            results['modal_date']=await page.locator('.modal-publication-date').inner_text() if await page.locator('.modal-publication-date').count() else ''
            results['view_article_events']=len([e for e in events if e.get('event')=='view_article'])
            # click first source link (opens new tab)
            link=page.locator('.source-box a[data-source-link]').first
            if await link.count():
                href=await link.get_attribute('href')
                results['source_href']=href
                async with page.context.expect_page(timeout=5000) as popup_info:
                    await link.click()
                popup=await popup_info.value
                await popup.close()
                await page.wait_for_timeout(300)
                results['outbound_events']=len([e for e in events if e.get('event')=='outbound_source_click'])
            await page.keyboard.press('Escape')
        # search
        await page.locator('#searchButton').click()
        await page.locator('#searchInput').fill('ترامب')
        await page.wait_for_timeout(500)
        results['search_events']=len([e for e in events if e.get('event')=='search'])
        await page.keyboard.press('Escape')
        # markets
        await page.goto(BASE+'/markets.html',wait_until='domcontentloaded')
        await page.wait_for_timeout(13000)
        results['market_status']=await page.locator('#marketFeedStatus').inner_text()
        results['market_loading']=await page.locator('#directMarketGrid .market-loading').count()
        results['market_view_events']=len([e for e in events if e.get('event')=='market_view'])
        # newsletter + contact + plus
        await ctx.route('**/rest/v1/newsletter_subscribers',lambda r: r.fulfill(status=201,body=''))
        await ctx.route('**/rest/v1/contact_messages',lambda r: r.fulfill(status=201,body=''))
        await page.goto(BASE+'/newsletter.html',wait_until='domcontentloaded')
        await page.locator('#nlEmail').fill('qa+audit@example.com')
        await page.locator('#newsletterForm input[type=checkbox]').check()
        await page.locator('#newsletterForm button[type=submit]').click()
        await page.wait_for_timeout(500)
        results['newsletter_status']=await page.locator('#newsletterStatus').inner_text()
        results['newsletter_events']=len([e for e in events if e.get('event')=='newsletter_signup'])
        await page.goto(BASE+'/contact.html',wait_until='domcontentloaded')
        await page.locator('#contactName').fill('QA Audit')
        await page.locator('#contactEmail').fill('qa+audit@example.com')
        await page.locator('#contactTopic').select_option('sponsorship')
        await page.locator('#contactMessage').fill('اختبار مسار التواصل والرعاية من تدقيق آلي.')
        await page.locator('#contactForm input[type=checkbox]').check()
        await page.locator('#contactForm button[type=submit]').click()
        await page.wait_for_timeout(500)
        results['contact_status']=await page.locator('#contactStatus').inner_text()
        results['sponsor_events']=len([e for e in events if e.get('event')=='sponsor_contact'])
        await page.goto(BASE+'/account.html',wait_until='domcontentloaded')
        await page.locator('#monthlyButton').click()
        await page.wait_for_timeout(300)
        results['plus_events']=len([e for e in events if e.get('event')=='plus_interest'])
        # legal pages
        legal={}
        for slug in ['about','contact','privacy','terms','corrections','newsletter']:
            resp=await page.goto(BASE+'/'+slug+'.html',wait_until='domcontentloaded')
            legal[slug]={'status':resp.status if resp else None,'h1':await page.locator('h1').inner_text() if await page.locator('h1').count() else '','cards':await page.locator('.policy-card').count()}
        results['legal']=legal
        # mobile overflow
        m=await browser.new_context(viewport={"width":390,"height":844},is_mobile=True,has_touch=True)
        mp=await m.new_page()
        await mp.goto(BASE+'/',wait_until='domcontentloaded')
        await mp.wait_for_timeout(5000)
        results['mobile_overflow']=await mp.evaluate("()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth:innerWidth,bodyScrollWidth:document.body.scrollWidth,feed:document.querySelector('.feed-column')?.getBoundingClientRect().width,container:document.querySelector('.content-layout')?.getBoundingClientRect().width})")
        results['mobile_cards']=await mp.locator('.news-card').count()
        await m.close()
        await ctx.close();await browser.close()
    print(json.dumps({'results':results,'events':events},ensure_ascii=False,indent=2))

asyncio.run(main())
