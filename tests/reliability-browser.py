"""Run existing consent/mobile/failure diagnostics with every external request mocked.
Use a local server at 4173. No live account reads, user writes, or service workers.
"""
import asyncio
import contextlib
import io
import json
import os
from pathlib import Path
from playwright.async_api import Browser, BrowserType, async_playwright

ROOT = Path(__file__).resolve().parents[1]
REAL_LAUNCH = BrowserType.launch
REAL_CONTEXT = Browser.new_context
REPORTS = []
CURRENT_TEST = ''
SDK = """
window.supabase={createClient:()=>{
 const chain=new Proxy(function(){},{get:(_,key)=>key==='then'?((resolve)=>resolve({data:[],error:null})):()=>chain,apply:()=>chain});
 const session=window.WRLDLINE_TEST_SESSION||null;
 return {from:()=>chain,rpc:async()=>({data:[],error:null}),
 auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session?.user||null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 channel:()=>({on(){return this},subscribe(){return this},unsubscribe(){}}),removeChannel:()=>{}};
}};
"""

async def safe_launch(self, *args, **kwargs):
    # Original scripts hard-code /usr/bin/chromium. CI uses Playwright's installed
    # browser, local checks can explicitly set WRLDLINE_CHROMIUM_PATH.
    executable = os.environ.get('WRLDLINE_CHROMIUM_PATH')
    kwargs.pop('executable_path', None)
    if executable: kwargs['executable_path'] = executable
    kwargs['headless'] = True
    return await REAL_LAUNCH(self, *args, **kwargs)

async def safe_context(self, *args, **kwargs):
    kwargs['service_workers'] = 'block'
    context = await REAL_CONTEXT(self, *args, **kwargs)
    outage = CURRENT_TEST == 'layout_failure_briefing.py' and kwargs.get('viewport') == {'width':1280,'height':800}
    setup = "window.WRLDLINE_TEST_SESSION={access_token:'fixture-only',user:{id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.test',user_metadata:{}}};" if outage else ''
    async def isolate(route):
        from urllib.parse import urlparse
        url = urlparse(route.request.url)
        if 'supabase-js' in route.request.url or url.path.startswith('/vendor/supabase-'):
            await route.fulfill(status=200,content_type='application/javascript',body=SDK)
        elif url.hostname in ('localhost','127.0.0.1') and url.port == 4173:
            await route.continue_()
        elif url.hostname and url.hostname.endswith('.supabase.co'):
            if '/auth/' in url.path:
                await route.fulfill(status=401,content_type='application/json',body='{"error":"Mock unauthenticated"}')
            else:
                await route.fulfill(status=503 if outage else 200,content_type='application/json',body='{"error":"Mock outage"}' if outage else '[]')
        else:
            await route.abort()
    await context.route('**/*', isolate)
    await context.add_init_script(setup + SDK)
    return context

def verify(name, data):
    if name == 'consent.py':
        assert len(data) == 2
        for result in data:
            assert result['before_click'] == 0, 'Analytics emitted before consent'
            if result['mode'] == 'denied': assert result['after_click'] == 0, 'Analytics emitted after denial'
            if result['mode'] == 'granted': assert result['after_click'] > 0, 'Consent acceptance did not enable analytics'
    elif name == 'mobile_analytics.py':
        width = data['overflow']; assert width['scrollWidth'] <= width['innerWidth'] + 1, 'Mobile horizontal overflow'
        # /news/* is public; protected legacy newsroom pages can still have a gate.
        if data.get('auth_gate'): assert data['visible_cards_without_session'] == 0, 'Protected newsroom leaked cards'
    elif name == 'layout_failure_briefing.py':
        for key, result in data.items():
            if key.startswith('mobile_'): assert result['sw'] <= result['iw'] + 1, f'{key}: horizontal overflow'
        assert data['failure']['retry'] > 0, 'Mock outage did not render retry control'
        assert data['failure']['picks'] == 5, 'Mock outage hid the editor’s five picks'
        titles = data.get('briefing',{}).get('all',[]); assert len(titles) == len(set(titles)), 'Briefing duplicates'
        assert data.get('generic_public',[]) == [], 'Publisher-only placeholder headlines'

async def protected_account():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        context = await browser.new_context(viewport={'width':1280,'height':800})
        page = await context.new_page()
        await page.goto('http://127.0.0.1:4173/account.html',wait_until='domcontentloaded')
        await page.wait_for_timeout(500)
        assert await page.locator('#authPanel').is_visible(), 'Anonymous account auth panel missing'
        assert not await page.locator('#profilePanel').is_visible(), 'Anonymous account profile leaked'
        assert not (await page.locator('#userEmail').inner_text()).strip(), 'Anonymous user email leaked'
        await page.goto('http://127.0.0.1:4173/admin.html',wait_until='domcontentloaded')
        await page.wait_for_timeout(800)
        assert await page.locator('#loginPanel').is_visible(), 'Anonymous editor login missing'
        assert not await page.locator('#editorPanel').is_visible(), 'Anonymous editor content leaked'
        assert not (await page.locator('#userLabel').inner_text()).strip(), 'Anonymous editor identity leaked'
        await browser.close()
    return {'test':'anonymous-account-admin','passed':True}

def main():
    global CURRENT_TEST
    BrowserType.launch = safe_launch
    Browser.new_context = safe_context
    try:
        for name in ('consent.py','mobile_analytics.py','layout_failure_briefing.py'):
            CURRENT_TEST = name
            stream = io.StringIO()
            source = (ROOT / 'tests' / name).read_text()
            if name == 'consent.py':
                # Adapt this legacy diagnostic in memory; do not edit its owner's file.
                source = source.replace('[data-consent="{mode}"]', ':is([data-consent="{mode}"], [data-choice="{mode}"])')
                source = source.replace('await page.wait_for_timeout(500)', 'await page.evaluate("window.WRLDLINE_ANALYTICS?.flush?.()"); await page.wait_for_timeout(500)')
            with contextlib.redirect_stdout(stream): exec(compile(source,str(ROOT / 'tests' / name),'exec'),{'__name__':'__main__'})
            data = json.loads(stream.getvalue()); verify(name,data)
            REPORTS.append({'test':name,'passed':True,'diagnostics':data})
        CURRENT_TEST = 'protected-account'
        REPORTS.append(asyncio.run(protected_account()))
        print(json.dumps({'isolated_external_network':True,'reports':REPORTS},ensure_ascii=False,indent=2))
    finally:
        BrowserType.launch = REAL_LAUNCH
        Browser.new_context = REAL_CONTEXT

if __name__ == '__main__': main()
