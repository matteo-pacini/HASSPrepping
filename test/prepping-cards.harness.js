// Loads prepping-cards.js for the tests. The cards are a browser script, so it
// runs in a vm context with just enough DOM stubbed for the elements to be
// defined and constructed.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({});
vm.runInContext(
  `
  class HTMLElement {
    attachShadow() {
      return (this.shadowRoot = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] });
    }
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

module.exports = {
  ctx,
  // The script's top-level declarations, which are not properties of the
  // context's global object and so are fetched by name.
  cards: vm.runInContext(
    "({ KINDS, readItems, itemJSON, household, listName, fmtDays, fmtKcal, fmtLitres, esc })",
    ctx
  ),

  // Values built inside the vm have that realm's prototypes, which deepEqual
  // rejects; a JSON round trip brings them into this one.
  plain: (v) => JSON.parse(JSON.stringify(v)),

  // A to-do item as todo/item/subscribe reports it.
  item: (summary, description, uid = summary) => ({
    uid,
    summary,
    status: "needs_action",
    description: typeof description === "string" ? description : JSON.stringify(description),
  }),
};
