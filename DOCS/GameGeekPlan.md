# GameGeek — Plan

*Written 2026-09-24, revised the same day after Chef's calls. Status: **proposal, nothing
built.** This isn't a spec yet. The open questions in §13 decide what the spec says.*

**Decided (2026-09-24):**
- **Video games only.** No board games, no BGG. The model doesn't carry board facets
  "just in case".
- **AI on free models.** Free walk, `allowPaid: false`. Not paid-first like
  NoteGeek/FitnessGeek.
- **BookGeek prep comes first, and it's small** (§1.1). GameGeek is built on pieces
  extracted from BookGeek, with BookGeek migrated onto them in the same cut. It is not a
  copy of BookGeek.

**Built 2026-09-24 (overnight, G0 + most of G1, plus sessions/playthroughs/Steam import):** see
§14 for what shipped, and where it deviates from this plan.

GameGeek is the household's video game library. It tracks what we own and on what
platform, what's in the backlog, what we're playing, what we finished and how long it
took, and what to play tonight given the time we actually have. It's BookGeek's sibling in
scope and shape. Where BookGeek got it right GameGeek reuses it, and where BookGeek learned
the hard way GameGeek does better.

The only footprint GameGeek has in the repo today is the reserved `'gamegeek'` slot in
basegeek's `VALID_APPS` (`apps/basegeek/packages/api/src/config/validApps.js`).

---

## 1. What BookGeek is, briefly (the template)

| Aspect | BookGeek today |
|---|---|
| Shape | `api/` (Express REST, :1800) + `web/` (Vite/React 18/MUI 5/Apollo), one container serving both |
| Data | `Book` (household-shared, **no owner field**), `Profile` (per-user: custom shelves, saved filters, Kindle bits) |
| Two backends | CRUD, list, shelves, profile and AI go through **basegeek's GraphQL gateway** (`graphql/bookgeek/`). Bytes and long jobs (covers, ebook files, Calibre/Goodreads import, Kindle) go through **bookgeek's own REST API** |
| The tripwire | Both backends define a Mongoose `Book` against the same collection, kept identical **by hand** |
| Shelves | Free-string `shelf`: built-ins plus user `custom-<slug>`; counts via aggregation |
| UI | `GeekShell` with a sidebar (rail on desktop, drawer on phone), `ShelfStrip`, `LibraryToolbar`, grid/list toggle, infinite scroll, `FilterSheet`, detail sheet/dialog, `GeekFab` "Add" |
| Navigation | No router. `activeView` state plus `navConfig.jsx` as the single source of truth |
| AI | `whatNext` and `draftBookMetadata` through `aiFeatureRunner`: the server computes the candidates and the model only ranks them; deterministic fallback; opt-in; 20/day cap; provenance |
| Metadata | OpenLibrary + Google Books; `coverFetch.js` host allow-list with per-hop redirect validation (closed an SSRF) |
| PWA | Hand-rolled `sw.js` + `swPrecache()` build-hash plugin |
| Tests | `node:test` API (11 files), Vitest web, gateway tests in basegeek, 9 harness scenes under `--enforce-a11y` |
| Gaps | No scan-to-add, no stats, no goals, no per-user reading state |

### 1.1 Does BookGeek need cleanup first? Verified 2026-09-24

**Short answer: a little, and only the parts GameGeek touches.** GameGeek is built on
extracted pieces, not copied from BookGeek, so BookGeek's debt only matters where it would
leak into the extraction.

| Item | Verified state | Blocks GameGeek? | Verdict |
|---|---|---|---|
| Four dead sorts (`pageCount`, `publishedDate`, `owned`, …) | **Already fixed** in `f7ccbfec`, with `bookgeekLibrarySorts.test.js`. `apps/bookgeek/DOCS/CONTEXT.md` still describes it as open | No | Fix the stale doc line |
| Dead REST CRUD: `GET/POST /api/books`, `GET/PATCH/DELETE /api/books/:id`, `GET /api/shelves` (`server.js:770–1555`) | Still mounted. **Zero callers in `web/src`** | No | Delete. Cheap, ~500 fewer lines in a 2,902-line file, and one less "which backend owns this" question |
| `/kindle-test*` routes (`server.js:2773+`) | Still mounted, marked throwaway | No | Delete with the above |
| Dead models `IngestionJob`, `Recommendation` | Unreferenced outside `src/models/` | No | Delete |
| `CONTEXT.md` tech-stack paragraph says Bun/Tailwind/shadcn | Wrong (it's Node/MUI) | No, but GameGeek's docs will be modeled on it | Fix |
| Hand-duplicated `Book` model in bookgeek api + gateway | Still duplicated | No. GameGeek uses `@geeksuite/schemas` from day one | **Later, separate cut.** Moving BookGeek to `@geeksuite/schemas/bookgeek` is worth doing but not a prerequisite |
| `App.jsx` at 2,730 lines | Still a God component | **No.** The pieces we extract (`ShelfStrip`, `LibraryToolbar`, `FilterSheet`, `StarRating`, `BookCard`/`BookRow`) are already separate files under `web/src/components/` | **Don't refactor it now.** It's a big, risky job on a working app for zero GameGeek benefit. GameGeek simply doesn't repeat it |
| Library components know about books | They do: props, labels, shelf ids | **Yes.** This is the real prep | **Extract + migrate** (below) |

**The real prep is the extraction itself** (full list in §8.2). The first version of this
plan said "extract for GameGeek, migrate BookGeek later". That's wrong, because for a while
it leaves two copies of every component, which is the same drift disease as the duplicated
model. Revised approach:

> Each piece is extracted into `@geeksuite/collection` **and BookGeek switches to it in the
> same commit**, verified against BookGeek's existing tests and harness scenes. BookGeek is
> the first consumer, and its test suite is the extraction's safety net. GameGeek becomes
> the second consumer.

**Prep phase P0** (before G0, roughly a day of work, one commit per step, each verified in
the real app):
1. Deletion pass: dead REST CRUD, `/kindle-test*`, dead models, and their tests if any.
   Confirm the harness and web tests still pass and that BookGeek works on the phone.
2. Fix `CONTEXT.md` (stack paragraph, sort status).
3. Extract the server helpers (`coverFetch` with a caller-supplied allow-list,
   `buildSearchFilter`, shelf-count/clear helpers) and point bookgeek's api + gateway at them.
4. Extract the UI pieces one at a time (§8.2) and point BookGeek at each.

Steps 1–2 are independent of GameGeek and worth doing regardless. Steps 3–4 are
GameGeek-driven.

---

## 2. Product scope

### 2.1 Ownership vs. personal state (a deliberate break from BookGeek)

BookGeek puts rating, shelf and progress on one shared `Book`. For games that's wrong. One
of us finished *Hades*, the other bounced off it, but the Switch cartridge belongs to the
house. So:

- **`Game`** is household-shared: the catalog entry and owned copies (platform, format,
  storefront).
- **`GamePlayer`** is per-user: shelf/status, rating, review, progress, hours, playthroughs,
  and sessions.

The library view merges `Game` with *my* `GamePlayer` row. The detail sheet has a small
"Household" block showing who else has it on which shelf. If it turns out only Chef ever
uses GameGeek, the split costs almost nothing, since it's one extra lookup. Adding it later
would mean a data migration.

### 2.1a Tenancy: "household" means a real tenant, not "everyone who can log in"

*Added 2026-09-24. Chef wants GeekSuite to become truly multi-tenant eventually.*

**Today** "household" is implicit. BookGeek's `Book` has no owner, and its resolvers only
check `requireUser`, so the household is *every account in userGeek*. With two users that's
fine. But basegeek's `POST /api/auth/register` is **public** (rate-limited, not gated), so
today anyone who signs up can read, edit and delete the whole BookGeek library. That's a
suite-level issue, not a GameGeek one (see §13).

**GameGeek is the first app built tenant-aware from day one**, so it never needs the
migration BookGeek will:

- Every shared document carries **`householdId`** (`Game`), and every per-user one carries
  `userId` + `householdId` (`GamePlayer`, `Profile`).
- **Every resolver scopes by the caller's household** through one helper,
  `requireHousehold(user) → householdId`, the same shape as `requireUser`. No query is built
  without it, following the flockgeek "never an unscoped filter" rule.
- "Household" views (who else has it, Stats across the household) read `GamePlayer` rows
  **within the household** only.
- Metadata caches (IGDB responses, cover files) are keyed by provider id, not by household,
  and can be shared across tenants because they contain no user data. Cover *uploads* are
  per-household.

**Where the household comes from.** The suite has no household concept yet. FitnessGeek has
an app-local one (`UserSettings.household.household_id`, joined by a 12-hex-char code that
never expires). That's the wrong place for a suite-wide tenant. The proposed suite design
(its own project, not GameGeek's):

- A `households` collection in `userGeek` (basegeek) with `{ _id, name, ownerId, members[] }`,
  and `user.householdId` on each user.
- Invites are **expiring, single-use codes** approved by a member, not a permanent join code.
- basegeek resolves `householdId` server-side per request (cached briefly, like session
  validation), **not** from a JWT claim, so leaving a household takes effect immediately
  instead of at token expiry.
- Migration for today: create one household, put both users in it, and backfill
  `householdId` on BookGeek's books. FitnessGeek's household becomes a thin layer over the
  suite household, and its per-feature sharing flags stay app-level.

**Until the suite household exists**, GameGeek's `requireHousehold` falls back to a single
default household id from config (`GAMEGEEK_DEFAULT_HOUSEHOLD`), so G0–G4 aren't blocked.
The data is already tenant-shaped, and switching to the real resolver is a one-function
change plus a cross-household ownership test that must go red first.

### 2.2 Feature list by priority

**P0 (MVP, BookGeek parity)**
- Library grid/list with shelves, search, sort, filter, saved filters, and custom shelves
- Add a game: IGDB search → pick → prefilled; manual entry as fallback
- Game detail: hero, metadata, my status/rating/progress/hours, copies (platform + format),
  notes
- Rating with optimistic update + Undo (the extracted `useOptimisticRating`)
- Cover: IGDB art cached locally, search alternates, upload your own
- CSV export

**P1 (what makes it GameGeek)**
- **Playthroughs**: started/finished, hours, platform, difficulty, completion level
  (story / story+extras / 100%). Replays are first-class
- **Log a session**: "played 1.5h tonight" in two taps. It bumps hours and `lastPlayedAt`.
  This is the manual equivalent of Steam's playtime for Switch/PlayStation/Xbox, which have
  no public API
- **Tonight**: "I have an hour, on the Deck, want something chill" → a deterministic
  filtered pick from what I own, with optional AI ranking (§6)
- **Journal**: a feed of sessions, starts, finishes, and abandons
- **Stats view** (§5.6), which BookGeek never got
- **Imports**: Steam (library + playtime) and generic CSV (covers HLTB/Backloggd/Grouvee/spreadsheet exports via column mapping)

**P2 (niceties)**
- **Backlog goal**: "finish 6 backlog games in 2026" with a burn-down
- **Wishlist** with a gift-idea flag
- **Loans** of physical copies ("lent *Mario Kart* to the neighbours")
- **Scan to add**: the UPC barcode on a physical box → title search prefill. Coverage is
  spotty, so it's a convenience, not the main path
- **AI metadata draft** for manual entries

**Explicitly out of scope**: board games, price/deal tracking, achievements sync,
PSN/Xbox/Nintendo account sync (no public APIs; unofficial ones break and need account
credentials), HowLongToBeat scraping, social features beyond the household.

---

## 3. Data model

One definition in `@geeksuite/schemas/gamegeek/*` (§4.1). Field names mirror BookGeek
where the concept is the same, so the extracted components take either.

```js
// Game — household catalog entry. Collection: gamegeek.games
{
  householdId: ObjectId,                  // required — the tenant (§2.1a)
  title: String,                          // required
  sortTitle: String,                      // "Legend of Zelda, The" — computed on write
  parentId: ObjectId|null,                // DLC / expansion → base game
  series: { name, index },                // same shape as Book.series
  developers: [String], publishers: [String],
  releaseDate: Date,                      // calendar date → UTC midnight
  description: String,
  genres: [String], themes: [String],     // provider vocab (IGDB genres/themes)
  tags: [String],                         // ours
  modes: [String],                        // 'single' | 'coop-local' | 'coop-online' | 'pvp-local' | 'pvp-online'
  maxLocalPlayers: Number,                // couch co-op filter
  platformsAvailable: [String],           // what exists; ownership lives in copies[]
  timeToBeat: { main, extra, complete },  // hours, IGDB-sourced when present
  coverPath: String,                      // local cached file, never a remote URL
  externalIds: { igdb, steamAppId, rawg, upc: [String] },
  copies: [{ platform, format: 'physical'|'digital', storefront, acquiredAt, pricePaid, notes }],
  owned: Boolean,                         // derived from copies.length (fast filter)
  loan: { to, since, notes } | null,      // P2
  source: 'manual'|'igdb'|'steam-import'|'csv-import',
  timestamps: true,
}

// GamePlayer — my relationship with a game. Unique (userId, gameId). Collection: gamegeek.gameplayers
{
  userId, householdId, gameId,
  shelf: String,               // backlog | playing | finished | on-hold | abandoned | wishlist | custom-<slug>
  rating: Number,              // 0–5, halves allowed
  review: String, notes: String,
  progress: Number,            // 0–100, optional
  hoursPlayed: Number,
  hoursSource: 'manual'|'steam',
  playthroughs: [{ startedAt, finishedAt, hours, platform, difficulty,
                   completion: 'story'|'extra'|'complete', notes }],
  sessions: [{ playedOn, minutes, platform, note }],   // capped; older rolled into hoursPlayed
  favorite: Boolean,
  lastPlayedAt: Date,          // instant; denormalized for sorting
}

// Profile — per-user, BookGeek's shape minus Kindle
{ userId, householdId, customShelves: [{id,label}], savedFilters: [...], steamId,
  defaultPlatform, platformsOwned: [String] }   // "my hardware" drives the Tonight filter
```

**Indexes** (every one leads with the tenant): `games {householdId, sortTitle}`,
`games {householdId, externalIds.igdb}` / `{householdId, externalIds.steamAppId}` (partial
unique; **not** globally unique, because two households can own the same game),
`gameplayers {userId, gameId}` unique, `gameplayers {householdId, gameId}`, `gameplayers {userId, shelf}`,
`gameplayers {userId, lastPlayedAt}`.

**Date rules** (THE_CONTEXT §3.1): `releaseDate`, `acquiredAt`, `startedAt`, `finishedAt`
and `playedOn` are calendar dates stored as UTC midnight through `@geeksuite/utils`.
`lastPlayedAt` and the timestamps are instants.

**Why sessions sit inside `GamePlayer`** and not in their own collection: they're only ever
read per game per user, and the Journal feed is a bounded per-user aggregate. If the feed
gets slow, they get promoted to a collection. The cap is 200 per row, and older sessions
roll up into `hoursPlayed`, which keeps each document small.

---

## 4. Architecture

### 4.1 Same split as BookGeek, one model definition

```
 gamegeek.clintgeek.com ──nginx──▶ gamegeek container (:1810)
     │                               ├─ serves web/dist (SPA + VitePWA sw)
     │                               └─ api/ Express: bytes & jobs only
     │                                    · IGDB search proxy (Twitch creds live here)
     │                                    · cover fetch/cache/upload
     │                                    · imports (Steam, CSV) + Steam hours sync
     │
     └── /graphql ──nginx──▶ basegeek :8987  graphql/gamegeek/{typeDefs,resolvers,assistant}.js
                                  · games, gamePlayer, sessions, profile, shelves, stats, journal
                                  · tonight / draftGameMetadata via aiFeatureRunner (free walk)

 Both import schemas from @geeksuite/schemas/gamegeek/*   ← single source, no drift tripwire
```

**Rules carried from BookGeek's scars**:
- The gateway owns every plain-data read and write **from day one**. The REST API never
  grows `GET /api/games`.
- Every sort in the UI has a resolver case plus an order-asserting test, the same shape as
  `bookgeekLibrarySorts.test.js`.
- User search goes through the shared `buildSearchFilter` escape (ReDoS).

### 4.2 Metadata providers

| Use | Provider | Notes |
|---|---|---|
| Search + metadata + covers | **IGDB** (Twitch client-credentials OAuth, free) | Best coverage. Platforms, modes, multiplayer counts, time-to-beat, `external_games` → Steam app id mapping. The app token is cached server-side and refreshed on expiry. Rate limit is 4 req/s, so queue. Env: `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` |
| Fallback search | RAWG (free non-commercial key) | Only if IGDB is down or thin. Optional, and can wait until it's needed |
| Library import | Steam Web API `GetOwnedGames` | Needs a key + a public-profile SteamID. Brings `playtime_forever`. Env: `STEAM_API_KEY` |
| Barcode (P2) | UPCitemdb free tier → IGDB title search | Only prefills search |

Credentials stay in `apps/gamegeek/.env.production`. `GET /api/metadata/search?q=`
normalizes providers into one `MetadataCandidate` shape.

### 4.3 Covers

- **Always cached locally** at `/data/covers/<gameId>.<ext>`, never hotlinked.
- The extracted `coverFetch` gets an allow-list for `images.igdb.com`,
  `cdn.akamai.steamstatic.com`/`shared.akamai.steamstatic.com`, and `media.rawg.io`.
- **Compose volume lesson** (BookGeek's covers lived inside the container until
  2026-09-05): `/data/covers` is bind-mounted from commit one, and boot-smoke asserts it's a
  real mount.
- Box art is a consistent ~3:4, which is simpler than books. Steam imports use the
  `library_600x900` portrait asset and fall back to the IGDB cover.

### 4.4 Ports, hostnames, containers

- Host port **1810** (free on the box 2026-09-24; sibling of BookGeek's 1800).
- The `https://gamegeek.clintgeek.com` vhost in `/mnt/Media/Docker/nginx` is modeled on
  bookgeek's. `/graphql` proxies to basegeek :8987, `client_max_body_size` is set for cover
  uploads, and it gets the security headers.
- The compose file includes `datageek_network`, a Watchtower label, a `/api/health`
  healthcheck, **`dns:` pinned** (Tailscale DNS landmine), and bind mounts for
  `/data/covers` and `/data/imports`.
- `node:20-slim` with no Calibre, so the image is much lighter than BookGeek's.
  `release.yml` auto-discovers it.

---

## 5. UI / UX

### 5.1 Identity: "Arcade Sticker"

*Revised 2026-09-26. The first identity, "Save Point" (slate surfaces, an amber-phosphor
accent, "not neon-gamer RGB"), looked too much like BookGeek. Chef reversed it: GameGeek is
loud and fun; BookGeek stays the reserved library.*

BookGeek is "Midnight Reader": navy slate, hairline borders, soft rounded cards, a serif
display face, a sky-blue accent. GameGeek is its opposite **in structure, not just colour**:
neo-brutalist arcade.

- **Ink outlines**: 2px on cards, pills, checkboxes, panels, the top bar and the drawer
  edge. In light mode the line is ink (#14111A); in dark mode it is lavender (#8E83B3).
- **Hard offset shadows**: no blur, ever (`hardShadow(x, colour)` in `theme.js`). A library
  card casts its own **pop colour**, keyed by a hash of the title (magenta, cyan, lime,
  violet, orange). Dark mode shows that colour at rest; light mode shows an ink shadow at
  rest and the colour on hover.
- **Lift and tilt**: on a real pointer, a card lifts and leans about 1° toward its own side.
  This only happens under `(hover: hover) and (prefers-reduced-motion: no-preference)`:
  there is no motion on touch, and none for anyone who asked for less.
- **Stickers**: shelves are filled stickers (fill, ink outline, ink shadow, rotated ±2°,
  and each shelf always leans the same way). Other stickers:
  - the selected sidebar row and the active shelf-strip chip (lime);
  - the active filter chips (cyan);
  - the selected select-chips (lime);
  - checked filter boxes (lime, with a hard shadow).
- **The arcade button**: every contained button has a loud fill, an ink label, an ink
  outline and a hard shadow that collapses as the button goes down (`translate(3px,3px)`).
  "Add game" and the FAB are magenta.
- **Type**:
  - **Bungee** (self-hosted `@fontsource/bungee`, a single 400 weight: never ask it for
    bold) sets the wordmark, h1–h3, the top-bar title, the filter headings, the cover
    plates, and the detail section labels.
  - Space Grotesk stays for h4–h6.
  - Roboto is the body face.
- **Wordmark**: an arcade marquee. It is an ink sign with a magenta frame and a hard cyan
  shadow, tilted −1.5°, with GAME in cream and GEEK in lime, and it looks the same in both
  modes. The pixel save-icon mark (now cyan, cream and magenta with an ink keyline) sits
  inside it.
- **Cover plates** (for games with no art): a flat loud ground with a fat stripe in a second
  colour and ink edges across the top, a halftone-dot corner, the platform on an ink banner,
  and the title in Bungee in ink. The title sits on its own patch of solid ground, so it
  never overlaps the stripe or the dots.
- **Empty states**: a tilted sticker frame with a magenta shadow, and an attract-mode tag
  ("PLAYER 1 · PRESS START_", "CONTINUE?_") whose cursor blinks. The blink stops under
  reduced motion.

```js
createGameTheme(mode) = createGeekSuiteTheme({ mode, accent: MAGENTA[mode], overrides: {
  palette: { border: line, shelf: SHELF_FILLS, arcade: ARCADE, star, … },
  typography: { h1..h3: Bungee 400, h4..h6: Space Grotesk 700 },
  components: { MuiCard, MuiButton, MuiDialog, MuiPopover, … hard shadows + 2px ink,
                MuiCssBaseline: the @geeksuite/collection skin (below) },
}})
```

**Palette**

| Token | Dark | Light |
|---|---|---|
| page / paper / card / raised | #0C0A12 / #17131F / #1D1829 / #262036 | #FFF1D0 / #FFFBF0 / #FFFDF7 / #FFF4DC |
| text / secondary / muted | #F6F1FF / #C9C0DD / #A89FC2 | #14111A / #3F3849 / #5A5266 |
| primary.main (as text) | magenta #FF3DA8 | deep magenta #B8005F |
| line (outline) | #8E83B3 | #14111A |
| stars | lime #D7FF3D | magenta #E0007A |

The arcade fills are the same in both modes: magenta #FF3DA8, cyan #22E4FF,
lime #D7FF3D, violet #B89CFF, orange #FF8A3D, coral #FF6B5A, mint #3DFFA0 and
yellow #FFE03D. Ink is #0C0A12.

**"Wild but readable": the contrast rules**

- The loud colours are fills with ink text on them, in both modes. Every fill clears 6:1
  against the ink; the lowest is magenta at 6.07:1. That is how the 12px filled-chip rule is
  met: the label is measured against the fill itself. `readableOn` only knows the surface
  under a chip, so it is the wrong tool here.
- In light mode no neon is ever text. On cream, magenta measures about 3:1 and lime and cyan
  about 1.1:1, so light mode's `primary.main` is deep magenta #B8005F: at least 5.7:1 on
  every cream surface, with a white label when it is a fill. The loud colours appear there
  only as fills, outlines and graphics.
- Dark mode's magenta works as text on every dark surface: 4.83:1 on the raised surface
  (its lowest), 5.34:1 on the card,
  6.07:1 on the page.
- Any domain colour that is painted as text still goes through `readableOn` against its
  real surface.
- The mobile harness enforces all of this (`--enforce-a11y --desktop`).

**Shared UI without touching the package.** `@geeksuite/collection` (the filters, chips,
facet panel and sort) is shared with BookGeek and ThingGeek, so GameGeek re-skins it from
its own `MuiCssBaseline`, keyed off the package's data attributes (`data-facet-option`,
`data-facet`, `data-testid="active-chips"`, `data-testid="filter-panel"`,
`data-geek-fab`), and by pointing `palette.border` at the arcade line. Those selectors
exist only in GameGeek's stylesheet, so no package change is needed and the other apps
are unaffected.

### 5.2 Navigation

There are four real destinations, so GameGeek uses the suite's bottom-nav pattern
(fitnessgeek, notegeek, bujogeek, flockgeek):

- **Phone**: `GeekBottomNav` with **Library · Tonight · Journal · Stats**. The drawer holds
  shelves, saved filters, Settings, and Sign out.
- **Desktop**: persistent `GeekSidebar` with the same destinations plus shelves.
- **Real routes** (`react-router` 6): `/`, `/game/:id`, `/tonight`, `/journal`, `/stats`,
  `/settings`. Deep links give Glance and MCP a target.
- `navConfig.jsx` stays the single route → nav id → title map (BookGeek's good idea). No God
  component: each route owns its own state and queries.

### 5.3 Library (home)

```
┌ TopBar: ☰  GameGeek            🔍  [avatar] ┐
│ ShelfStrip: Playing 3 · Backlog 41 · Finished 88 · Wishlist 9 … │
│ ▸ "Up next" rail (AI opt-in; rules-based when off)              │
│ Toolbar: Sort ▾  Filter ⚙  ▦/☰                                  │
│ ┌────┐┌────┐┌────┐                                              │
│ │box ││box ││box │  card: title, platform glyphs, my hours,     │
│ └────┘└────┘└────┘        my rating, "lent" badge               │
│                                                     (＋) FAB    │
└ BottomNav: Library · Tonight · Journal · Stats ─────────────────┘
```

- **Filters** (FilterSheet): platform (owned copies, or "on my hardware"), physical/digital,
  genre/tag, modes (couch co-op for N), time-to-beat under X hours, never started, "not
  touched in a year", and owned/wishlist/lent.
- **Sorts**: title, date added, release date, my rating, last played, hours played,
  time-to-beat, and days in backlog. Each one gets a resolver case and a test.
- **Multi-select** (the extracted selection bar): bulk shelf move, bulk tag, and bulk
  "mark finished".

### 5.4 Game detail

This is BookGeek's detail pattern (a `GeekSheet` on phone, a dialog on desktop), **backed
by `/game/:id`** so back and share work.

- **Hero**: cover, title, year, developer, platform chips for owned copies.
- **Sticky actions**: `Status · Log session · Rate · ⋯`.
- **Sections**: my status + progress, hours (with source), playthroughs, recent sessions,
  copies, DLC (child games), metadata (modes, time-to-beat, genres), notes/review, and
  Household.
- **⋯ More**: edit metadata, refresh from IGDB, cover tools, merge duplicate, lend, delete.
- **"Finished it"** is a small ceremony: set the completion level, confirm the hours, and an
  optional one-line verdict. That closes the open playthrough and moves the game to
  `finished`. Toast with Undo.

### 5.5 Tonight (the flagship screen)

"What should I play right now?" is the question every backlog owner dodges.

- Inputs: **time available** (30m / 1h / 2h / Weekend), **where** (the platform chips from
  `platformsOwned`, remembering the last pick), **mood** (Chill / Focused / Intense, mapped to
  genre/theme sets in config, not AI), and optional toggles for couch co-op for N, "continue
  something", and "start something new".
- **Rules first**: a deterministic ranked list. Games already in progress get priority, and
  short `timeToBeat` beats long when time is short. It works with AI off.
- **AI on**: a top 3 with a one-line reason each sits above the list, labeled "AI-picked" (§6).
- **"Just pick"**: a random choice weighted by rating affinity and backlog age. Playful and
  fully offline.
- Picking a game offers "Start session", which sets it to `playing` and stamps
  `lastPlayedAt`.

### 5.6 Journal and Stats

- **Journal**: a reverse-chronological feed (sessions, starts, finishes, abandons) grouped by
  week. Filter by game or platform. This is where "what did I even play this year?" gets
  answered.
- **Stats** are gateway aggregations (`gameStats(year)`), not client page walks. Charts
  follow the suite dataviz rules, work in both themes, and read at 390px:
  - Tiles: owned, backlog size (with trend), finished this year, hours this year.
  - Backlog burn-down against the goal line.
  - Finished per month (bars) and hours by platform.
  - Completion rate (finished ÷ started) and the abandon rate, honestly shown.
  - Actual hours vs. IGDB time-to-beat for finished games ("you're a 1.3× player").
  - "Oldest in the pile", the backlog items by age. Gentle shaming.

### 5.7 Settings

One page, BookGeek-style: platforms owned, default platform, custom shelves, Steam ID +
"Sync hours now", CSV import/export, Library Assistant (AI) toggle, and AI status.

### 5.8 Mobile grammar and a11y (non-negotiable)

It must pass `tools/mobile-harness --enforce-a11y` locally before any UI push. Planned
scenes: `01-library`, `01b-library-list`, `02-drawer`, `03-detail`, `04-add-search`,
`05-log-session`, `06-finish`, `07-tonight`, `08-journal`, `09-stats`, `10-settings`,
`11-account-menu`.

---

## 6. AI features (basegeek `aiFeatureRunner`, free walk)

**Honest framing (2026-09-24):** AI is garnish in GameGeek, not a pillar. Tonight's rules
ranking does the real work; the model only picks 3 from a shortlist and writes a one-line
reason each. BookGeek's AI is the same shape: `whatNext` ranks owned-unread books and
`draftBookMetadata` fills blank descriptions/tags on imports. **G5 is cuttable.** If the
rules-based Tonight feels good after G4, GameGeek ships without AI and nobody misses it. AI
earns its way in only if the rules feel dumb in real use.

BookGeek's contract, unchanged: **the server computes the candidates and the model ranks or
explains within them** (ids validated, hallucinations rejected). A deterministic fallback
always exists, the feature is opt-in per user (`appPreferences.gamegeek.assistant`) and
enforced server-side, it returns provenance, and data minimization is documented per
feature.

| Feature | `need:` | Candidates (server) | Model does | Fallback | Data sent |
|---|---|---|---|---|---|
| `tonight(minutes, platform, mood, flags)` | `structured:fast` | owned games on that platform passing the hard filters, top 25 by rules score | picks 3, one-line reason each | the rules ranking itself | titles, genres/themes, timeToBeat, my hours, shelf, my ratings of up to 20 finished games. No reviews or notes |
| `draftGameMetadata(gameId)` | `structured:fast` | n/a | spoiler-free description + tags from the existing tag vocabulary + ≤2 new | tags used by the same developer's other games | title, platforms, IGDB summary if any |

**Free-model routing, as decided**:
- GameGeek's AI app config row is `tier: free`, `allowPaid: false`, with no
  `paidFirst`, no pinned `provider`/`model`. Callers send `need:` only.
- Both needs are `structured:fast`, the most widely served capability on the free pool.
  Free models are weaker, so the design leans on the guardrails, not the model. The model
  only ever picks from ids it was handed, the output schema is tiny, and a malformed answer
  quietly becomes the rules ranking. On free models, "AI off" and "AI failed" must look
  equally fine.
- The cap is 20 calls/user/day across both features. `tonight` caches its answer for the
  same inputs for 30 minutes, since people poke that screen repeatedly.
- Before shipping, **add both features to the aiGeek golden set**, so free-model quality is
  measured rather than assumed. That's the lesson from the weak-model fix.
- No vision features (the vision pool is OpenRouter-only and thin), so cover-photo
  identification is out.

---

## 7. Imports and sync

| Import | Path | Matching and dedupe |
|---|---|---|
| Steam library | `POST /api/import/steam` (background job with progress) | match `steamAppId`, then IGDB `external_games` lookup for metadata/cover. Creates a `steam`/`digital` copy. Hours → `hoursSource:'steam'`. Games with 0 minutes land in `backlog`, and >0 unfinished land in `on-hold` (with a review screen before commit) |
| Steam hours sync | manual "Sync now" in P1; a scheduled job is an open question (§13) | only touches `hoursSource:'steam'` rows, never manual hours |
| CSV | `POST /api/import/csv` with a column-mapping preview and saved presets (HLTB, Backloggd, generic) | IGDB match by title+year, with ambiguous rows resolved by the user. **Dry-run diff before any write** |
| CSV export | client-side, the extracted CSV walker | n/a |

**Import safety** (every item is a BookGeek P0/P1 finding, applied up front): no import is
destructive and none begins with `deleteMany`. Every route is authenticated and
CSRF-guarded. Imports are a dry run first with an explicit commit, and re-runs are
idempotent. Uploaded files are confined to `/data/imports`. SteamID and other inputs are
zod-validated before any fetch.

---

## 8. What's shared with BookGeek

### 8.1 Already shared (use as-is)

- `@geeksuite/ui`: shell, top bar, sidebar, bottom nav, frame, FAB, dialog/sheet, toasts,
  empty/error states, `LoginSplash`, `createGeekSuiteTheme`, `readableOn`
- `@geeksuite/auth`, `@geeksuite/api-client`, `@geeksuite/user` (client + `/server`),
  `@geeksuite/logger`, `@geeksuite/utils/dates`
- `@geeksuite/schemas`: the new `gamegeek/` namespace
- basegeek `aiFeatureRunner`, capability routing, Glance

### 8.2 Extract in prep phase P0: new `@geeksuite/collection`

Each item is extracted **and BookGeek is switched to it in the same commit** (§1.1).

| Piece | From BookGeek | Generalization |
|---|---|---|
| `coverFetch` (server) | `api/src/coverFetch.js` | caller-supplied host allow-list. SSRF hardening unchanged |
| `buildSearchFilter` (server) | escaped-regex search in gateway resolvers | `(q, fields)` |
| Shelf helpers (server) | gateway `shelves` aggregation, `removeBookShelf` | `shelfCounts(model, builtIns, match)`, `clearShelf(...)` |
| Profile subdocs | `customShelves`, `savedFilters` schema | exported schema fragments |
| `ShelfStrip` | `components/ShelfStrip.jsx` | items + counts props |
| `LibraryToolbar` + grid/list toggle | `components/LibraryToolbar.jsx` | sort options passed in (BookGeek's `librarySort.js` pattern stays app-side) |
| `FilterSheet` shell | `components/FilterSheet.jsx` | filter fields as children |
| `StarRating` + `useOptimisticRating` | `StarRating.jsx`, `utils/rateBook` | mutation passed in |
| `useInfiniteSentinel` | `LibraryView` | `(onMore, { guardRef })` |
| Selection bar | `LibraryView` | actions passed in |
| `CoverTools` | detail components | endpoints passed in |
| CSV export walker | `utils/exportBooksCsv.js` | column spec passed in |
| Cover card plate | `BookCard` | `aspect` prop |

**Not extracted**: `BookCard`/`BookRow` themselves (the card body is domain-specific; only
the plate is shared), anything Kindle/basket/reader, and `WhatNextShelf` (the AI rail
pattern is small enough to write per app).

### 8.3 Suite level

- **PWA**: GameGeek uses **VitePWA `generateSW`** (PWA_STANDARD's preferred flavour for new
  apps) and doesn't copy BookGeek's hand-rolled SW. That includes NetworkOnly for
  `/api/me`/`/api/auth/*`, the extension-404 SPA fallback, and the `cacheWillUpdate` html
  guard.
- **MUI dedupe**: the same Vite `dedupe` block as BookGeek from commit one.

### 8.4 Don't carry over

A God `App.jsx`, REST CRUD beside the gateway, a hand-duplicated model, dead models,
`AIGEEK_API_KEY`, and doc paragraphs that don't match the code.

### 8.5 Cross-app touch points (optional)

- **Glance**: games in StartGeek's cross-app search (`APP_FOR_TYPE: { game: 'gamegeek' }`).
- **MCP** (when basegeek `/mcp` lands): read-only `games.search`, `games.tonight`
  (rules-only, no aiGeek quota), and `journal.recent`.

---

## 9. Suite registration checklist

| # | Where | Change |
|---|---|---|
| 1 | `apps/gamegeek/{api,web}` | scaffold. The pnpm globs already match `apps/*/api` and `apps/*/web` |
| 2 | `packages/schemas/gamegeek/*` | schemas (§3) |
| 3 | `packages/collection/` | new package (§8.2), built in prep phase P0 |
| 4 | `apps/basegeek/.../graphql/gamegeek/` + `graphql/index.js` | gateway module |
| 5 | `apps/basegeek/.../config/validApps.js` | **already has `gamegeek`**. Also fix the stale duplicate list in the older `src/middleware/auth.js` (SSO_OVERVIEW) |
| 6 | `apps/basegeek/.../lib/corsOrigins.js` | add `https://gamegeek.clintgeek.com` |
| 7 | `apps/basegeek/.../services/appRegistrySeed.js` | a `DEFAULT_APPS` entry |
| 8 | basegeek AI app config | GameGeek row: `tier: free`, `allowPaid: false` (admin act) |
| 9 | `packages/ui/src/navigation/GeekAppSwitcher.jsx` | a `GEEKSUITE_APPS` entry (`GG`) |
| 10 | `apps/startgeek/src/config/apps.jsx` | **Chef's call**: the dock is curated to one row |
| 11 | `build.sh` | add to `APPS` |
| 12 | `.github/workflows/ci.yml` | `test-gamegeek`, `test-gamegeek-web`, a `build-frontends` entry, and a `test-collection` job for the new package |
| 13 | `tools/mobile-harness/lib/registry.mjs` + `apps/gamegeek/{scenes,fixtures}.mjs` | scenes (§5.8) |
| 14 | `/mnt/Media/Docker/nginx/` | vhost → :1810, `/graphql` → :8987, body limit. `nginx -t`, then `-s reload` |
| 15 | `apps/gamegeek/.env.production` | `JWT_SECRET` (shared), Mongo URI, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, `STEAM_API_KEY`. `.env.example` has names only |
| 16 | Glance resolvers | optional, G4 |
| 17 | Docs | `apps/gamegeek/DOCS/CONTEXT.md` (a dated decision log, BookGeek style, kept honest), plus the THE_CONTEXT port map, README, SUITE_TODO, and WORK_LOG |

**First deploy** (Watchtower landmine): Watchtower never creates a container and never picks
up new env vars. The first deploy is `docker compose up -d` in `apps/gamegeek/` once the
image is on GHCR, and so is every `.env.production` change.

---

## 10. Testing strategy

- **`@geeksuite/collection`**: unit tests for each extracted piece. **BookGeek's existing
  web tests and harness scenes must stay green through every extraction commit.** That's
  the extraction's real acceptance test.
- **Schemas**: tripwire tests (required fields, enums, indexes).
- **Gateway** (`__tests__/gamegeek*.test.js`): **tenancy first**: a second-household fixture
  in every ownership test, where household B can't read, count, search, edit or delete
  household A's games (including via Stats, Journal, shelf counts and AI candidate sets).
  Ownership: my `GamePlayer` only, household `Game` visible to members. validation, one order-asserting test per sort, shelf counts,
  stats aggregations on a fixture, and AI: hallucinated ids rejected, malformed free-model
  output → fallback, cap enforced, opt-out enforced server-side.
- **API** (`node:test`): coverFetch allow-list/redirects, IGDB/Steam normalizers against
  recorded fixtures (no live calls in CI), imports as dry-run diffs and idempotent re-runs,
  path confinement, SPA-fallback extension 404s.
- **Web** (Vitest + RTL): each route, Log session, Finish ceremony, the Tonight rules
  ranking (a pure, table-driven function), and the rating Undo.
- **Standing rule**: for every bug-fix test, revert the fix and watch it go red.

---

## 11. Phased delivery

Each phase ships and is verified in the real app, not just green in CI.

| Phase | Deliverable | Done when |
|---|---|---|
| **P0 BookGeek prep** | deletion pass, CONTEXT.md fixes, `@geeksuite/collection` extracted with BookGeek migrated onto it | BookGeek tests + harness green; Chef can't tell anything changed on the phone |
| **G0 Skeleton** | scaffold, schemas, empty gateway module, registration (§9 rows 1–15), SSO, empty Library, harness scenes 01/02/11 | `gamegeek.clintgeek.com` loads behind SSO, switcher links it, CI + harness green |
| **G1 Catalog** | IGDB search/add, detail, copies, shelves, search/sort/filter, cached covers, rating, CSV export | Chef adds 20 real games from a phone |
| **G2 Playing** | `GamePlayer` split, sessions, playthroughs, Finish ceremony, Journal | a week of real play is logged without friction |
| **G3 Imports** | Steam library + hours, CSV with presets and dry run | the real Steam library imports cleanly; a re-run makes zero duplicates |
| **G4 Tonight + Stats** | rules-based Tonight, "Just pick", Stats, Glance | "1h, on the Deck, chill" gives a sensible answer from the real library |
| **G5 AI** | `tonight` + `draftGameMetadata` on the free walk, golden-set entries, provenance labels | golden set passes on free models; AI off/failing looks just as good |
| **G6 Extras** | backlog goal, wishlist, loans, scan-to-add, MCP tools | per item |

---

## 12. Risks and landmines

- **IGDB access**: it needs a Twitch developer application, and the terms call for
  attribution. Set that up before G1.
- **Free-model quality**: mitigated by design (§6) and measured by the golden set. Don't let
  a weak answer through just because it parsed.
- **Extraction regressions in BookGeek**: one component per commit, BookGeek harness scenes
  after each, and deploy incrementally.
- **MUI dedupe / SW poisoning / `.gitignore *data*` / container DNS**: the known suite
  landmines, each handled in §4.4 and §8.3. Verify new files under `data`-named paths landed
  (`git show --stat`).
- **Steam profile privacy**: a private profile returns an empty library, not an error.
  Detect it and explain rather than importing zero games in silence.
- **Scope creep toward a Backloggd clone**: the household is the user.

---

## 13. Open questions for Chef

1. **Per-user state split** (§2.1): OK to differ from BookGeek here? (Recommended: yes.)
1a. **Close public registration now?** basegeek `/register` is open, and BookGeek is shared
   by every account, so any sign-up can edit or delete the library. Recommended: gate
   registration (invite code or an env flag) until suite households exist. Small basegeek
   change, separate from GameGeek.
1b. **Suite households as their own project** (§2.1a), to be specced before G5 or before a
   third user, whichever comes first.
2. **StartGeek dock**: does GameGeek earn a slot in the one-row dock?
3. **Steam hours**: manual sync only, or does GameGeek get the suite's first spoke-app
   scheduled job (nightly)?
4. **Prep phase scope**: do the deletion pass (§1.1 steps 1–2) now on its own, whether or
   not GameGeek starts soon?
5. **Port 1810 and the "Save Point" slate + amber identity**: fine? *(Identity answered
   2026-09-26: replaced by "Arcade Sticker", §5.1.)*

Once these are answered, the next step is turning §2–§7 into `apps/gamegeek/DOCS/SPEC.md`
(acceptance criteria per phase) and starting prep phase P0.

---

## 14. Build log — 2026-09-24 overnight

What shipped (commits `70ca9142`, `2108eddb`, `f1d4afb5` and the docs commit):

- **Gateway** `apps/basegeek/packages/api/src/graphql/gamegeek/`: the whole typeDefs
  contract, household-scoped. 61 tests (ownership incl. cross-household, one per sort,
  validation, sessions); cross-household tests confirmed red with the scope removed.
- **Schemas** `packages/schemas/gamegeek/`: one definition for both writers, plus
  `household.js` (`resolveHouseholdId`, always `'default'` until suite households exist;
  deliberately ignores any claim on `user`).
- **Backend** `apps/gamegeek/backend` (port 1810): SSO shell, covers, metadata search, Steam
  import with dry run, sample seed. 82 tests.
- **Frontend** `apps/gamegeek/frontend`: Library (shelves, search, sort, platform/owned
  filters, grid/list, infinite scroll), detail (status, progress, hours, rating with Undo,
  sessions, playthroughs, copies, notes, household, cover tools, edit, delete), Add (search,
  manual, paste a list), Settings (platforms, shelves, Steam import). 40 tests; mobile harness
  42 scenes, 0 violations with `--enforce-a11y`.

Deviations from the plan above, decided overnight:

| Plan said | Shipped | Why |
|---|---|---|
| `api/` + `web/` | `backend/` + `frontend/` | the bujogeek thin-backend shape; `tools/gql-arg-audit.mjs` and boot-smoke conventions |
| Prep phase P0 before G0 | P0 **not done**; GameGeek has its own library components | shipping overnight without touching BookGeek unsupervised. The extraction now consolidates **both** apps onto `@geeksuite/collection` in one pass (`DOCS/BOOKGEEK_PREP_PLAN.md`) |
| IGDB as primary provider | Steam store search (keyless) is live; IGDB activates when `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET` are set | no Twitch app exists yet — Chef must create one |
| `/mnt/extra_space` for data | `apps/gamegeek/data/{covers,imports}` | `/mnt/extra_space` is root-owned; DEPLOY.md's `apps/<app>/data/` convention |
| Bottom nav with 4 tabs | drawer + desktop rail, no bottom nav | only Library and Settings exist; no placeholder tabs |
| `GAMEGEEK_DEFAULT_HOUSEHOLD` env | constant `'default'` in `household.js` | it would have been a basegeek env var, which needs a `compose up -d` of basegeek |
| Detail over `GeekAppFrame` | `AppMain` replacement | GeekAppFrame keys its transition on the first path segment and unmounted the library under the sheet |

Storefronts: Steam is automatic (needs `STEAM_API_KEY`); GOG, Epic, Amazon are manual via
Paste a list for now; Amazon Luna no longer has owned games at all. Research and the next
step (a Heroic/Playnite file importer): `DOCS/GAMEGEEK_STOREFRONT_IMPORTS.md`.

Not built yet: Tonight, Journal, Stats, backlog goal, loans, scan-to-add, AI (G5 — cuttable),
Glance, MCP. The tenancy and registration-gate work is planned in
`DOCS/SUITE_HOUSEHOLDS_PLAN.md` and `DOCS/REGISTRATION_GATE_PLAN.md`.

Finding while seeding: userGeek has **four** accounts, not two. All of them are in GameGeek's
default household (and share BookGeek) until suite households exist.

**Removed 2026-09-25:** the Steam library import (`POST /api/import/steam`, `STEAM_API_KEY`,
`Profile.steamId`/`lastSteamSyncAt`) and Paste-a-list (`createGames`, the Add dialog's second
tab) — Chef: "Playnite is the only sane way to do imports and all I wish to support at this
time. I'm not going to build 8 API systems just to get game listings from GOG, Epic, Amazon,
etc. when Playnite already solved that." Steam stays as a metadata source (search, appdetails,
cover art); single "Add game" (search + manual) stays. See
`apps/gamegeek/DOCS/PLAYNITE_IMPORT.md`.
