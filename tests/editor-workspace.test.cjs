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
    const picker = get("composePartSelect");
    picker.value = String(picker.options.length - 1);
    picker.dispatchEvent(new win.Event("change", { bubbles: true }));
    assert.ok(body.value.endsWith(marker));
    api.persist();
    assert.equal(JSON.parse(win.localStorage.getItem("wrldline:working-draft:fixture")).body,value);
    api.markClean();
  } finally { dom.window.close(); }
});

test("UTF-8 file import preserves all sections and rejects invalid replacements", async () => {
  const root = path.join(__dirname, "..");
  const dom = new JSDOM(fs.readFileSync(path.join(root, "admin.html"), "utf8"),
    { url: "https://editor.test/admin.html", runScripts: "outside-only" });
  try {
    const win = dom.window, get = id => win.document.getElementById(id);
    win.TextDecoder = TextDecoder;
    win.eval(fs.readFileSync(path.join(root, "editor-workspace.js"), "utf8"));
    const api = win.WLEditorWorkspace;
    api.account("fixture", () => true);
    const body = "## المقدمة\n" + "نص عربي وEnglish 🚀\n".repeat(4000) + "خاتمة المقال";
    const upload = async (name, bytes) => {
      Object.defineProperty(get("composeFile"), "files", {
        configurable: true,
        value: [{ name, size: bytes.byteLength, arrayBuffer: async () => bytes }]
      });
      get("composeFile").dispatchEvent(new win.Event("change", { bubbles: true }));
      await new Promise(setImmediate);
    };
    await upload("article.txt", new TextEncoder().encode(body));
    assert.equal(api.getBody(), body);
    assert.ok(get("composePartSelect").options.length > 2);
    assert.match(get("composeFileStatus").textContent, /استُورد/);
    await upload("invalid.txt", Uint8Array.of(255));
    assert.equal(api.getBody(), body);
    assert.match(get("composeFileStatus").textContent, /UTF-8/);
    win.confirm = () => false;
    await upload("replacement.txt", new TextEncoder().encode("replacement"));
    assert.equal(api.getBody(), body);
    api.markClean();
  } finally { dom.window.close(); }
});
