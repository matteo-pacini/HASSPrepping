// Prepping cards: food stockpile and water stockpile.
//
// Each card shows how many days a household's stock lasts, against a target
// number of days, and lets you count stock up and down. The data lives in a
// Home Assistant to-do list (a Local To-do list works): one item per food or
// bottle size, with its figures as JSON in the item's description, plus one
// settings item per card that holds its target. Each card has its own list,
// though both can share one.
// Everyone who can see the list sees the same stock.

// Taps on one row are written once they stop for this long; the to-do list
// stores whole descriptions, so a burst of taps becomes one write.
const WRITE_DELAY_MS = 600;

const PALETTE = ["#ffb86c", "#8be9fd", "#ff79c6", "#50fa7b", "#bd93f9", "#f1fa8c", "#ff5555", "#6272a4"];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const parse = (description) => {
  try {
    const v = JSON.parse(description || "");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
};

const num = (v, min = 0) => Math.max(min, Number(v) || 0);
const fmtKcal = (k) => Math.round(k).toLocaleString("en-GB") + " kcal";
const fmtLitres = (l) => (Math.round(l * 10) / 10).toLocaleString("en-GB") + " L";
// Rounded down, so the card never promises a day that isn't there.
// The name Local To-do needs to create `entity`: it derives the entity id from
// the list's name, so todo.food_stockpile comes from "Food stockpile".
const listName = (entity) => {
  const s = entity.split(".")[1].replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const fmtDays = (d) => (d >= 10 ? Math.floor(d).toString() : (Math.floor(d * 10) / 10).toString());

// What makes each card different. `fields` are the figures an item stores
// besides its count, in the order the add/edit form asks for them; an item
// belongs to the card when its description has every one of them.
const KINDS = {
  food: {
    tag: "food-stockpile-card",
    name: "Food stockpile",
    description: "Days of food in stock against a target, counted from a to-do list",
    title: "Food",
    entity: "todo.food_stockpile",
    settings: "Food stockpile settings",
    defaultTarget: 30,
    // NHS reference intakes for adults, in kcal a day.
    perMan: 2500,
    perWoman: 2000,
    fmt: fmtKcal,
    fields: [
      { key: "portion_g", label: "Portion (g)", min: 1 },
      { key: "kcal_per_100g", label: "kcal per 100 g", min: 0 },
    ],
    each: (f) => (f.portion_g * f.kcal_per_100g) / 100,
    add: "Add food",
    empty: "No food yet. Add one below.",
  },
  water: {
    tag: "water-stockpile-card",
    name: "Water stockpile",
    description: "Days of water in stock against a target, counted from a to-do list",
    title: "Water",
    entity: "todo.water_stockpile",
    settings: "Water stockpile settings",
    defaultTarget: 7,
    // About a US gallon (3.8 L) per person a day for drinking and basic
    // hygiene, as FEMA advises; the guidance doesn't differ by sex.
    perMan: 4,
    perWoman: 4,
    fmt: fmtLitres,
    fields: [{ key: "litres", label: "Litres each", min: 0.1 }],
    each: (f) => f.litres,
    add: "Add bottles",
    empty: "No water yet. Add a bottle size below.",
  },
};

// Splits the to-do items into this card's items and its settings item.
const readItems = (kind, items) => {
  const rows = [];
  let settings = null;
  for (const it of items) {
    const v = parse(it.description);
    if (!v) continue;
    if (it.summary === kind.settings && "target_days" in v) {
      settings = { uid: it.uid, target_days: num(v.target_days, 1) };
    } else if (kind.fields.every((f) => f.key in v)) {
      const row = { uid: it.uid, name: it.summary, count: Math.floor(num(v.count)) };
      for (const f of kind.fields) row[f.key] = num(v[f.key]);
      rows.push(row);
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { rows, settings };
};

// Who the card counts for, from its config, and what they need a day between them.
const household = (kind, config) => {
  const men = Math.floor(num(config.men ?? 1));
  const women = Math.floor(num(config.women ?? 1));
  const people = [men && `${men} ${men === 1 ? "man" : "men"}`, women && `${women} ${women === 1 ? "woman" : "women"}`]
    .filter(Boolean)
    .join(" · ");
  return { men, women, people, perDay: men * kind.perMan + women * kind.perWoman };
};

const itemJSON = (kind, row) => {
  const v = {};
  for (const f of kind.fields) v[f.key] = row[f.key];
  v.count = row.count;
  return JSON.stringify(v);
};

const STYLE = `
  :host { display: block; }
  ha-card { padding: 16px; display: grid; gap: 16px; container-type: inline-size; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .title { font: 500 16px var(--ha-font-family-body, Roboto, sans-serif); color: var(--secondary-text-color); }
  .days { font-size: 40px; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; }
  .days small { font-size: 16px; font-weight: 400; color: var(--secondary-text-color); margin-left: 4px; }
  .days.low { color: var(--warning-color, #ffb86c); }
  .days.met { color: var(--success-color, #50fa7b); }
  .amount { color: var(--secondary-text-color); font-variant-numeric: tabular-nums; margin-top: 4px; }
  .target { display: flex; align-items: center; gap: 4px; white-space: nowrap; color: var(--secondary-text-color); }
  .target output { min-width: 3ch; text-align: center; color: var(--primary-text-color); font-weight: 600; font-variant-numeric: tabular-nums; }
  .bar { display: flex; height: 12px; margin-top: 12px; border-radius: 6px; overflow: hidden; background: var(--divider-color); }
  .bar span { height: 100%; }
  .bar span + span { border-left: 1px solid var(--card-background-color, #1c1c1c); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  li { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; align-items: center; padding: 8px 0; border-top: 1px solid var(--divider-color); }
  .name { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-weight: 500; overflow-wrap: anywhere; }
  .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; }
  .sub { grid-column: 1; color: var(--secondary-text-color); font-size: 13px; padding-left: 18px; }
  .total { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .count { grid-column: 2; grid-row: 2; display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
  .count output { min-width: 3ch; text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }
  button { font: inherit; color: var(--primary-text-color); background: var(--secondary-background-color, transparent); border: 1px solid var(--divider-color); border-radius: 8px; min-width: 36px; height: 36px; padding: 0 10px; cursor: pointer; }
  button:hover:not(:disabled) { border-color: var(--primary-color); }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  button:disabled { opacity: .4; cursor: default; }
  button.edit { border-color: transparent; background: none; color: var(--secondary-text-color); }
  .primary { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
  .danger { color: var(--error-color, #ff5555); margin-left: auto; }
  .empty, .error { color: var(--secondary-text-color); }
  .error { color: var(--error-color, #ff5555); }
  form { display: grid; grid-template-columns: 2fr repeat(var(--fields), 1fr); gap: 8px; padding-top: 12px; border-top: 1px solid var(--divider-color); }
  form[hidden] { display: none; }
  label { display: grid; gap: 2px; font-size: 12px; color: var(--secondary-text-color); min-width: 0; }
  input { font: inherit; color: var(--primary-text-color); background: var(--secondary-background-color, transparent); border: 1px solid var(--divider-color); border-radius: 8px; height: 36px; padding: 0 8px; width: 100%; box-sizing: border-box; }
  .actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; }
  @container (max-width: 360px) { form { grid-template-columns: 1fr 1fr; } .field-name { grid-column: 1 / -1; } }
`;

class StockpileCard extends HTMLElement {
  // Set by each card's subclass to one of KINDS.
  static kind;

  static getConfigForm() {
    const kind = this.kind;
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "todo" } } },
        { name: "title", selector: { text: {} } },
        { name: "men", selector: { number: { min: 0, max: 20, step: 1, mode: "box" } } },
        { name: "women", selector: { number: { min: 0, max: 20, step: 1, mode: "box" } } },
      ],
      computeLabel: (s) =>
        ({
          entity: "To-do list",
          title: "Title",
          men: `Adult men (${kind.fmt(kind.perMan)} a day each)`,
          women: `Adult women (${kind.fmt(kind.perWoman)} a day each)`,
        })[s.name],
    };
  }

  static getStubConfig() {
    return { entity: this.kind.entity };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._kind = this.constructor.kind;
    this._rows = [];
    this._settings = null;
    this._loaded = false;
    this._error = null;
    // Values tapped here and not yet stored, by item uid. Updates from Home
    // Assistant don't overwrite them, so a burst of taps isn't undone by the
    // echo of an earlier write.
    this._local = new Map();
    this._timers = new Map();
    this._editing = null;
  }

  setConfig(config) {
    if (!config?.entity) throw new Error(`Set entity to a to-do list, e.g. ${this._kind.entity}`);
    const changed = this._config?.entity !== config.entity;
    this._config = config;
    this._build();
    if (changed) this._resubscribe();
    this._update();
  }

  set hass(hass) {
    const first = !this._hass;
    const existed = this._exists();
    this._hass = hass;
    // A list created after the card loaded needs a fresh subscription.
    if (first || this._exists() !== existed) {
      this._resubscribe();
      this._update();
    }
  }

  _exists() {
    return Boolean(this._hass && this._config && this._hass.states[this._config.entity]);
  }

  connectedCallback() {
    if (!this._unsub) this._resubscribe();
  }

  disconnectedCallback() {
    this._unsubscribe();
  }

  getCardSize() {
    return 3 + this._rows.length;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  _unsubscribe() {
    const unsub = this._unsub;
    this._unsub = null;
    if (unsub) unsub.then((f) => f()).catch(() => {});
  }

  _resubscribe() {
    this._unsubscribe();
    if (!this._exists() || !this.isConnected) return;
    this._loaded = false;
    this._unsub = this._hass.connection.subscribeMessage(
      (msg) => {
        const { rows, settings } = readItems(this._kind, msg.items || []);
        this._rows = rows;
        this._settings = settings;
        this._loaded = true;
        this._error = null;
        if (this._editing && this._editing !== "new" && !rows.some((r) => r.uid === this._editing)) this._closeForm();
        this._update();
      },
      { type: "todo/item/subscribe", entity_id: this._config.entity },
    );
    this._unsub.catch((e) => {
      this._unsub = null;
      this._error = e?.message || String(e);
      this._update();
    });
  }

  _service(service, data) {
    return this._hass
      .callService("todo", service, data, { entity_id: this._config.entity })
      .catch((e) => {
        this._error = "Couldn't save: " + (e?.message || e);
        this._update();
        throw e;
      });
  }

  // Creates the card's list with Local To-do, which only an admin may do.
  async _createList() {
    this._creating = true;
    this._error = null;
    this._update();
    try {
      const flow = await this._hass.callApi("POST", "config/config_entries/flow", { handler: "local_todo", show_advanced_options: false });
      const done = await this._hass.callApi("POST", `config/config_entries/flow/${flow.flow_id}`, {
        todo_list_name: listName(this._config.entity),
      });
      if (done.type !== "create_entry") throw new Error(done.reason || "Local To-do didn't create the list");
    } catch (e) {
      this._error = "Couldn't create the list: " + (e?.body?.message || e?.message || e);
    }
    this._creating = false;
    this._update();
  }

  _target() {
    return this._local.get("target") ?? this._settings?.target_days ?? this._kind.defaultTarget;
  }

  _count(r) {
    return this._local.get(r.uid) ?? r.count;
  }

  // Stores a tapped value after WRITE_DELAY_MS, keeping it on screen meanwhile.
  _queue(key, value, write) {
    this._local.set(key, value);
    clearTimeout(this._timers.get(key));
    this._timers.set(
      key,
      setTimeout(async () => {
        try {
          await write(value);
        } catch {
          // _service has already shown the error.
        }
        if (this._local.get(key) === value) this._local.delete(key);
        this._update();
      }, WRITE_DELAY_MS),
    );
    this._update();
  }

  _setTarget(days) {
    this._queue("target", Math.max(1, days), (v) => {
      const description = JSON.stringify({ target_days: v });
      return this._settings
        ? this._service("update_item", { item: this._settings.uid, description })
        : this._service("add_item", { item: this._kind.settings, description });
    });
  }

  _setCount(r, n) {
    // The other figures are read when the write happens, in case the item was edited meanwhile.
    this._queue(r.uid, Math.max(0, n), (v) => {
      const now = this._rows.find((x) => x.uid === r.uid) || r;
      return this._service("update_item", { item: r.uid, description: itemJSON(this._kind, { ...now, count: v }) });
    });
  }

  _build() {
    if (this._built) return;
    this._built = true;
    const kind = this._kind;
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <div class="summary"></div>
        <ul class="list"></ul>
        <div class="foot"><button type="button" class="add">${esc(kind.add)}</button></div>
        <form hidden style="--fields: ${kind.fields.length}">
          <label class="field-name">Name<input name="item_name" required maxlength="80" autocomplete="off"></label>
          ${kind.fields.map((f) => `<label>${esc(f.label)}<input name="${f.key}" type="number" min="${f.min}" step="any" required></label>`).join("")}
          <div class="actions">
            <button type="submit" class="primary save">Add</button>
            <button type="button" class="cancel">Cancel</button>
            <button type="button" class="danger remove" hidden>Remove</button>
          </div>
        </form>
      </ha-card>`;
    const root = this.shadowRoot;
    this._form = root.querySelector("form");
    root.querySelector(".add").addEventListener("click", () => this._openForm("new"));
    root.querySelector(".cancel").addEventListener("click", () => this._closeForm());
    root.querySelector(".remove").addEventListener("click", () => {
      const uid = this._editing;
      this._closeForm();
      clearTimeout(this._timers.get(uid));
      this._local.delete(uid);
      this._service("remove_item", { item: [uid] }).catch(() => {});
    });
    this._form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(this._form);
      const name = String(fd.get("item_name")).trim();
      if (!name) return;
      const fields = {};
      for (const f of kind.fields) fields[f.key] = num(fd.get(f.key));
      const old = this._rows.find((r) => r.uid === this._editing);
      if (old) {
        const data = { item: old.uid, description: itemJSON(kind, { ...fields, count: this._count(old) }) };
        if (name !== old.name) data.rename = name;
        this._service("update_item", data).catch(() => {});
      } else {
        this._service("add_item", { item: name, description: itemJSON(kind, { ...fields, count: 0 }) }).catch(() => {});
      }
      this._closeForm();
    });
    // One listener for every row's buttons, since rows are rebuilt on each update.
    root.querySelector(".summary").addEventListener("click", (e) => {
      if (e.target.closest("button.create")) return this._createList();
      const b = e.target.closest("button[data-target]");
      if (b) this._setTarget(this._target() + Number(b.dataset.target));
    });
    root.querySelector(".list").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      const r = b && this._rows.find((x) => x.uid === b.closest("li").dataset.uid);
      if (!r) return;
      if (b.dataset.step) this._setCount(r, this._count(r) + Number(b.dataset.step));
      else if (b.classList.contains("edit")) this._openForm(r.uid);
    });
  }

  _openForm(uid) {
    const r = this._rows.find((x) => x.uid === uid);
    this._editing = uid;
    this._form.reset();
    if (r) {
      this._form.elements.item_name.value = r.name;
      for (const f of this._kind.fields) this._form.elements[f.key].value = r[f.key];
    }
    this._form.querySelector(".save").textContent = r ? "Save" : "Add";
    this._form.querySelector(".remove").hidden = !r;
    this._form.hidden = false;
    this.shadowRoot.querySelector(".foot").hidden = true;
    this._form.elements.item_name.focus();
  }

  _closeForm() {
    this._editing = null;
    this._form.hidden = true;
    this.shadowRoot.querySelector(".foot").hidden = false;
  }

  _update() {
    if (!this._built) return;
    const kind = this._kind;
    const root = this.shadowRoot;
    const summary = root.querySelector(".summary");
    const list = root.querySelector(".list");
    if (this._hass && !this._exists()) {
      const name = listName(this._config.entity);
      summary.innerHTML = `
        <div class="title">${esc(this._config.title ?? kind.title)}</div>
        <p class="empty">${esc(this._config.entity)} doesn't exist yet.</p>
        ${
          this._hass.user?.is_admin
            ? `<button type="button" class="primary create" ${this._creating ? "disabled" : ""}>Create the “${esc(name)}” list</button>`
            : `<p class="empty">Ask an admin to add a Local To-do list called “${esc(name)}”.</p>`
        }
        ${this._error ? `<div class="error">${esc(this._error)}</div>` : ""}`;
      list.innerHTML = "";
      root.querySelector(".foot").hidden = true;
      return;
    }
    root.querySelector(".foot").hidden = Boolean(this._editing);
    if (this._error && !this._loaded) {
      summary.innerHTML = `<div class="error">${esc(this._error)}</div>`;
      list.innerHTML = "";
      return;
    }
    if (!this._loaded) {
      summary.innerHTML = `<div class="empty">Loading…</div>`;
      return;
    }
    const { people, perDay } = household(kind, this._config);
    if (!perDay) {
      summary.innerHTML = `<div class="error">Set men or women to at least 1.</div>`;
      list.innerHTML = "";
      return;
    }
    const target = this._target();
    const goal = target * perDay;
    const rows = this._rows.map((r, i) => {
      const n = this._count(r);
      return { r, n, amount: n * kind.each(r), color: PALETTE[i % PALETTE.length] };
    });
    const total = rows.reduce((t, x) => t + x.amount, 0);
    const days = total / perDay;
    const title = this._config.title ?? kind.title;
    // Segments fill the bar up to the target; past it, they share the bar in proportion.
    const scale = Math.max(goal, total) || 1;
    const focused = root.activeElement;
    const targetFocus = focused?.dataset?.target;
    summary.innerHTML = `
      <div class="head">
        <div>
          <div class="title">${esc(title)}</div>
          <div class="days ${days < target ? "low" : "met"}">${fmtDays(days)}<small>of ${target} days</small></div>
          <div class="amount">${kind.fmt(total)} / ${kind.fmt(goal)}</div>
          <div class="amount">${people} · ${kind.fmt(perDay)} a day</div>
        </div>
        <div class="target" role="group" aria-label="Target days">
          <button type="button" data-target="-1" aria-label="One day less" ${target <= 1 ? "disabled" : ""}>−</button>
          <output>${target}</output>
          <button type="button" data-target="1" aria-label="One day more">+</button>
        </div>
      </div>
      <div class="bar" role="img" aria-label="${kind.fmt(total)} of ${kind.fmt(goal)}">
        ${rows.filter((x) => x.amount > 0).map((x) => `<span style="width:${(100 * x.amount) / scale}%;background:${x.color}" title="${esc(x.r.name)}"></span>`).join("")}
      </div>
      ${this._error ? `<div class="error">${esc(this._error)}</div>` : ""}`;
    if (targetFocus) summary.querySelector(`button[data-target="${targetFocus}"]`)?.focus();
    const refocus = focused?.closest?.("li") && [focused.closest("li").dataset.uid, focused.dataset.step ?? "edit"];
    list.innerHTML = rows.length
      ? rows
          .map(
            ({ r, n, amount, color }) => `
      <li data-uid="${esc(r.uid)}">
        <div class="name"><span class="dot" style="background:${color}"></span><span>${esc(r.name)}</span></div>
        <div class="total">${kind.fmt(amount)} · ${fmtDays(amount / perDay)} d</div>
        <div class="sub">${kind.fmt(kind.each(r))} each</div>
        <div class="count">
          <button type="button" class="edit" aria-label="Edit ${esc(r.name)}"><ha-icon icon="mdi:pencil"></ha-icon></button>
          <button type="button" data-step="-1" aria-label="One less ${esc(r.name)}" ${n === 0 ? "disabled" : ""}>−</button>
          <output>${n}</output>
          <button type="button" data-step="1" aria-label="One more ${esc(r.name)}">+</button>
        </div>
      </li>`,
          )
          .join("")
      : `<li class="empty">${esc(kind.empty)}</li>`;
    // Rows are rebuilt on each update, so put keyboard focus back on the button that was pressed.
    if (refocus) {
      const li = [...list.children].find((x) => x.dataset.uid === refocus[0]);
      li?.querySelector(refocus[1] === "edit" ? "button.edit" : `button[data-step="${refocus[1]}"]`)?.focus();
    }
  }
}

window.customCards = window.customCards || [];
for (const kind of Object.values(KINDS)) {
  customElements.define(kind.tag, class extends StockpileCard {
    static kind = kind;
  });
  window.customCards.push({
    type: kind.tag,
    name: kind.name,
    description: kind.description,
    preview: false,
    documentationURL: "https://github.com/matteo-pacini/HASSPrepping",
  });
}
