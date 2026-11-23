import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import desk from "../event-desk.js";
import { validate } from "../scripts/build-dossiers.mjs";
import { catalogScript, renderEdition, validateEdition, validateEventDesk } from "../scripts/front-page.mjs";

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const json = name => JSON.parse(read(name));
const rawCatalog = json("content/event-desk.json");
const rawEdition = json("content/front-page.json");
const dossiers = Object.keys(rawCatalog).map(slug => validate(json(`content/dossiers/${slug}.json`), `${slug}.json`));
const catalog = validateEventDesk(rawCatalog, dossiers);
const prepared = desk.prepare(catalog);
const match = (title, fields = {}, entries = prepared) => desk.match({title, published_at:"2026-11-22T10:00:00Z", ...fields}, entries)?.slug;

test("the same reviewed catalog drives the static bilingual front page and four permanent files", () => {
  const edition = validateEdition(rawEdition, catalog);
  assert.equal(edition.picks.length, 5);
  assert.equal(new Set(edition.picks.map(p => p.url)).size, 5);
  assert.equal(edition.picks[0].type, "dossier");
  assert.ok(edition.picks.some(p => p.type === "analysis"));
  assert.ok(edition.picks.some(p => p.type === "reported"));
  assert.ok(read("index.html").includes(renderEdition(edition, catalog)));
  for (const d of dossiers) {
    const url = `/dossier/${d.slug}.html`;
    const html = read(url.slice(1));
    assert.ok(html.includes(catalogScript(catalog)));
    assert.ok(html.includes(`rel="canonical" href="https://al-ghaib.us.ci${url}"`));
    const brief = html.split('id="reader-brief"')[1].split("</section>")[0];
    for (const s of ["ما الجديد منذ آخر تحديث؟", "ما الذي تأكد؟", "متى نعرف التطور التالي؟"]) assert.ok(brief.includes(s));
    assert.equal((brief.match(/class="src-refs"/g) || []).length, 3);
    if (!d.readerBrief.nextOn) assert.match(brief, /لا يوجد موعد معلن/);
    else assert.match(brief, /data-dossier-schedule datetime="2026-11-29"/);
  }
});

test("title matching is bilingual, scoped to the event, and safe on ambiguous or incidental mentions", () => {
  assert.equal(match("OPEC+ keeps December oil output targets steady"), "opec-plus-december-2026");
  assert.equal(match("أُوبك+ تُبقي حصص الإنتاج في ديسمبر"), "opec-plus-december-2026");
  assert.equal(match("Iran discusses reopening of the Strait of Hormuz"), "hormuz-closure-2026");
  assert.equal(match("باب المندب: القوات الحكومية تغادر الساحل"), "bab-al-mandab-2026");
  assert.equal(match("QatarEnergy and Cheniere agree US LNG supplies"), "qatarenergy-lng-2026");
  assert.equal(match("OPEC keeps December output targets steady despite Strait of Hormuz closure"), undefined);
  assert.equal(match("Regional oil output rises amid shipping worries", {summary:"Strait of Hormuz closure"}), undefined);
  assert.equal(match("News near the Strait of Hormuz"), undefined);
  assert.equal(match("باب المندب: خبر من الساحل"), undefined);
  assert.equal(match("OPEC+ keeps December output steady", {published_at:"2027-11-05"}), undefined);
  assert.equal(match("OPEC+ keeps December output steady", {editorial_status:"retracted"}), undefined);
  assert.equal(match("OPEC+ keeps December output steady", {content_type:"sponsored"}), undefined);
  assert.equal(match("OPEC+ keeps December output steady", {originalTitle:"Oil market ends the week higher"}), undefined);
});

test("a reviewed article ID wins; duplicate IDs fail validation", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const custom = structuredClone(rawCatalog);
  custom["bab-al-mandab-2026"].articleIds.push(id);
  const validated = validateEventDesk(custom, dossiers);
  assert.equal(match("Two straits face disruption", {id}, desk.prepare(validated)), "bab-al-mandab-2026");
  custom["hormuz-closure-2026"].articleIds.push(id);
  assert.throws(() => validateEventDesk(custom, dossiers), /duplicate reviewed article ID/);
  assert.deepEqual(desk.prepare([{...catalog[0], slug:"../another-path"}]), []);
});

test("the introduction point follows chronology; every individual item and honest provenance remain", () => {
  const content = { published_at:"2026-11-22", content_type:"news" };
  const stories = ["French elections", "Strait of Hormuz closure draws reaction", "Shipping losses mount",
    "Talks seek reopening of the Strait of Hormuz"].map((title,id) => ({...content,title,id:String(id)}));
  const result = desk.group(stories, prepared);
  assert.equal(result.length, 3);
  assert.equal(result[0].item, stories[0]);
  assert.deepEqual(result[1].items, [stories[1],stories[3]]);
  assert.equal(result[2].item, stories[2]);
  const house = {source_name:"WRLDLINE NEWS",url:"editorial-123",content_type:"news"};
  assert.equal(desk.kind(house), "original");
  assert.equal(desk.kind({...house,url:"editorial-00000000-0000-4000-8000-000000000001"}), "original");
  assert.equal(desk.kind({...house,url:"https://example.test/editorial-123"}), "reported");
  assert.equal(desk.kind({...house,source_name:"WRLDLINE News Partner"}), "reported");
  assert.equal(desk.kind({...house, source_url:"https://wire.example/a"}), "reported");
  assert.equal(desk.kind({...house,content_type:"analysis"}), "analysis");
  assert.equal(desk.kind({...house,content_type:"opinion"}), "opinion");
});
