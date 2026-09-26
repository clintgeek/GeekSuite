# ThingGeek — plan and spec

*Written 2026-09-25 from Chef's design note ("Using MongoDB, GraphQL, and AI for Flexible
Inventory Management") and the conversation after it. Chef: "start when ready, keep going
until done, make decisions on my behalf based on how you see things done elsewhere in
geeksuite or your best judgement." Status: **building overnight, 2026-09-25 → 26.***

## What it is

The household inventory of everything worth remembering we own: boats, vehicles,
firearms, tools, electronics, keyboards, appliances. The payoff moments are:
- "where is it?" and "what's attached to Wendy?";
- "what's expiring or due?";
- **the insurance claim**: make, model, serial, photo, receipt and value for everything,
  exportable on a bad day.

## Decisions (Chef, 2026-09-25)

| Topic | Decision |
|---|---|
| Name | **ThingGeek**, `thinggeek.clintgeek.com`, host port **1820** |
| Who sees it | **Household members only.** Until suite households exist, a **member allowlist**: Chef (`6818c2bddcf626909f6a93a1`, clint@clintgeek.com) and Heather (`689931bbe8828efb78d11bab`, username `heather`). Every other account gets "not a member", enforced in the gateway AND the backend. The other two accounts in userGeek are the reason; they must not see firearms. |
| Files | **App storage** on the box (`apps/thinggeek/data/files`), not Nextcloud. Nextcloud sync isn't backup, and writing into it is the documented ghost-file landmine. |
| AI | **Tier punted.** The Ask feature is phase 2. **Privacy rule (agreed):** identifier fields (serials, VIN, hull, registration), document contents and money values **never** go to an AI provider. AI tools see "has a serial: yes", never the value. |
| Insurance report | **Agreed as important.** CSV export plus a printable report page (the browser's print to PDF: photo, make/model, serial, value, receipt present), in MVP. |
| Demo data | **None.** Chef deleted GameGeek's demo games; ThingGeek starts empty with a helpful empty state and starter types. |

## Architecture (the GameGeek pattern)

- **Data in basegeek's gateway:** `graphql/thinggeek/`, household-scoped plus the member
  gate, in every resolver.
- **Schemas once:** `@geeksuite/schemas/thinggeek/*`, shared by the gateway and the
  backend.
- **Backend** `apps/thinggeek/backend` owns bytes and jobs: photo and document upload,
  thumbnails, serving files (auth plus household-scoped), the CSV export, and the
  printable-report data.
- **Frontend** `apps/thinggeek/frontend`: React 18, MUI 5, `@geeksuite/ui` shell,
  **`@geeksuite/collection`** for browse, filters and saved views (its third consumer),
  `/` focus, VitePWA.
- **Registration:** the same checklist as GameGeek (`DOCS/GameGeekPlan.md` §9): CORS
  allow-list, app registry seed, app switcher, build.sh, CI jobs, harness registry, boot
  smoke, gql audit, nginx vhost, compose with a `dns:` pin, Watchtower label, and the first
  `compose up -d`.

## Data model

```js
// Thing — collection thinggeek.things
{
  householdId, name,                        // required
  typeId,                                   // → ThingType
  tags: [String],
  placeId: ObjectId|null,                   // → Place (tree)
  acquired: { date, from, price },          // date = calendar (UTC midnight), price = money
  value: { amount, currency: 'USD', asOf }, // current value, for insurance
  dates: [{ kind: 'warranty'|'registration'|'insurance'|'license'|'maintenance'|'other',
            label, date, recurEveryMonths|null, notes }],   // powers "expiring / due"
  attributes: { ... },                      // validated against the ThingType
  photos: [{ id, fileId, role: 'overview'|'id-plate'|'receipt'|'detail'|'other', caption }],
  documents: [{ id, fileId, role: 'receipt'|'manual'|'warranty'|'registration'|'insurance'|'other', title }],
  relationships: [{ kind: 'equipped-with'|'part-of'|'accessory-of'|'stored-with', thingId }],
  notes: String,
  createdBy, timestamps
}
// Inverse relationships ("Wendy is equipped with the fish finder" ⇄ "the fish finder is
// part of Wendy's equipment") are derived at read time, never stored twice.

// ThingType — collection thinggeek.thingtypes (household-editable data, not code)
{ householdId, name, icon, fields: [{ key, label, kind: 'text'|'number'|'date'|'choice'|'money'|'url'|'boolean',
  choices?, unit?, identifier: Boolean, required: Boolean }], builtIn: Boolean }

// Place — collection thinggeek.places (a tree)
{ householdId, name, parentId|null, notes }

// ThingFile — collection thinggeek.files
{ householdId, kind: 'photo'|'document', mime, size, sha256, path, thumbPath, originalName, uploadedBy }
```

**Starter types**, seeded once per household and editable. Identifier fields are marked ★.

| Type | Fields |
|---|---|
| Boat | manufacturer, model, year, length (ft), engine, hull number ★, registration number ★ |
| Vehicle | make, model, year, VIN ★, plate ★, mileage |
| Firearm | manufacturer, model, kind (handgun/rifle/shotgun/other), caliber/gauge, action, serial ★ |
| Tool | brand, model, power (corded/battery/manual/gas), serial ★ |
| Electronics | brand, model, serial ★ |
| Keyboard | brand, model, layout, switches, keycaps, connection |
| Appliance | brand, model, serial ★ |
| Camera | brand, model, serial ★ |
| General | no fields |

## Deterministic search, no AI

The search box parses tokens and passes the rest through as text over name, notes,
tags and attribute values:
- `type:firearm`, `tag:fishing`, `in:garage` (includes descendant places)
- `before:2020` / `after:2023-06` (acquired)
- `expiring:90d` / `due:30d`
- `missing:photo|id-plate|receipt|serial|value`
- `has:document`

Facets: type, tag, place (the tree), acquired year, expiring and due buckets, "missing",
has photos or documents, value band. Everything is household-scoped, and search input is
escaped (the ReDoS rule).

## Screens (GeekSuite design language)

- **Library:** photo cards (type icon, name, place, tags) plus a list view, the facet
  panel and sheet, chips, sort (name, acquired, value, recently added, next due), and saved
  views.
- **Thing page:**
  - a photo gallery at the top with role badges;
  - core fields;
  - type attributes, where **identifier fields are masked with a tap-to-reveal** (so a
    serial isn't on screen for anyone looking over your shoulder);
  - a dates timeline;
  - relationships as sentences;
  - documents with preview and download;
  - notes.
- **Add a thing (phone-first):** photo first (camera capture), then type, name and place,
  then save. Details can be added later.
- **Needs attention:** expiring or due soon, missing ID-plate photo, missing receipt,
  empty identifier fields, missing value.
- **Places:** tree manager.
- **Types:** type editor (fields, kinds, identifier flag, choices).
- **Insurance report:** a printable page and a CSV.
- **Settings.**
- **Identity:** its own palette inside the suite shell. Every page must pass the phone
  AND desktop harness with `--enforce-a11y` (CI now gates both).

## Files

- **Photos:** jpeg, png and webp are accepted; HEIC is stored and converted where sharp
  can manage it, otherwise shown as a generic tile.
- **Documents:** pdf, images and txt.
- **Limits:** 25 MB per file; the nginx `client_max_body_size` is 30m.
- **Checks:** magic bytes verified, sha256 dedupe.
- **Thumbnails:** 480 px webp.
- **Serving:** only with auth plus household plus member, `Cache-Control: private`.
  Nothing is hot-linked.

## Phase 2 (not tonight)

- **AI Ask (`??`):** the model plans a structured query from primitives (`find_by_type`,
  `find_by_tag`, `find_by_place`, `find_expiring`, `find_related`, `find_missing`,
  `search_text`); the server runs it; the model answers from 5–20 **redacted** things with
  citations.
- The MCP tools through basegeek's `/mcp` (`DOCS/MCP_PLAN.md`), built together with Chef.
- A PDF insurance report with embedded photos.
