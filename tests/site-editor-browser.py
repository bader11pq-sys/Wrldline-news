"""Isolated admin, editor and reader browser flows; no request reaches Supabase."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright, expect

FIXTURE = Path(__file__).with_name("site-editor-browser-fixture.js")


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        context = await browser.new_context(viewport={"width": 375, "height": 812}, service_workers="block")
        await context.add_init_script(path=FIXTURE)
        async def allow_local(route):
            if route.request.url.startswith("http://127.0.0.1:4173/"):
                await route.continue_()
            else:
                await route.abort()
        await context.route("**/*", allow_local)
        page = await context.new_page()
        failures = []
        page.on("pageerror", lambda error: failures.append(str(error)))
        await page.goto("http://127.0.0.1:4173/?lang=ar", wait_until="domcontentloaded")
        await page.locator('[data-choice="denied"]').click()
        await page.get_by_role("button", name="اكتب", exact=True).click()
        panel = page.locator(".wl-site-editor")
        headline = panel.get_by_role("textbox", name="العنوان", exact=True)
        await expect(headline).to_be_focused()
        await headline.fill("منشور اختبار معزول")
        await panel.get_by_role("textbox", name="النص الكامل").fill("نص تجريبي في متصفح معزول فقط.")
        breaking = panel.get_by_role("checkbox", name="خبر عاجل", exact=True)
        await expect(breaking).to_be_visible()
        await breaking.check()
        await expect(panel.get_by_role("button", name="نشر خبر عاجل")).to_be_visible()
        assert await panel.evaluate("(el) => el.scrollWidth <= el.clientWidth")
        await panel.get_by_role("button", name="حفظ مسودة", exact=True).click()
        await expect(panel.get_by_text("حُفظت المسودة الخاصة.")).to_be_visible()
        await expect(page.locator("#breakingStrip")).to_be_hidden()
        await panel.get_by_role("button", name="مسودات ومراجعة").click()
        await panel.get_by_role("button", name="منشور اختبار معزول").click()
        await expect(breaking).to_be_checked()
        await panel.get_by_role("button", name="نشر خبر عاجل").click()
        await expect(panel.get_by_text("تم النشر على الموقع.")).to_be_visible()
        await expect(page.locator("#breakingText")).to_have_text("منشور اختبار معزول")
        await headline.fill("التعديلات تبقى عند الخطأ")
        await page.evaluate("WLSiteEditorFixture.failNext()")
        await panel.get_by_role("button", name="حفظ التعديلات").click()
        await expect(panel.get_by_text("تعذّر إكمال العملية", exact=False)).to_be_visible()
        await expect(headline).to_have_value("التعديلات تبقى عند الخطأ")
        await page.keyboard.press("Escape")
        await panel.get_by_role("button", name="إلغاء", exact=True).click()
        await expect(headline).to_have_value("التعديلات تبقى عند الخطأ")
        await panel.get_by_role("button", name="إغلاق المحرر").click()
        await panel.get_by_role("button", name="متابعة", exact=True).click()
        await page.locator("#newsGrid [data-site-editor=edit]").first.click()
        await expect(panel.get_by_role("heading", name="تحرير المحتوى")).to_be_visible()
        await page.evaluate("WLSiteEditorFixture.setRole('reader')")
        await expect(page.locator("[data-site-editor]")).to_have_count(0)
        await expect(panel).to_have_count(0)
        await page.evaluate("WLSiteEditorFixture.setRole('editor')")
        await expect(page.locator("[data-site-editor]")).to_have_count(0)
        assert failures == [], failures
        await context.close()
        await check_breaking_lifecycle(browser, allow_local)
        await browser.close()


async def check_breaking_lifecycle(browser, allow_local):
    from datetime import datetime, timezone
    context = await browser.new_context(viewport={"width": 390, "height": 820}, service_workers="block")
    await context.add_init_script(path=FIXTURE)
    await context.route("**/*", allow_local)
    page = await context.new_page()
    failures = []
    page.on("pageerror", lambda error: failures.append(str(error)))
    now = datetime(2026, 11, 23, 11, tzinfo=timezone.utc)
    await page.clock.install(time=now)
    await page.goto("http://127.0.0.1:4173/?lang=ar&previewRole=visitor")
    await page.locator('[data-choice="denied"]').click()
    await expect(page.locator("#breakingStrip")).to_be_hidden()
    await expect(page.locator("[data-site-editor]")).to_have_count(0)
    await page.evaluate("""() => {
      const now = Date.now(), base = {summary:"ملخص معزول",source_name:"هيئة التحرير",
        lang:"ar",category:"politics",is_breaking:true,editorial_status:"published",audience_lane:"arabic"};
      const row = (n,title,age,patch) => ({...base,id:"30000000-0000-4000-8000-"+String(n).padStart(12,"0"),
        title,published_at:new Date(now-age).toISOString(),...patch});
      window.breakingRowsForTest = {row, old:row(1,"أول خبر من هيئة التحرير",60_000),
        section:row(3,"خبر سابق يبقى في القسم",600_000)};
      WLSiteEditorFixture.setBreakingRows([breakingRowsForTest.section,breakingRowsForTest.old,
        row(4,"خبر في المستقبل",-60_000),row(5,"مسودة لا تظهر",1000,{editorial_status:"draft"}),
        row(6,"خبر انتهت مدته",910_000),row(7,"خبر خارج السياسة",1000,{audience_lane:"excluded"})]);
    }""")
    ticker = page.locator("#breakingText")
    cards = page.locator("#breakingNewsGrid h3")
    await expect(ticker).to_have_text("أول خبر من هيئة التحرير")
    await expect(cards).to_have_text(["أول خبر من هيئة التحرير", "خبر سابق يبقى في القسم"])
    await check_ticker_entry(ticker, "rtl")
    await page.evaluate("""() => WLSiteEditorFixture.setBreakingRows([{
      ...breakingRowsForTest.old,title:"UN: تبدأ الجولة الجديدة اليوم الساعة 12:30 بتوقيت الرياض"
    }])""")
    await expect(ticker).to_contain_text("الساعة 12:30")
    await check_ticker_entry(ticker, "rtl")
    await page.evaluate("""() => WLSiteEditorFixture.setBreakingRows([{
      ...breakingRowsForTest.old,title:"Riyadh announces a new round of talks this afternoon",lang:"en",audience_lane:"world"
    }])""")
    await expect(ticker).to_contain_text("Riyadh announces")
    await check_ticker_entry(ticker, "ltr")
    await page.evaluate("WLSiteEditorFixture.setBreakingRows([breakingRowsForTest.old])")
    await expect(ticker).to_have_text("أول خبر من هيئة التحرير")
    await page.locator("#breakingMotion").click()
    await expect(ticker.locator("bdi")).to_have_css("animation-name", "none")
    await page.locator("#breakingMotion").click()
    await page.emulate_media(reduced_motion="reduce")
    await expect(page.locator("#breakingMotion")).to_be_hidden()
    await expect(ticker.locator("bdi")).to_have_css("animation-name", "none")
    await page.locator("#searchButton").click()
    await page.evaluate("""() => {
      const {row}=breakingRowsForTest;
      WLSiteEditorFixture.setBreakingRows([row(2,"خبر أحدث من هيئة التحرير",0)]);
    }""")
    await expect(ticker).to_have_text("خبر أحدث من هيئة التحرير")
    await expect(cards).to_have_text(["خبر أحدث من هيئة التحرير", "أول خبر من هيئة التحرير", "خبر سابق يبقى في القسم"])
    await expect(page.locator("#searchOverlay")).to_be_visible()
    await page.keyboard.press("Escape")
    # The unrelated future fixture stays out of the authoritative response.
    await page.evaluate("""() => WLSiteEditorFixture.setBreakingRows([{
      ...breakingRowsForTest.row(4,"خبر في المستقبل",0),editorial_status:"draft"
    }])""")
    await page.clock.run_for(1200)
    await page.clock.fast_forward(5*60*1000)
    await expect(page.locator("#breakingStrip")).to_be_hidden()
    await expect(cards.first).to_have_text("خبر أحدث من هيئة التحرير")
    await page.clock.fast_forward(10*60*1000)
    await expect(cards).to_have_count(0)
    assert not failures, failures
    await context.close()


async def check_ticker_entry(ticker, direction):
    # Check physical word visibility, not just textContent or the CSS class.
    result = await ticker.locator("bdi").evaluate("""async (headline) => {
      const animation = headline.getAnimations()[0];
      if (!animation) throw new Error("The headline is not moving");
      animation.pause();
      await animation.ready;
      const duration = animation.effect.getTiming().duration;
      const track = headline.parentElement.getBoundingClientRect();
      const words = [...headline.textContent.matchAll(/\\S+/gu)];
      function visible(word) {
        const range = document.createRange();
        range.setStart(headline.firstChild,word.index);
        range.setEnd(headline.firstChild,word.index+word[0].length);
        const rect = range.getBoundingClientRect();
        return Math.min(rect.right,track.right)-Math.max(rect.left,track.left)>1;
      }
      const travel = headline.getBoundingClientRect().width+track.width;
      const entryTime = 20*duration/travel;
      async function position(time) {
        animation.currentTime = time;
        // The compositor applies transform changes on the next paint.
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        return {left:headline.getBoundingClientRect().left,time:animation.currentTime,progress:animation.effect.getComputedTiming().progress,
          transform:getComputedStyle(headline).transform, name:getComputedStyle(headline).animationName};
      }
      const before = await position(entryTime);
      const result = {direction:getComputedStyle(headline).direction,first:visible(words[0]),last:visible(words.at(-1))};
      const after = await position(entryTime+15*duration/travel);
      result.delta = Math.round((after.left-before.left)*10)/10;
      result.animation = animation.animationName;
      result.frames = [before,after,track.width,travel,headline.clientWidth,duration];
      animation.play();
      return result;
    }""")
    assert result["direction"] == direction and result["first"] and not result["last"], result
    assert 14 < (result["delta"] if direction == "rtl" else -result["delta"]) < 16, result


if __name__ == "__main__":
    asyncio.run(main())
