// Tests for prepping-cards.js: reading stock from to-do items, writing it back,
// the household's daily needs, and how the cards register.
//
// Run with `node --test test/*.test.js` from the repository root.

const test = require("node:test");
const assert = require("node:assert/strict");
const { ctx, cards: c, plain, item } = require("./prepping-cards.harness.js");
const { KINDS, readItems, readBatches, itemJSON, household, listName, fmtDays, fmtKcal, fmtLitres, esc } = c;
const { expiryDate, daysLeft, expiryState, fmtExpiry, byExpiry, nextBatch, addBatch, setBatch } = c;

// One list holding both cards' items, as the README says it may.
const mixed = () => [
  item("Food stockpile settings", { target_days: 21 }),
  item("Water stockpile settings", { target_days: 10 }),
  item("Rice pudding", { portion_g: 400, kcal_per_100g: 90, count: 6 }),
  item("Baked beans", { portion_g: 415, kcal_per_100g: 80, count: 3 }),
  item("Still water, 2 L", { litres: 2, count: 12 }),
  item("Milk", "buy on Friday"),
  item("Bread", ""),
];

test("food reads its items, in the list's order, and its own settings", () => {
  const { rows, settings } = readItems(KINDS.food, mixed());
  assert.deepEqual(plain(rows.map((r) => r.name)), ["Rice pudding", "Baked beans"]);
  assert.deepEqual(plain(rows[1]), {
    uid: "Baked beans",
    name: "Baked beans",
    batches: [{ n: 1, exp: null, count: 3 }],
    portion_g: 415,
    kcal_per_100g: 80,
  });
  assert.equal(settings.target_days, 21);
});

test("water reads bottles and its own settings, not food's", () => {
  const { rows, settings } = readItems(KINDS.water, mixed());
  assert.deepEqual(plain(rows.map((r) => [r.name, r.litres, r.batches])), [["Still water, 2 L", 2, [{ n: 1, exp: null, count: 12 }]]]);
  assert.equal(settings.target_days, 10);
});

test("items without JSON, or missing a figure, are left out", () => {
  const items = [item("Notes", "not json"), item("Half", { portion_g: 100, count: 2 }), item("Null", "null")];
  assert.equal(readItems(KINDS.food, items).rows.length, 0);
});

test("counts are whole and never negative; a target is at least 1", () => {
  const items = [
    item("A", { litres: 1.5, count: 2.7 }),
    item("B", { litres: "x", count: -4 }),
    item("Water stockpile settings", { target_days: 0 }),
  ];
  const { rows, settings } = readItems(KINDS.water, items);
  assert.deepEqual(plain(rows.map((r) => [r.litres, r.batches])), [[1.5, [{ n: 1, exp: null, count: 2 }]], [0, []]]);
  assert.equal(settings.target_days, 1);
});

test("a settings item needs the card's exact name", () => {
  assert.equal(readItems(KINDS.food, [item("Stockpile settings", { target_days: 9 })]).settings, null);
});

test("itemJSON keeps the card's fields, the total count and the batches, in a stable order", () => {
  const batches = [{ n: 1, exp: "2027-03", count: 2 }, { n: 2, exp: null, count: 1 }];
  const row = { uid: "u", name: "Beans", portion_g: 415, kcal_per_100g: 80, batches, extra: true };
  assert.equal(
    itemJSON(KINDS.food, row),
    '{"portion_g":415,"kcal_per_100g":80,"count":3,"batches":[{"n":1,"exp":"2027-03","count":2},{"n":2,"exp":null,"count":1}]}'
  );
  assert.equal(itemJSON(KINDS.water, { litres: 5, batches: [] }), '{"litres":5,"count":0,"batches":[]}');
});

test("itemJSON round-trips through readItems", () => {
  const before = { name: "Oats", portion_g: 1000, kcal_per_100g: 375, batches: [{ n: 2, exp: "2027-01-15", count: 2 }] };
  const [after] = readItems(KINDS.food, [item("Oats", itemJSON(KINDS.food, before))]).rows;
  assert.deepEqual(plain({ ...after, uid: undefined }), plain({ ...before, uid: undefined }));
});

test("batches keep their number, a valid expiry and a whole count", () => {
  const v = {
    count: 99,
    batches: [
      { n: 3, exp: "2027-03", count: 2.9 },
      { n: 1, exp: "2027-02-30x", count: 1 },
      { n: 2, exp: "2027-13", count: 4 },
      { n: 4, exp: "2028-01", count: 0 },
      "junk",
    ],
  };
  assert.deepEqual(plain(readBatches(v)), [
    { n: 3, exp: "2027-03", count: 2 },
    { n: 1, exp: null, count: 1 },
    { n: 2, exp: null, count: 4 },
  ]);
});

test("an item with only a count, as v1.0.0 wrote it, is one undated batch", () => {
  assert.deepEqual(plain(readBatches({ count: 5 })), [{ n: 1, exp: null, count: 5 }]);
  assert.deepEqual(plain(readBatches({ count: 0 })), []);
  assert.deepEqual(plain(readBatches({})), []);
});

test("a month expiry lasts to the end of that month", () => {
  assert.equal(expiryDate("2027-02").getDate(), 28);
  assert.equal(expiryDate("2028-02").getDate(), 29);
  assert.equal(expiryDate("2027-03-15").getDate(), 15);
});

test("days left count from today, 0 on the last day", () => {
  const now = new Date(2026, 10, 2, 18, 30);
  assert.equal(daysLeft("2026-11-02", now), 0);
  assert.equal(daysLeft("2026-11", now), 28);
  assert.equal(daysLeft("2026-10", now), -2);
});

test("a batch is expired after its date, and soon within 30 days", () => {
  const now = new Date(2026, 10, 2);
  assert.equal(expiryState("2026-11-01", now), "expired");
  assert.equal(expiryState("2026-11-02", now), "soon");
  assert.equal(expiryState("2026-12-02", now), "soon");
  assert.equal(expiryState("2026-12-03", now), "");
  assert.equal(expiryState(null, now), "");
});

test("expiries show as the month, or the day when one is given", () => {
  assert.equal(fmtExpiry("2027-03", "en-GB"), "Mar 2027");
  assert.equal(fmtExpiry("2027-03-15", "en-GB"), "15 Mar 2027");
});

test("batches sort by expiry, undated last", () => {
  const sorted = [{ exp: null }, { exp: "2027-05" }, { exp: "2027-01-20" }, { exp: "2027-01" }].sort(byExpiry);
  assert.deepEqual(plain(sorted.map((b) => b.exp)), ["2027-01-20", "2027-01", "2027-05", null]);
});

test("a new batch is numbered after the highest, so numbers aren't reused while in use", () => {
  assert.equal(nextBatch([]), 1);
  assert.equal(nextBatch([{ n: 1 }, { n: 4 }]), 5);
});

test("adding a batch joins one with the same expiry, or starts a new one", () => {
  const batches = [{ n: 1, exp: "2027-03", count: 2 }];
  assert.deepEqual(plain(addBatch(batches, "2027-03", 3)), [{ n: 1, exp: "2027-03", count: 5 }]);
  assert.deepEqual(plain(addBatch(batches, "2027-09", 1)), [
    { n: 1, exp: "2027-03", count: 2 },
    { n: 2, exp: "2027-09", count: 1 },
  ]);
  assert.deepEqual(plain(addBatch([], null, 4)), [{ n: 1, exp: null, count: 4 }]);
  assert.deepEqual(batches, [{ n: 1, exp: "2027-03", count: 2 }], "the input is left alone");
});

test("setting a batch changes it, and a count of 0 removes it", () => {
  const batches = [{ n: 1, exp: "2027-03", count: 2 }, { n: 2, exp: null, count: 1 }];
  assert.deepEqual(plain(setBatch(batches, 2, "2028-01", 6)), [
    { n: 1, exp: "2027-03", count: 2 },
    { n: 2, exp: "2028-01", count: 6 },
  ]);
  assert.deepEqual(plain(setBatch(batches, 1, "2027-03", 0)), [{ n: 2, exp: null, count: 1 }]);
});

test("each item is worth its portion's calories or its litres", () => {
  assert.equal(KINDS.food.each({ portion_g: 300, kcal_per_100g: 439 }), 1317);
  assert.equal(KINDS.water.each({ litres: 2 }), 2);
});

test("household defaults to one man and one woman", () => {
  assert.deepEqual(plain(household(KINDS.food, {})), { men: 1, women: 1, people: "1 man · 1 woman", perDay: 4500 });
  assert.equal(household(KINDS.water, {}).perDay, 8);
});

test("household counts men and women at their own rates", () => {
  assert.deepEqual(plain(household(KINDS.food, { men: 2, women: 0 })), { men: 2, women: 0, people: "2 men", perDay: 5000 });
  assert.equal(household(KINDS.food, { men: 0, women: 3 }).perDay, 6000);
  assert.equal(household(KINDS.food, { men: 0, women: 3 }).people, "3 women");
  assert.equal(household(KINDS.water, { men: 2, women: 1 }).perDay, 12);
});

test("household with nobody needs nothing, which the card reports as an error", () => {
  assert.deepEqual(plain(household(KINDS.food, { men: 0, women: 0 })), { men: 0, women: 0, people: "", perDay: 0 });
});

test("household ignores fractions and negatives", () => {
  assert.equal(household(KINDS.food, { men: 1.9, women: -2 }).perDay, 2500);
});

test("fmtDays rounds down, to a tenth below 10 days", () => {
  assert.equal(fmtDays(2.175), "2.1");
  assert.equal(fmtDays(9.99), "9.9");
  assert.equal(fmtDays(10.9), "10");
  assert.equal(fmtDays(0), "0");
});

test("amounts are grouped and carry their unit", () => {
  assert.equal(fmtKcal(135000), "135,000 kcal");
  assert.equal(fmtKcal(1316.7), "1,317 kcal");
  assert.equal(fmtLitres(1.5), "1.5 L");
  assert.equal(fmtLitres(56), "56 L");
});

test("listName gives the name Local To-do turns into the entity id", () => {
  assert.equal(listName("todo.food_stockpile"), "Food stockpile");
  assert.equal(listName("todo.water_stockpile"), "Water stockpile");
});

test("esc escapes markup in names", () => {
  assert.equal(esc(`Tom's <b>"beans"</b> & co`), "Tom&#39;s &lt;b&gt;&quot;beans&quot;&lt;/b&gt; &amp; co");
});

test("both cards register, each with its own list", () => {
  const { defined } = ctx.customElements;
  assert.deepEqual(Object.keys(defined), ["food-stockpile-card", "water-stockpile-card"]);
  assert.deepEqual(plain(defined["food-stockpile-card"].getStubConfig()), { entity: "todo.food_stockpile", men: 1, women: 1 });
  assert.deepEqual(plain(defined["water-stockpile-card"].getStubConfig()), { entity: "todo.water_stockpile", men: 1, women: 1 });
  assert.deepEqual(plain(ctx.window.customCards.map((x) => x.type)), ["food-stockpile-card", "water-stockpile-card"]);
});

test("the editor labels state each card's daily need per person", () => {
  const form = ctx.customElements.defined["water-stockpile-card"].getConfigForm();
  assert.equal(form.computeLabel({ name: "men" }), "Adult men (4 L a day each)");
  const food = ctx.customElements.defined["food-stockpile-card"].getConfigForm();
  assert.equal(food.computeLabel({ name: "women" }), "Adult women (2,000 kcal a day each)");
});

test("a card without an entity is refused", () => {
  const el = new ctx.customElements.defined["food-stockpile-card"]();
  assert.throws(() => el.setConfig({}), /todo\.food_stockpile/);
});
