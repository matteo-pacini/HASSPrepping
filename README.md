# Prepping Cards

Two Home Assistant dashboard cards for a household stockpile: one for food, one for water. Each shows how many days the stock lasts for the people you set, against a target number of days, and keeps each item in numbered batches by best-before date, so you can see what to eat first. The stock lives in Home Assistant to-do lists, so everyone in the house sees the same numbers.

![Food stockpile card on a dark theme](images/food.png)

| Light theme | Water, target met |
| --- | --- |
| ![Food card on a light theme](images/food-light.png) | ![Water card with 10 of 7 days](images/water.png) |

On a phone, long names and batches wrap:

<p>
  <img src="images/mobile.png" alt="Food card on a phone, dark theme" width="250">
  <img src="images/mobile-light.png" alt="Food card on a phone, light theme" width="250">
  <img src="images/mobile-water.png" alt="Water card on a phone" width="250">
</p>

## Install

**HACS:** use the button, then download Prepping Cards.

[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=matteo-pacini&repository=HASSPrepping&category=plugin)

Or add this repository as a custom repository of type *Dashboard*.

**Manual:** copy `prepping-cards.js` to `config/www/`, then add `/local/prepping-cards.js` as a JavaScript module resource.

## Lists

Each card keeps its stock in a to-do list. By default:

| Card | List | Entity |
| --- | --- | --- |
| Food stockpile | Food stockpile | `todo.food_stockpile` |
| Water stockpile | Water stockpile | `todo.water_stockpile` |

If a card's list doesn't exist yet, the card offers to create it as a Local To-do list. Only an admin can; anyone else is told which list to ask for.

![Card offering to create its list](images/missing-list.png)

To create a list by hand: **Settings → Devices & services → Add integration → Local To-do**, named as in the table. The name sets the entity id, so *Food stockpile* becomes `todo.food_stockpile`. Any to-do list that can hold item descriptions works; point the card's `entity` at it.

## Usage

Add the cards from the dashboard editor and fill them in there, or write the YAML yourself. The visual editor has the list, the title, the number of men and women side by side, and the locale. Its labels are in English.

```yaml
type: custom:food-stockpile-card
entity: todo.food_stockpile
men: 1
women: 1
```

```yaml
type: custom:water-stockpile-card
entity: todo.water_stockpile
men: 1
women: 1
```

Everything else happens on the card:

- **− and +** beside the big number change the target number of days. It starts at 30 for food and 7 for water. The number turns green once the stock covers the target.
- **Add food** or **Add bottles** opens a form. Food asks for the portion in grams and the calories per 100 g from the label; bottles ask for the litres each holds. A new item goes at the bottom of the list. The pencil on a row edits or removes it.
- **Batches** sit under each row, soonest to expire first: *B2 · 6 · Mar 2027* is batch 2, six of them, best before the end of March 2027. A batch turns amber within 30 days of its date and red once past it. The number beside the pencil is the row's total.
- **+ B3** adds a batch: its best-before month and how many. A batch with the same month gets them instead.
- **Tap a batch** to change its date or how many are left, or to remove it. Setting it to 0 removes it too.

![Editing a batch of baked beans](images/batch-edit.png)

A batch keeps its number until it's gone, so you can write it on the tins. Numbers are per item, and a new batch takes the next one up.

![Adding a food](images/add-food.png)

## Options

| Option | Default | Description |
| --- | --- | --- |
| `entity` | required | The to-do list that holds the stock |
| `title` | `Food` or `Water` | Card title |
| `men` | `1` | Adult men to feed, a whole number |
| `women` | `1` | Adult women to feed, a whole number |
| `locale` | Home Assistant's | BCP 47 tag, such as `de-DE`, for the card's text and numbers |
| `strings` | translated | Overrides for the card's own text, see below |

## Household

Set `men` and `women` to the adults in the household. The card adds up what they need a day, shows it under the totals (*1 man · 1 woman · 4,500 kcal a day*), and divides the stock by it to get days.

| Card | Per man | Per woman | Source |
| --- | --- | --- | --- |
| Food | 2,500 kcal | 2,000 kcal | NHS reference intakes for adults |
| Water | 4 L | 4 L | About a US gallon a day for drinking and basic hygiene, as FEMA advises |

For example, two men and one woman need 7,000 kcal and 12 L a day, so a 30-day food target is 210,000 kcal. Setting both to `0` makes the card ask for at least one person.

## Languages

<p>
  <img src="images/lang-it.png" alt="Food card in Italian" width="250">
  <img src="images/lang-de.png" alt="Food card in German for two men and two women" width="250">
  <img src="images/lang-pt-BR.png" alt="Food card in Brazilian Portuguese for two women" width="250">
</p>

The cards' own text is available in English, Dutch, French, German, Italian, Polish, Portuguese, Brazilian Portuguese, Simplified Chinese, Spanish and Swedish. It needs no setup: the cards use `locale` if set, otherwise your Home Assistant language.

A regional locale uses its regional text if there is one, then its language, so `pt-BR` gets Brazilian Portuguese and `de-AT` gets German. Traditional Chinese is not translated yet, so it shows English rather than Simplified. Anything untranslated falls back to English. Numbers always follow the locale, whichever language the text is in. The names of your foods and bottles are shown as you typed them. Batch labels use the language's word for a batch, so B2 is C2 in German (*Charge*) and L2 in Italian (*lotto*); the number is the same in every language.

To change individual strings, use `strings`:

```yaml
strings:
  food: Pantry
  per_day: "{amount} every day"
  men:
    one: "{n} adult man"
    other: "{n} adult men"
```

Keys: `food`, `water`, `of_days`, `days_short`, `per_day`, `each`, `men`, `women`, `target`, `day_less`, `day_more`, `edit`, `batch`, `new_batch`, `edit_batch`, `best_before`, `quantity`, `no_date`, `add_food`, `add_bottles`, `name`, `portion`, `kcal_per_100g`, `litres_each`, `add`, `save`, `cancel`, `remove`, `empty_food`, `empty_water`, `loading`, `nobody`, `missing`, `create`, `ask_admin`, `save_error`, `create_error`. Keep the `{n}`, `{amount}`, `{name}`, `{batch}`, `{entity}` and `{error}` placeholders. `of_days`, `men` and `women` change with the number: give one string for every number, or a form per [plural category](https://cldr.unicode.org/index/cldr-spec/plural-rules) (`one`, `few`, `many`, `other`, …) with `other` as the fallback.

## How the data is stored

Each food or bottle size is one to-do item. The item's name is what the card shows, and its description holds the figures and the batches as JSON:

```json
{"portion_g": 300, "kcal_per_100g": 439, "count": 4,
 "batches": [{"n": 1, "exp": "2027-03", "count": 3}, {"n": 2, "exp": "2027-09-15", "count": 1}]}
```

```json
{"litres": 2, "count": 16, "batches": [{"n": 1, "exp": "2028-06", "count": 16}]}
```

`exp` is the best-before date: a month (`2027-03`, good to the end of March) or a day (`2027-09-15`), or `null` for none. `count` is the batches' total, kept for anything that reads only that. An item from version 1.0, with a `count` and no `batches`, shows as one batch with no date.

One more item per card, *Food stockpile settings* or *Water stockpile settings*, holds its target: `{"target_days": 30}`. Items whose description is none of these are left alone and not shown, so both cards can share one list.

Items can be renamed or reordered in the to-do list itself; the card shows them in the list's order. Edit a description there only if it stays valid JSON; otherwise the card stops showing that item.

## License

MIT
