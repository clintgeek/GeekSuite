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

*As built (2026-10-01, "Storage Yard" — first shipped the same day as "Moving Day",
replacing "Label Maker". Chef: "U-Haul … have fun with the UI design and commit to the
theme"; then "orange/cardboard/black", "dusty trucks and dark storage rooms"; then, of
Moving Day: "leaned way too hard into the moving aesthetic. I was looking for more just
U-Haul inspired storage and rental than actual literal prep for moving workflow."):*
- **Identity:** the household's stuff kept like a self-storage and truck-rental yard —
  storage and rental, NOT moving day: no packing workflow, no box markings, no "load the
  truck" copy anywhere. The FEEL of one, never a brand: no company names, logos or
  lettering anywhere. Palette is orange + cardboard + black: black livery chrome in both
  modes (top bar, tab bar, sidebar, the detail action bar — they render under a nested
  chrome theme, `components/Chrome.jsx`), kraft desk and bin faces with a faint dust/scuff
  texture (measured under text), yard orange `#F26B1D` for stripes, doors and the Add
  button (always black lettering; the token is `HERO` / `palette.hero`), burnt orange
  `#A9420A` only under white (a unit tag's colour strip), white only for printed matter
  (tags, forms, dialogs). Night is the dim corridor: charcoal, darker kraft, the same
  orange, a warm bulb. Zilla Slab 700 (+ italic for fleet lettering) headings, Public Sans
  body, Allerta Stencil for yard stencils only (unit numbers, WHERE / LOCATION captions),
  mono identifiers; Barlow Condensed is kept only for the printed QR labels' names (their
  fit math). Tokens and the rationale: `theme/theme.js`; every pair measured in
  `__tests__/theme/storageYardContrast.test.js`.
- **Motifs** (all real text, decoration aria-hidden): unit tags for place names
  (`UnitTag`: white stock, a plain burnt-orange strip — no ROOM / BOX / TO captions; a
  caption only when asked for, e.g. "FOR RENT" — slab name; crumbs are `LabelCrumbs`); a
  plain storage-bin plate for things without a photo (`ThingPhoto`'s `TypePlate`:
  hand-hold, type glyph, a slim orange stripe — no size or care stamps); livery stripes on
  the bars and heroes; storage units with roll-up doors (`StorageUnit`: unit numbers from
  the name, the door rolls up ~320 ms onto a dim room under a bulb, reduced motion opens it
  at once; `MiniDoor` for toggles and empty states); truck-side murals for places as fleet
  livery (`TruckMural`, keyword motif + per-name sky, `utils/mural.js`).
- **Phone navigation:** Things · Where · **Add** (the add screen; a big orange tile
  standing proud of the bar) · Attention (count) · More. Desktop keeps the sidebar (black,
  an orange rule on the current row) and an "Add a thing" button.
- **Library:** the dense list (bin thumb, name, type, a unit tag with the last crumb, a
  red/amber marker light); the grid is bins on pallets. First run is "YOUR STORAGE —
  Everything you own, in one place.", a short row of roll-up doors (one up onto a lit
  unit), the steps on numbered unit plates and "Add your first thing"; with rooms set up
  and nothing in them (Chef's shape) each room is a unit (a small door + its tag) that
  opens Walk the room.
- **Where = the storage yard:** the phone drill-down is an aisle of unit doors; a level
  opens with its mural and its door rolling up onto the contents. The desk tree keeps its
  grid; each row's toggle is a little door that rolls up onto an interior panel.
- **Needs attention = the rental counter's dashboard:** warning lights (Overdue red, Due
  soon amber), a RECORD CHECK gauge (photo, receipt and value on file over three checks per
  inventory thing — from the counts the page already fetches; ID plate and serial stay on
  the list, not the gauge, because their denominators aren't known here), "Getting
  started" (the first-run checklist on a clipboard) and "Record check" (the gaps, each a
  door into the filtered library).
- **Add:** the photo slot is an open unit (steel frame, the door pulled up into its
  housing); same fast flow. **Walk the room** keeps its name and route (`/walk`).
  **Insurance** on screen is a clean inventory form (ruled fields, numbered lines, an
  odometer reel for the total); the printout is unchanged. **Labels** print as storage
  labels (heavy frame; Large adds CONTENTS / LOCATION captions), still black on white.
  **Trash** is plain.
- **Thing page:** a full page on every size; a place with no photo leads with its mural
  (which carries the h1); the black action bar.

## Files

- **Photos:** jpeg, png and webp are accepted; HEIC is stored and converted where sharp
  can manage it, otherwise shown as a generic tile.
- **Documents:** pdf, images and txt.
- **Limits:** 25 MB per file; the nginx `client_max_body_size` is 30m.
- **Checks:** magic bytes verified, sha256 dedupe.
- **Thumbnails:** 480 px webp.
- **Serving:** only with auth plus household plus member, `Cache-Control: private`. *(The Attic's files are different: sealed at rest, served `no-store` behind the vault — "The Attic" below.)*
  Nothing is hot-linked.

## The Attic (family documents, built 2026-10-02)

*Chef's decisions (2026-10-02): the name, members only (Heather sees everything, the kids'
accounts nothing), passkey + PIN unlock enforced server-side, AES-256-GCM at rest for every file
and identifier, an audit log, expiry warnings in Needs attention. Later phases, not built: the
Go-box emergency PDF, an in-app QR scanner, OCR — the seams are noted below.*

The household's **locked, climate-controlled unit**: passports, driver's licenses, birth
certificates, Social Security cards, vaccination records, medical / insurance cards, insurance
policies, vehicle registrations and titles, deeds, wills, powers of attorney, tax returns, pet
records. In the Storage Yard look it is the one unit with a **brushed steel swing door and the
yard's orange padlock** (`STEEL` / `PADLOCK` in `theme/theme.js`); unlocked, the door stands open
on the lit interior (the dim room under the bulb, a shelf of document boxes).

### Who

- Household members only — the existing member gate (`@geeksuite/schemas/thinggeek/household`)
  in the gateway AND the backend. The kids' accounts get NOT_A_MEMBER from everything, the
  locked-visible answers included. Tested both sides (`thinggeekAttic.test.js`,
  `backend/test/attic-*.test.js`).
- **Each member has their own lock** (passkeys + PIN); Heather sees every document once she has
  unlocked with hers. A member's vault session is useless to another member.

### Model (`@geeksuite/schemas/thinggeek/attic` + `atticModels`)

| Collection | Holds | Written by |
|---|---|---|
| `attic_people` | name, relation, birth date, `photoFileId` (seam: no UI yet) | gateway |
| `attic_doctypes` | household-editable types: fields (`identifier`, `strict`, `required`), `issuedLabel`, `expiryLabel`, `expiryWarnDays`; 15 starters, seeded on the first list | gateway |
| `attic_documents` | `typeId`, `personIds[]`, `title`, plain `fields`, **`secrets` (sealed identifiers)**, `issued`, `expires`, `files[] {fileId, side: front\|back\|page, caption}`, `links[] {thingId}`, `notes`, `deletedAt` | gateway (metadata, plain fields, file order/captions, links); backend (`secrets`, file pushes) |
| `attic_files` | one sealed file each: `documentId`, `mime`, `size`, `path`, `keyVersion` — **no sha256, no filename** | backend |
| `attic_vault_credentials` | per user: PIN hash + backoff state, passkeys, the pending WebAuthn challenge | backend |
| `attic_vault_sessions` | sha256 of the session token, user, method, `lastSeenAt`, `expiresAt` (TTL index) | backend creates; gateway touches |
| `attic_audit` | who / when / action / document / file / field KEY / unlock method — never a value | both |

Starter warning windows: **passport 270 days** (many countries refuse entry with < 6 months
left), **driver's license 60**, **insurance policy 30 before the renewal date** (its date is
labelled "Renews"), **vehicle registration 30**, **pet rabies certificate 30**, medical card 30,
Other 30; birth certificate, Social Security card, title, deed, will, POA, tax return and
vaccination record have no expiry. All tunable per type (`/attic/types`).

Identifier (★) fields: passport, license, birth-certificate and title numbers, VIN, plate,
registration number, parcel number, member ID, group number, policy number — and the **Social
Security number, `strict`: masked hardest** (no partial digits anywhere, no Copy, a reveal hides
itself after 15 s). An existing field can never flip between plain and identifier (it would
strand its values on the wrong side of the seal).

Links both ways: a document's `links` name things (a title → the Van, a policy → what it
covers). A thing's page shows **"2 documents in the Attic — unlock to view"** while locked and the
documents' titles (linked) once unlocked (`Thing.attic`).

### Crypto

- **Where the key lives:** ONLY the thinggeek backend container (`THINGGEEK_VAULT_KEY`, 32 bytes
  base64). The basegeek gateway holds **no key** and never sees a plaintext identifier: it stores
  metadata, refuses identifier keys in `fields` (BAD_USER_INPUT), and returns only `hasValue`.
  Why one place: basegeek is the suite's widest surface (every app, MCP, aiGeek); keeping the
  decrypt capability out of it means no gateway bug, AI tool or MCP call can ever produce a
  passport number, and the "never to AI" rule holds by construction.
- **Algorithm:** AES-256-GCM (`backend/src/lib/atticCrypto.js`). A fresh random 96-bit IV per
  sealed item; the 128-bit tag stored with it. **Additional authenticated data** binds each item
  to its place: `thinggeek-attic|field|<household>|<document>|<fieldKey>` and
  `thinggeek-attic|file|<household>|<fileId>` — a ciphertext copied onto another document, field,
  file or household fails to open.
- **Subkeys:** HKDF-SHA256 from the master key, one per purpose (AES; the PIN pepper).
- **Formats:** a field is `{ v, iv, tag, ct }` (base64; `v` = key version). A file on disk is
  self-describing: `TGA1 | key version (u16) | IV | tag | ciphertext`, under
  `apps/thinggeek/data/files/<household>/attic/<yyyy>/<mm>/<fileId>.enc`.
- **Plaintext never touches the disk:** uploads (≤ 25 MB) are sealed in memory. JPEG/PNG/WebP are
  re-encoded first with the orientation baked in and **all metadata dropped** (EXIF GPS); HEIC and
  PDF are kept as uploaded. The phone's crop/rotate step (a canvas) also drops metadata.
- **No thumbnails** for the Attic: fewer copies of a passport scan; the list shows type glyphs and
  only a document's page loads its images.
- **No dedupe:** no plaintext digest is stored (it would be an oracle — "is this the scan I
  have?" — across households or within one). Each upload is its own sealed object owned by one
  document; same bytes twice → two different ciphertexts.
- **Key versioning:** `THINGGEEK_VAULT_KEY_VERSION` (default 1) names the current key;
  `THINGGEEK_VAULT_KEYS_RETIRED="1:<base64>,…"` keeps old keys decrypt-only during a rotation.
  New seals always use the current version. (Re-sealing old items is a script still to write —
  RUNBOOK "The Attic's key".)
- **No key → no Attic:** a missing or malformed key makes every `/api/attic` route answer
  **503 ATTIC_UNAVAILABLE** (logged at boot, never the key). There is no plaintext fallback. The
  rest of ThingGeek keeps working.
- **Key lost = the Attic's documents are unrecoverable.** Keep a copy in Bitwarden.

### Unlock

- **Passkey** (WebAuthn via `@simplewebauthn/server` + `/browser`): RP ID
  `thinggeek.clintgeek.com` (`ATTIC_RP_ID` / `ATTIC_ORIGINS` override for dev), **user
  verification required** (fingerprint / face), no attestation. Challenges are one-use and expire
  in 5 minutes; a credential is looked up only among THIS user's passkeys; the counter is kept.
- **PIN** fallback: 6–12 digits, not one repeated digit or a straight run. Stored as
  **bcrypt(HMAC-SHA256(pepper, PIN))**, the pepper derived from the vault key — a database dump
  alone cannot brute-force a 6-digit PIN. **Backoff:** 4 free consecutive failures, then the PIN
  pauses 30 s, doubling per failure to 1 h; a success (PIN or passkey) resets it. Every attempt
  first claims the gate atomically, so parallel guesses can't race it (one checked, the rest 429).
- **Set-up** (first visit): add a fingerprint (skippable where a browser can't), then a backup PIN
  (required). It is trust-on-first-use behind the SSO session and the member gate: while a member
  has no credential at all, the first one may be enrolled locked. After that, adding or changing a
  credential needs an unlocked vault.
- **The vault session:** 32 random bytes in an **HttpOnly, Secure, SameSite=Strict, host-only**
  cookie `thinggeek_vault` on thinggeek.clintgeek.com (it reaches the backend at `/api` and the
  gateway at `/graphql`, which thinggeek's nginx vhost proxies). Only its sha256 is stored, bound
  to the user and household. **10 minutes idle** (any Attic request is activity; the page pings
  at most every 30 s while someone is using it) and **60 minutes absolute**. Lock deletes it at
  once; the page also locks itself at the server's idle deadline, and on any VAULT_LOCKED answer.
  Browsing things never keeps it awake (`Thing.attic` only peeks).

### Visible locked vs unlocked

| | Locked | Unlocked |
|---|---|---|
| Needs attention | **person + document type + expiry date** of documents inside their warning window (the page says so) | same |
| A thing's page | the count of linked documents | their titles, linked |
| The Attic | the steel door | people, documents, plain fields, notes, images (on request), "Recent access" |
| Identifier values | never | one at a time, on Reveal, audit-logged (never in Apollo, storage or a log) |

Everything else answers **VAULT_LOCKED** (gateway) / **423** (backend).

### No caching, anywhere

Every `/api/attic` answer — errors included — is `Cache-Control: no-store` (+ `Pragma:
no-cache`, `nosniff`). The service worker's FIRST route is `/api/attic` → NetworkOnly
(`frontend/pwa/runtimeCaching.js`; an Attic `<img>` has destination "image" and would otherwise
fall into the asset cache), unit-tested (`__tests__/pwa/runtimeCaching.test.js`) and checked on
the built `sw.js` by `tools/pwa-audit.mjs` (`NEVER_CACHED`). Locking evicts the Attic's answers
from Apollo's cache.

### Audit ("Recent access")

Written for: unlock (method) and failed unlock, lock, opening a document (once per 2 min per
user), revealing a field (its key), viewing or downloading an image, uploads, identifier writes,
document create/edit/delete, PIN set, passkey added/removed. Shown on the Attic's home as
sentences ("heather revealed Passport number on Passport · Clint · 4 min ago"); values never.
A reveal whose audit row can't be written fails (fail closed).

### Threat model, in plain words

- **A stolen database dump or backup of `thinggeek`** (without the env files): passport numbers,
  card images and the like are ciphertext; PIN hashes can't be brute-forced without the pepper.
  Names, titles, dates and notes are readable — **notes are not sealed** (the form says so).
- **Someone with Chef's or Heather's signed-in phone or laptop, or a stolen SSO cookie:** sees
  ThingGeek, but not inside the Attic without the fingerprint or the PIN (wrong PINs pause it).
  After 10 quiet minutes the Attic locks itself.
- **The kids' accounts:** nothing at all, locked or not.
- **A bug or a malicious prompt in basegeek / MCP / AI:** can't decrypt — the gateway has no key.
- **NOT protected against:** a compromised thinggeek container (it holds the key and the
  database); someone holding the backup age key (the nightly set carries the env files, key
  included, and the database dump); malware on an unlocked phone while the Attic is open; a
  first-run set-up by someone already holding a member's SSO session (trust on first use — set
  each member's lock up promptly).

### Screens

- **More / sidebar → The Attic** (`/attic`): the steel door while locked ("Unlock with
  fingerprint", "Use PIN"); first visit, the set-up steps; open, the lock bar ("Unlocked · locks
  in 9:41", Lock), the open door, documents **by person** or **by type**, People (add / edit),
  Your lock (fingerprints, Change PIN), Recent access, and a link to Document types.
- **Add a document** (`/attic/add`, phone-first): type chips → whose → photograph it (a card's
  FRONT then BACK, a passport's photo page, pages otherwise: camera via `<input capture>` or a
  file; then a crop sheet — rotate, and a card-shaped frame or the whole photo) → numbers (masked
  as typed, a show toggle; not password fields, so nothing offers to save them) → dates, plain
  fields, title, linked things, notes. Saving: the gateway stores the document, the backend seals
  the numbers, then each image is uploaded and sealed.
- **A document** (`/attic/doc/:id`): images (open, download, remove, add), numbers (masked, Reveal
  per field), details, linked things, notes, Edit, Delete (no Trash: gone from every view at once,
  sealed bytes purged within the hour by the backend's daily purge).
- **Document types** (`/attic/types`): rename, set the expiry label and warning window, add fields.
- **Needs attention**: an "The Attic" panel under the due lists.

### Later phases (not built) — seams

- **Go-box emergency PDF:** the backend already decrypts per document; a `POST
  /api/attic/go-box` (vault-gated, audit "download") would assemble it server-side.
- **In-app QR scanner** and **OCR:** would run client-side on the capture step (`CardCapture.jsx`)
  before upload; OCR results must land in the identifier inputs (sealed), never in notes.
- **Person photos:** `attic_people.photoFileId` exists; the upload route would mirror the document
  one.
- **Rotation script:** re-seal fields and files whose `keyVersion` is old.

## Phase 2 (not tonight)

- **AI Ask (`??`):** the model plans a structured query from primitives (`find_by_type`,
  `find_by_tag`, `find_in`, `find_expiring`, `find_related`, `find_missing`,
  `search_text`); the server runs it; the model answers from 5–20 **redacted** things with
  citations.
- The MCP tools through basegeek's `/mcp` (`DOCS/MCP_PLAN.md`), built together with Chef.
- A PDF insurance report with embedded photos.
