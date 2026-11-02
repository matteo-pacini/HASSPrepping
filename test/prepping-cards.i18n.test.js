// Tests for the cards' languages: the STRINGS table, which language a locale
// gets, plural forms, and number formatting.
//
// Run with `node --test test/*.test.js` from the repository root.

const test = require("node:test");
const assert = require("node:assert/strict");
const { cards: c } = require("./prepping-cards.harness.js");
const { STRINGS, translate, fill, plural, fmtNumber, fmtDays, fmtKcal, fmtLitres } = c;

const LANGUAGES = ["en", "de", "es", "fr", "it", "nl", "pl", "pt", "pt-BR", "sv", "zh-Hans"];
const placeholders = (v) =>
  [...new Set((typeof v === "string" ? [v] : Object.values(v)).join(" ").match(/\{\w+\}/g) || [])].sort();

test("the cards speak the same languages as the Budget Sankey card", () => {
  assert.deepEqual(Object.keys(STRINGS).sort(), [...LANGUAGES].sort());
});

for (const lang of LANGUAGES) {
  test(`${lang} has only keys that English has, with the same placeholders`, () => {
    for (const [k, v] of Object.entries(STRINGS[lang])) {
      assert.ok(k in STRINGS.en, `${lang} has stray key '${k}'`);
      assert.deepEqual(placeholders(v), placeholders(STRINGS.en[k]), `${lang}.${k}`);
    }
  });

  test(`${lang} plural mappings have an 'other' form and only CLDR categories`, () => {
    for (const [k, v] of Object.entries(STRINGS[lang])) {
      if (typeof v === "string") continue;
      assert.ok("other" in v, `${lang}.${k}`);
      for (const cat of Object.keys(v)) assert.ok(["zero", "one", "two", "few", "many", "other"].includes(cat), `${lang}.${k}.${cat}`);
    }
  });
}

test("every full language translates every key whose English isn't universal", () => {
  // Keys whose English text is also right in these languages, so they may be left out.
  const shared = {
    de: ["name", "portion"],
    es: ["days_short"],
    fr: ["portion"],
    it: ["kcal_per_100g"],
    nl: ["days_short", "kcal_per_100g"],
    pl: [],
    pt: ["days_short"],
    sv: ["days_short", "portion", "kcal_per_100g"],
    "zh-Hans": [],
  };
  for (const [lang, same] of Object.entries(shared)) {
    const missing = Object.keys(STRINGS.en).filter((k) => !(k in STRINGS[lang]));
    assert.deepEqual(missing, same, lang);
  }
});

test("a regional locale falls back to its language, then to English", () => {
  assert.equal(translate("de-AT").food, "Lebensmittel");
  assert.equal(translate("it-CH").water, "Acqua");
  assert.equal(translate("ko-KR").food, "Food");
  assert.equal(translate("en-US").food, "Food");
});

test("Portuguese and Brazilian Portuguese differ where they should", () => {
  assert.equal(translate("pt").save, "Guardar");
  assert.equal(translate("pt-PT").save, "Guardar");
  assert.equal(translate("pt-BR").save, "Salvar");
  // pt-BR picks up the rest from pt.
  assert.equal(translate("pt-BR").water, "Água");
});

test("Simplified Chinese is used for Hans locales only", () => {
  assert.equal(translate("zh-CN").food, "食物");
  assert.equal(translate("zh-Hans-SG").food, "食物");
  assert.equal(translate("zh-TW").food, "Food");
});

test("overrides win over every language", () => {
  assert.equal(translate("it", { food: "Dispensa" }).food, "Dispensa");
  assert.equal(translate("it", { food: "Dispensa" }).water, "Acqua");
});

test("fill replaces placeholders and takes names literally", () => {
  assert.equal(fill("Edit {name}", { name: "Beans $1 & $&" }), "Edit Beans $1 & $&");
  assert.equal(fill("{amount} a day", { amount: "8 L" }), "8 L a day");
});

test("English plurals", () => {
  assert.equal(plural(STRINGS.en.of_days, 1, "en"), "of 1 day");
  assert.equal(plural(STRINGS.en.of_days, 30, "en"), "of 30 days");
  assert.equal(plural(STRINGS.en.men, 1, "en"), "1 man");
  assert.equal(plural(STRINGS.en.women, 3, "en"), "3 women");
});

test("Polish plurals use one, few and many", () => {
  const men = STRINGS.pl.men;
  assert.equal(plural(men, 1, "pl"), "1 mężczyzna");
  assert.equal(plural(men, 2, "pl"), "2 mężczyźni");
  assert.equal(plural(men, 5, "pl"), "5 mężczyzn");
  assert.equal(plural(men, 22, "pl"), "22 mężczyźni");
  assert.equal(plural(STRINGS.pl.women, 12, "pl"), "12 kobiet");
  assert.equal(plural(STRINGS.pl.of_days, 1, "pl"), "z 1 dnia");
  assert.equal(plural(STRINGS.pl.of_days, 30, "pl"), "z 30 dni");
});

test("French counts 0 and 1 as singular", () => {
  assert.equal(plural(STRINGS.fr.of_days, 1, "fr"), "sur 1 jour");
  assert.equal(plural(STRINGS.fr.of_days, 7, "fr"), "sur 7 jours");
});

test("Chinese has one form", () => {
  assert.equal(plural(STRINGS["zh-Hans"].men, 1, "zh-CN"), "1 名男性");
  assert.equal(plural(STRINGS["zh-Hans"].men, 3, "zh-CN"), "3 名男性");
});

test("a plain-string override is used for every count", () => {
  assert.equal(plural("{n} adults", 1, "en"), "1 adults");
});

test("numbers group four digits in every locale", () => {
  assert.equal(fmtNumber(1800, "en-GB"), "1,800");
  assert.equal(fmtNumber(1800, "de-DE"), "1.800");
  assert.equal(fmtNumber(1800, "pl"), "1 800");
  assert.equal(fmtNumber(1800, "it"), "1.800");
});

test("kcal and litres follow the locale", () => {
  assert.equal(fmtKcal(135000, "en-GB"), "135,000 kcal");
  assert.equal(fmtKcal(135000, "de"), "135.000 kcal");
  assert.equal(fmtKcal(1316.7, "fr"), "1 317 kcal");
  assert.equal(fmtLitres(1.5, "en"), "1.5 L");
  assert.equal(fmtLitres(1.5, "it"), "1,5 L");
  assert.equal(fmtLitres(56, "sv"), "56 L");
});

test("days use the locale's decimal separator and still round down", () => {
  assert.equal(fmtDays(2.175, "en"), "2.1");
  assert.equal(fmtDays(2.175, "de"), "2,1");
  assert.equal(fmtDays(10.9, "de"), "10");
  assert.equal(fmtDays(9.99, "pl"), "9,9");
});
