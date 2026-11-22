const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

test("editor segments a pasted million characters and saves the exact joined text", () => {
  const root = path.join(__dirname, "..");
  const dom = new JSDOM(fs.readFileSync(path.join(root,"admin.html"),"utf8"),
    { url:"https://editor.test/admin.html",runScripts:"outside-only" });
  try {
    const win = dom.window, get = id => win.document.getElementById(id);
    win.eval(fs.readFileSync(path.join(root,"editor-workspace.js"),"utf8"));
    const api = win.WLEditorWorkspace, body = get("summary");
    api.account("fixture", () => true);
    get("title").value = "مقال تجريبي";
    const marker = "نهاية النص محفوظة";
    const value = "مقالٌ كبير للكتابة مع اختبار التقسيم 🚀.\n".repeat(30000).slice(0,1000000-marker.length) + marker;
    const paste = (text) => {
      const event = new win.Event("paste",{ bubbles:true,cancelable:true });
      Object.defineProperty(event,"clipboardData",{ value:{ getData:() => text } });
      body.dispatchEvent(event);
      return event.defaultPrevented;
    };
    assert.equal(paste(value), true);
    assert.equal(api.getBody(),value);
    assert.ok(body.value.length < 25000 && body.value.endsWith(marker));
    assert.equal(paste("extra"),true);
    assert.equal(api.getBody(),value);
    get("previousPart").click();
    assert.ok(!body.value.endsWith(marker));
    get("nextPart").click();
    assert.ok(body.value.endsWith(marker));
    api.persist();
    assert.equal(JSON.parse(win.localStorage.getItem("wrldline:working-draft:fixture")).body,value);
    api.markClean();
  } finally { dom.window.close(); }
});
