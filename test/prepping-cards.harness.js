// Loads prepping-cards.js for the tests. The cards are a browser script, so it
// runs in a vm context with just enough DOM stubbed for the elements to be
// defined, constructed and rendered. The rendered markup is left as strings on
// the stub elements, which el.part(selector) returns.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({ setTimeout, clearTimeout });
vm.runInContext(
  `
  // One persistent stub per selector, so what _update() writes can be read back.
  const stub = () => ({
    innerHTML: "",
    textContent: "",
    hidden: false,
    dataset: {},
    attributes: {},
    elements: {},
    addEventListener() {},
    setAttribute(k, v) { this.attributes[k] = v; },
    querySelector: () => null,
    reset() {},
    focus() {},
  });
  class HTMLElement {
    attachShadow() {
      const parts = {};
      return (this.shadowRoot = {
        innerHTML: "",
        querySelector: (s) => (parts[s] ??= stub()),
        querySelectorAll: () => [],
      });
    }
    get isConnected() { return true; }
    part(s) { return this.shadowRoot.querySelector(s); }
  }
  var customElements = {
    defined: {},
    define(name, cls) {
      this.defined[name] = cls;
    },
  };
  var window = {};
  `,
  ctx
);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "prepping-cards.js"), "utf8"), ctx);

// A to-do item as todo/item/subscribe reports it.
const item = (summary, description, uid = summary) => ({
  uid,
  summary,
  status: "needs_action",
  description: typeof description === "string" ? description : JSON.stringify(description),
});

module.exports = {
  ctx,
  // The script's top-level declarations, which are not properties of the
  // context's global object and so are fetched by name.
  cards: vm.runInContext(
    "({ KINDS, STRINGS, translate, fill, plural, readItems, readBatches, itemJSON, household, checkConfig, editorForm, listName, fmtNumber, fmtDays, fmtKcal, fmtLitres, esc, expiryDate, daysLeft, expiryState, fmtExpiry, byExpiry, totalCount, nextBatch, addBatch, setBatch })",
    ctx
  ),

  // Values built inside the vm have that realm's prototypes, which deepEqual
  // rejects; a JSON round trip brings them into this one.
  plain: (v) => JSON.parse(JSON.stringify(v)),

  item,

  // A Home Assistant connection whose lists hold `lists[entity]`. Lists not
  // given don't exist.
  hass: (lists, { language = "en-GB", admin = true } = {}) => ({
    states: Object.fromEntries(Object.keys(lists).map((e) => [e, { state: "0" }])),
    locale: { language },
    user: { is_admin: admin },
    connection: {
      subscribeMessage: (cb, msg) => {
        cb({ items: lists[msg.entity_id] || [] });
        return Promise.resolve(() => {});
      },
    },
    callService: async () => {},
    callApi: async () => ({}),
  }),

  // A rendered card: `tag` is food-stockpile-card or water-stockpile-card.
  make: (tag, config, hass) => {
    const el = new ctx.customElements.defined[tag]();
    el.setConfig(config);
    if (hass) el.hass = hass;
    return el;
  },

  // Visible text of rendered markup: tags dropped, the entities esc() writes
  // decoded, whitespace collapsed.
  text: (html) =>
    html
      .replace(/<[^>]*>/g, " ")
      .replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e])
      .replace(/\s+/g, " ")
      .trim(),
};
