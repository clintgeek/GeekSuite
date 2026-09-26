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
  thumbnails, serving files (auth plus household-scoped), and the trash purge job.
  *As built:* the CSV export and the printable insurance report are assembled
  **client-side** from the gateway's `things` query, so the backend doesn't serve them.
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
  parentId: ObjectId|null,                  // → Thing: WHERE it is (see "Containment")
  acquired: { date, from, price },          // date = calendar (UTC midnight), price = money
  value: { amount, currency: 'USD', asOf }, // current value, for insurance
  dates: [{ kind: 'warranty'|'registration'|'insurance'|'license'|'maintenance'|'other',
            label, date, recurEveryMonths|null, notes }],   // powers "expiring / due"
  attributes: { ... },                      // validated against the ThingType
  photos: [{ id, fileId, role: 'overview'|'id-plate'|'receipt'|'detail'|'other', caption }],
  documents: [{ id, fileId, role: 'receipt'|'manual'|'warranty'|'registration'|'insurance'|'other', title }],
  relationships: [{ kind: 'accessory-of', thingId }],   // not location: see "Containment"
  notes: String,
  createdBy, timestamps
}
// The inverse ("the camera's accessories") is derived at read time, never stored twice.

// ThingType — collection thinggeek.thingtypes (household-editable data, not code)
{ householdId, name, icon, kind: 'location'|'container'|'item', fields: [{ key, label, kind: 'text'|'number'|'date'|'choice'|'money'|'url'|'boolean',
  choices?, unit?, identifier: Boolean, required: Boolean }], builtIn: Boolean }

// ThingFile — collection thinggeek.files
{ householdId, kind: 'photo'|'document', mime, size, sha256, path, thumbPath, originalName, uploadedBy }
```

## Containment (decided 2026-09-26, replacing the Place tree)

Chef: "Maybe places need to be objects as well? The Van has a VIN, but it might also contain
an aftermarket stereo, or maybe I just want to remember where my damn jumper cables are."

- **There is no Place collection.** Everything is a Thing, and `parentId` says where it is. It
  can point at any Thing: House → Garage → Van → Jumper cables. "Where is it?" is a walk up the
  parents. Moving the Van moves everything in it.
- **The type's `kind` decides the role:**

| kind | examples | in inventory, insurance, needs-attention | offered as "where it is" |
|---|---|---|---|
| `location` | house, room, closet, shelf | **no** | yes |
| `container` | van, boat, gun safe, toolbox, nightstand | yes | yes |
| `item` | jumper cables, firearm, keyboard | yes | no (it may still be a parent via Move) |

- **Location vs. relationships:** location is `parentId` only. `relationships` keeps only
  `accessory-of` (the lens that belongs to the camera but lives in a drawer).
  `equipped-with`, `part-of` and `stored-with` are gone: the stereo installed in the Van is
  simply *in* the Van.
- **Rules:**
  - No cycles: a thing can't move into itself or its descendants. Depth is capped at 16.
  - The parent must be in the same household and not in the trash.
  - Trashing a thing leaves its contents where they are; they show "inside something in the
    trash". Restoring brings the path back. Purging moves the contents up to the purged
    thing's parent.
  - A type can't change to `item` while any of its things contain things.
- **Search and facets:** `in:<name>` matches any ancestor (location or container) and
  includes all descendants. The **Where** facet (a tree) replaces the Place facet.
- **Migration (2026-09-26):** there were 0 things. Chef's 10 places convert to `location`
  things if that's simple; otherwise they're dropped (Chef: "I don't care if I lose my 10
  places"). The `places` collection is removed afterwards.

*As built (2026-09-26), where the above was silent:*
- **Depth** counts the top level as 1: House › Garage › Van › Jumper cables is 4, and no thing
  sits deeper than 16.
- **`in:`** names any live thing, or a name path ("house/garage"), including an item something
  was moved into. It matches everything inside that thing at any depth, but never the thing
  itself. It walks through things in the Trash: the cables in a trashed Van are still found by
  `in:garage`. The Where facet offers only live locations and containers.
- **Kinds in the library:** with no `kinds`, the filter is containers and items. Asking for a
  location type by name or id (`type:location`) brings locations in. The library shows them
  through a **Kind** facet (Containers, Items, Locations). `missing` never matches a location,
  and a location's `missing` is empty. The insurance totals and needs-attention always exclude
  locations; the report drops `location` from the library's kinds.
- **Pickers:** "Where is it?" (add and edit) lists locations and containers, and can make a new
  location inline. **Move to…** lists every live thing except the thing and what is inside it.
  A single thing may change to an item type while it holds things (items may hold things); only
  the type-level change to `item` is refused (CONFLICT), counting live things with live contents.
- **Trash:** nothing can be created in, or moved into, a thing in the Trash. A trashed ancestor
  stays in the path, flagged. The trash confirmation says what happens to the contents. Editing a
  thing sends `parentId` only when it changed.
- **Starter types** carry a version (`starterTypesVersion` on the profile, now 2). A version-1
  household is upgraded: every type without a kind gets one, and Location and Storage are
  added. A v1 starter type the household deleted stays deleted. The gateway and the migration
  share this step (`@geeksuite/schemas/thinggeek/starterTypes`).
- **Migration:** `apps/thinggeek/backend/scripts/migrate-containment.js` (dry run by default,
  then `--apply`, then `--apply --drop-places`) reuses each place's `_id` as its new Location
  thing's `_id`, so the tree carries over as it is.
- **Purge** works one thing at a time, so a Garage and the Van inside it purged together leave
  the cables in the House.
- **Screens:** the page is `/where` (`/places` redirects there). "Add here" opens the add flow
  with the parent already chosen. The relationships section is now called **Accessories**.

**Starter types**, seeded once per household and editable. Identifier fields are marked ★.

| Type | Fields |
|---|---|
| Location (`location`) | no fields: house, room, closet, shelf |
| Storage (`container`) | brand, model, serial ★: safe, toolbox, bin, bag, furniture |
| Boat (`container`) | manufacturer, model, year, length (ft), engine, hull number ★, registration number ★ |
| Vehicle (`container`) | make, model, year, VIN ★, plate ★, mileage |
| Firearm | manufacturer, model, kind (handgun/rifle/shotgun/other), caliber/gauge, action, serial ★ |
| Tool | brand, model, power (corded/battery/manual/gas), serial ★ |
| Electronics | brand, model, serial ★ |
| Keyboard | brand, model, layout, switches, keycaps, connection |
| Appliance | brand, model, serial ★ |
| Camera | brand, model, serial ★ |
| General | no fields |

All other starter types are `item`.

## Deterministic search, no AI

The search box parses tokens and passes the rest through as text over name, notes,
tags and attribute values:
- `type:firearm`, `tag:fishing`, `in:garage` (any ancestor, through locations and containers)
- `before:2020` / `after:2023-06` (acquired)
- `expiring:90d` / `due:30d`
- `missing:photo|id-plate|receipt|serial|value`
- `has:document`

Facets: type, tag, where (the containment tree), acquired year, expiring and due buckets, "missing",
has photos or documents, value band. Everything is household-scoped, and search input is
escaped (the ReDoS rule).

## Screens (GeekSuite design language)

- **Library:** photo cards (type icon, name, where it is, tags) plus a list view, the facet
  panel and sheet, chips, sort (name, acquired, value, recently added, next due), and saved
  views.
- **Thing page:**
  - a photo gallery at the top with role badges;
  - core fields;
  - type attributes, where **identifier fields are masked with a tap-to-reveal** (so a
    serial isn't on screen for anyone looking over your shoulder);
  - a dates timeline;
  - **where it is** as a breadcrumb (House › Garage › Van), with a **Move to…** action;
  - **Contains** (for locations and containers): what's inside, with add-here;
  - accessories as sentences;
  - documents with preview and download;
  - notes.
- **Add a thing (phone-first):** photo first (camera capture), then type, name and where it is (locations and containers only),
  then save. Details can be added later.
- **Needs attention:** expiring or due soon, missing ID-plate photo, missing receipt,
  empty identifier fields, missing value.
- **Where:** the whole containment tree (locations and containers, expandable to items),
  with move and add-here. It replaces the Places page.
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
  `find_by_tag`, `find_in`, `find_expiring`, `find_related`, `find_missing`,
  `search_text`); the server runs it; the model answers from 5–20 **redacted** things with
  citations.
- The MCP tools through basegeek's `/mcp` (`DOCS/MCP_PLAN.md`), built together with Chef.
- A PDF insurance report with embedded photos.
