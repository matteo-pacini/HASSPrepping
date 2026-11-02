// Tests for what the cards render: the summary, the rows, the language they
// pick, a missing list, and config the card refuses.
//
// Run with `node --test test/*.test.js` from the repository root.

const test = require("node:test");
const assert = require("node:assert/strict");
const { cards: c, plain, item, hass, make, text } = require("./prepping-cards.harness.js");
const { checkConfig, editorForm, KINDS } = c;

const FOOD = "food-stockpile-card";
const WATER = "water-stockpile-card";

const pantry = () => ({
  "todo.food_stockpile": [
    item("Food stockpile settings", { target_days: 30 }),
    item("Crackers", { portion_g: 300, kcal_per_100g: 439, count: 4 }),
    item("Tuna", { portion_g: 100, kcal_per_100g: 116, count: 18 }),
  ],
});

// 80 L for two adults at 8 L a day: 10 days against a target of 7.
const cellar = () => ({
  "todo.water_stockpile": [
    item("Still water, 2 L", { litres: 2, count: 24 }),
    item("Jerry can, 5 L", { litres: 5, count: 4 }),
    item("Still water, 1.5 L", { litres: 1.5, count: 8 }),
  ],
});

const summary = (el) => text(el.part(".summary").innerHTML);
const list = (el) => text(el.part(".list").innerHTML);

test("the food summary shows days, totals and the household in English", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile" }, hass(pantry()));
  assert.equal(summary(el), "Food 1.6 of 30 days 7,356 kcal / 135,000 kcal 1 man · 1 woman · 4,500 kcal a day − 30 +");
  assert.match(el.part(".summary").innerHTML, /class="days low"/);
});

test("food rows show calories each, totals, days and their batches", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile" }, hass(pantry()));
  assert.equal(
    list(el),
    "Crackers 5,268 kcal · 1.1 d 1,317 kcal each 4 B1 4 · no date + B2 Tuna 2,088 kcal · 0.4 d 116 kcal each 18 B1 18 · no date + B2"
  );
});

test("rows keep the list's order", () => {
  const lists = pantry();
  lists["todo.food_stockpile"].push(item("Apricots", { portion_g: 200, kcal_per_100g: 50, batches: [] }));
  const el = make(FOOD, { entity: "todo.food_stockpile" }, hass(lists));
  assert.match(list(el), /^Crackers .* Tuna .* Apricots /);
});

// A tin of beans in three batches: one long expired, one undated, one far off.
const beans = () => ({
  "todo.food_stockpile": [
    item("Beans", {
      portion_g: 400,
      kcal_per_100g: 100,
      batches: [
        { n: 1, exp: "2999-12", count: 3 },
        { n: 2, exp: null, count: 1 },
        { n: 3, exp: "2001-05-04", count: 2 },
      ],
    }),
  ],
});

test("batches show soonest first, with the expired one marked", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile" }, hass(beans()));
  assert.equal(list(el), "Beans 2,400 kcal · 0.5 d 400 kcal each 6 B3 2 · 4 May 2001 B1 3 · Dec 2999 B2 1 · no date + B4");
  assert.match(el.part(".list").innerHTML, /class="batch expired" data-n="3"/);
  assert.match(el.part(".list").innerHTML, /<time datetime="2999-12">/);
});

test("an open batch shows its date and quantity to edit, and Remove", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile" }, hass(beans()));
  el._batchEdit = { uid: "Beans", n: 1, exp: "2999-12", month: "2999-12", count: 3 };
  el._update();
  const html = el.part(".list").innerHTML;
  assert.match(html, /class="batch open" data-n="1"/);
  assert.match(html, /<input name="month" type="month" value="2999-12">/);
  assert.match(html, /<input name="count" type="number" min="0"[^>]*value="3"/);
  assert.match(text(html), /Best before Quantity Save Cancel Remove$/);
});

test("a new batch asks for at least one, and has no Remove", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile" }, hass(beans()));
  el._batchEdit = { uid: "Beans", n: null, month: "", count: 1 };
  el._update();
  const html = el.part(".list").innerHTML;
  assert.match(html, /<input name="count" type="number" min="1"/);
  assert.match(text(html), /Best before Quantity Add Cancel$/);
});

test("batch labels are translated", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile", locale: "de-DE" }, hass(beans()));
  assert.match(list(el), / C3 2 · 4\. Mai 2001 C1 3 · Dez\. 2999 C2 1 · ohne Datum \+ C4$/);
});

test("water past its target is marked met", () => {
  const el = make(WATER, { entity: "todo.water_stockpile" }, hass(cellar()));
  assert.equal(summary(el), "Water 10 of 7 days 80 L / 56 L 1 man · 1 woman · 8 L a day − 7 +");
  assert.match(el.part(".summary").innerHTML, /class="days met"/);
});

test("a stored target replaces the default", () => {
  const lists = cellar();
  lists["todo.water_stockpile"].push(item("Water stockpile settings", { target_days: 14 }));
  const el = make(WATER, { entity: "todo.water_stockpile" }, hass(lists));
  assert.match(summary(el), /of 14 days/);
  assert.match(el.part(".summary").innerHTML, /class="days low"/);
});

test("the household changes the daily need and the days", () => {
  const el = make(WATER, { entity: "todo.water_stockpile", men: 2, women: 3 }, hass(cellar()));
  assert.match(summary(el), /^Water 4 of 7 days 80 L \/ 140 L 2 men · 3 women · 20 L a day/);
});

test("a household of one leaves the other sex out", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile", men: 0, women: 1 }, hass(pantry()));
  assert.match(summary(el), / 1 woman · 2,000 kcal a day /);
});

test("nobody to feed is an error, not a division by zero", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile", men: 0, women: 0 }, hass(pantry()));
  assert.equal(summary(el), "Set at least one man or woman.");
  assert.equal(el.part(".list").innerHTML, "");
});

test("the card speaks Home Assistant's language", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile" }, hass(pantry(), { language: "it" }));
  assert.equal(summary(el), "Cibo 1,6 su 30 giorni 7.356 kcal / 135.000 kcal 1 uomo · 1 donna · 4.500 kcal al giorno − 30 +");
  assert.match(list(el), /^Crackers 5\.268 kcal · 1,1 gg 1\.317 kcal cad\. 4 L1 4 · senza data \+ L2/);
});

test("the card's locale wins over Home Assistant's", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile", locale: "de-DE" }, hass(pantry(), { language: "it" }));
  assert.match(summary(el), /^Lebensmittel 1,6 von 30 Tagen/);
  assert.equal(el.part("ha-card").attributes.lang, "de-DE");
});

test("Polish picks the plural for each count", () => {
  const el = make(WATER, { entity: "todo.water_stockpile", locale: "pl", men: 2, women: 5 }, hass(cellar()));
  assert.match(summary(el), / 2 mężczyźni · 5 kobiet · 28 L dziennie /);
  assert.match(summary(el), / z 7 dni /);
});

test("Simplified Chinese renders for zh-CN", () => {
  const el = make(WATER, { entity: "todo.water_stockpile" }, hass(cellar(), { language: "zh-CN" }));
  assert.match(summary(el), /^水 10 \/ 7 天 80 L \/ 56 L 1 名男性 · 1 名女性 · 每天 8 L/);
});

test("strings overrides apply on top of the language", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile", locale: "it", strings: { food: "Dispensa" } }, hass(pantry()));
  assert.match(summary(el), /^Dispensa 1,6 su 30 giorni/);
});

test("a title replaces the translated one", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile", title: "Pantry" }, hass(pantry(), { language: "de" }));
  assert.match(summary(el), /^Pantry /);
});

test("a changed Home Assistant language re-renders the card", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile" }, hass(pantry()));
  el.hass = hass(pantry(), { language: "fr" });
  assert.match(summary(el), /^Nourriture 1,6 sur 30 jours/);
});

test("names are escaped", () => {
  const lists = { "todo.food_stockpile": [item("<b>Beans</b>", { portion_g: 100, kcal_per_100g: 100, count: 1 })] };
  const el = make(FOOD, { entity: "todo.food_stockpile" }, hass(lists));
  assert.match(el.part(".list").innerHTML, /&lt;b&gt;Beans&lt;\/b&gt;/);
});

test("an empty list says how to start", () => {
  const el = make(WATER, { entity: "todo.water_stockpile" }, hass({ "todo.water_stockpile": [] }));
  assert.equal(list(el), "No water yet. Add a bottle size below.");
  assert.match(summary(el), /^Water 0 of 7 days 0 L \/ 56 L/);
});

test("a missing list offers an admin the button to create it", () => {
  const el = make(FOOD, { entity: "todo.food_stockpile" }, hass({}));
  assert.equal(summary(el), "Food todo.food_stockpile doesn't exist yet. Create the “Food stockpile” list");
  assert.match(el.part(".summary").innerHTML, /class="primary create"/);
  assert.equal(el.part(".foot").hidden, true);
});

test("a missing list tells anyone else which list to ask for", () => {
  const el = make(WATER, { entity: "todo.water_stockpile" }, hass({}, { admin: false }));
  assert.equal(summary(el), "Water todo.water_stockpile doesn't exist yet. Ask an admin to add a Local To-do list called “Water stockpile”.");
  assert.doesNotMatch(el.part(".summary").innerHTML, /create/);
});

test("the missing-list text is translated", () => {
  const el = make(WATER, { entity: "todo.water_stockpile" }, hass({}, { language: "nl" }));
  assert.equal(summary(el), "Water todo.water_stockpile bestaat nog niet. Lijst ‘Water stockpile’ aanmaken");
});

test("config the card can't use is refused", () => {
  const food = KINDS.food;
  assert.throws(() => checkConfig(food, {}), /todo\.food_stockpile/);
  assert.throws(() => checkConfig(food, { entity: "todo.x", men: -1 }), /`men` must be a whole number/);
  assert.throws(() => checkConfig(food, { entity: "todo.x", women: 1.5 }), /`women` must be a whole number/);
  assert.throws(() => checkConfig(food, { entity: "todo.x", locale: "not a locale" }), /`locale` must be a BCP 47 tag/);
  assert.throws(() => checkConfig(food, { entity: "todo.x", strings: ["food"] }), /`strings` must be a mapping/);
  assert.throws(() => checkConfig(food, { entity: "todo.x", strings: { pantry: "x" } }), /`strings` has no key 'pantry'/);
  checkConfig(food, { entity: "todo.x", men: 0, women: 2, locale: "pt-BR", strings: { food: "Comida" } });
});

test("the editor shows the list, title, men and women side by side, and locale", () => {
  const form = editorForm(KINDS.food);
  const names = (schema) => schema.flatMap((s) => (s.schema ? names(s.schema) : [s.name]));
  assert.deepEqual(plain(names(form.schema)), ["entity", "title", "men", "women", "locale"]);
  const grid = form.schema.find((s) => s.type === "grid");
  assert.deepEqual(plain(grid.schema.map((s) => s.name)), ["men", "women"]);
  for (const s of grid.schema) assert.deepEqual(plain(s.selector.number), { min: 0, max: 20, step: 1, mode: "box" });
  assert.equal(form.computeLabel({ name: "men" }), "Adult men (2,500 kcal a day each)");
  assert.equal(form.computeLabel({ name: "women" }), "Adult women (2,000 kcal a day each)");
});
