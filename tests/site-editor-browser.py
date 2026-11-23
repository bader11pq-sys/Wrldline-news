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
        assert await panel.evaluate("(el) => el.scrollWidth <= el.clientWidth")
        await panel.get_by_role("button", name="حفظ مسودة", exact=True).click()
        await expect(panel.get_by_text("حُفظت المسودة الخاصة.")).to_be_visible()
        await panel.get_by_role("button", name="مسودات ومراجعة").click()
        await panel.get_by_role("button", name="منشور اختبار معزول").click()
        await panel.get_by_role("button", name="نشر الآن").click()
        await expect(panel.get_by_text("تم النشر على الموقع.")).to_be_visible()
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
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
