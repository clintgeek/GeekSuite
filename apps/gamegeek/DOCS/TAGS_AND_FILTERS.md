# GameGeek — tags and the filter interface

*Written 2026-09-25. Status: building. Chef: "We need to find tags for these. We need a
beautiful interface to sort/filter by tag/genre/played/store/most things."*

## Where we start (measured 2026-09-25, 683 games)

- **Enrichment:** 639 matched (covers too), 5 ambiguous, 39 no-match.
- **Genres:** 30 distinct names, with duplicates (`RPG` / `Role-playing (RPG)`,
  `Platform` / `Platformer`, `Simulator` / `Simulation`, `Board Games` /
  `Card & Board Game`).
- **Tags:** effectively none. 17 games carry "Game Pass" from Playnite.
- **Modes:** single 609, pvp-online 220, coop-online 170, coop-local 53.
- **Time-to-beat:** 180 games.

## Part A — Tags

### A1. A curated vocabulary, not a firehose

Provider tags are noisy: RAWG alone has thousands, many of them non-English or spam.
GameGeek keeps a **canonical vocabulary** of about 70 tags in
`packages/schemas/gamegeek/tags.js`. Every provider term is looked up in a synonym table
(lowercased, punctuation-stripped) and mapped to a canonical tag, or **dropped**. Each game
gets at most 12 tags. The vocabulary is grouped so the UI can present it well:

| Group | Canonical tags (starting set, extend deliberately) |
|---|---|
| Gameplay | Open World, Sandbox, Roguelike, Roguelite, Metroidvania, Soulslike, Survival, Crafting, Base Building, Deckbuilder, Tower Defense, Bullet Hell, Twin-Stick, Stealth, Puzzle-Platformer, Physics, City Builder, Colony Sim, Management, 4X, Grand Strategy, Tactics, Turn-Based, Real-Time, Loot, Looter Shooter, Exploration, Hunting, Fishing, Farming, Driving, Flight, Rhythm, Party, Trivia, Idle, Auto Battler, Battle Royale, Extraction, Hero Shooter, Beat 'em up, Platformer, Hidden Object |
| Story & mood | Story Rich, Choices Matter, Multiple Endings, Narrative, Walking Simulator, Mystery, Detective, Comedy, Horror, Psychological Horror, Survival Horror, Cozy, Relaxing, Difficult, Atmospheric, Emotional, Dark |
| Setting | Fantasy, Dark Fantasy, Sci-fi, Space, Cyberpunk, Post-apocalyptic, Zombies, Historical, Medieval, Western, Military, Lovecraftian, Anime, Mythology, Pirates, Nature, Superhero |
| Look & view | Pixel Art, Retro, Hand-drawn, Low-poly, Cartoony, Realistic, 2D, 3D, Isometric, Top-down, Side-scroller, First-person, Third-person, VR |

Co-op, PvP and split-screen are **modes**, not tags. They already exist.

### A2. Sources

- **IGDB:** `themes`, `keywords` and `player_perspectives`.
- **RAWG:** `tags`, English only (`language === 'eng'`).
- **Steam appdetails:** `categories`, which only feed modes, plus nothing else. Steam
  user tags need scraping the store page, and we don't scrape.

### A3. Where they're stored

- **`Game.autoTags: [String]`** holds enrichment-derived tags only, from the canonical
  vocabulary. They're separate from `Game.tags`, which are the user's own tags plus
  Playnite categories. An unlink clears `autoTags`, and a person's tags are never touched.
- The UI and filters show **one "Tags" facet over the union** of `tags ∪ autoTags`.
- The `enrichment` record gets `tagsFetchedAt: Date` and `tagSources: [String]`.

### A4. Backfill for the 639 games already matched

The worker gets a **tags pass**. It picks matched games with no `tagsFetchedAt`:
- **Has an IGDB id** → fetch themes, keywords and perspectives.
- **No IGDB id but a `steamAppId`** → look the IGDB game up through `external_games`
  (Steam uid). Store `externalIds.igdb` if it's empty and not held by another game, then
  fetch.
- **Has a RAWG id** → fetch RAWG tags too.
- **Otherwise** → search IGDB by title with the **same strict matcher**. On an exact match,
  store the IGDB id and fetch its tags.

The pass fills `autoTags` (and replaces it only when that game's `autoTags` was set by
enrichment) and sets `tagsFetchedAt`. It uses the same pacing and guarded writes. New
matches run the tags pass as part of enrichment.

### A5. Canonical genres

`GENRE_CANONICAL` lives in `packages/schemas/gamegeek/constants.js`:
- Role-playing (RPG) / RPG → **RPG**
- Turn-based strategy (TBS) → **Turn-based Strategy**
- Real Time Strategy (RTS) → **Real-time Strategy**
- Hack and slash/Beat 'em up → **Hack & Slash**
- Platform / Platformer → **Platformer**
- Simulator / Simulation → **Simulation**
- Card & Board Game / Board Games → **Card & Board**
- Sport → **Sports**
- Point-and-click → **Point & Click**
- Massively Multiplayer → **MMO**

Anything already canonical is kept as-is. Unknown names are kept too, not dropped.

It's applied **on write** (Playnite import, enrichment, gateway create/update) and by
an idempotent **boot migration** that normalizes existing `genres` arrays (dedupes after
mapping). It logs what it changed, once.

## Part B — Filtering and sorting

### B1. GraphQL contract (gateway)

```graphql
input GameFilterInput {
  q: String
  shelves: [String!]        # any-of; "unshelved" allowed
  genres: [String!]
  tags: [String!]           # matches tags ∪ autoTags
  tagMatch: String          # "any" (default) | "all" — applies to genres AND tags
  storefronts: [String!]    # any-of over copies.storefront
  platforms: [String!]      # any-of over copies.platform
  formats: [String!]        # any-of over copies.format (subscription = Game Pass)
  modes: [String!]          # any-of
  played: String            # "never" | "played" | "recent" (the caller's; recent = lastPlayed ≤ 30 days)
  favorite: Boolean         # the caller's
  releaseYearMin: Int
  releaseYearMax: Int
  lengths: [String!]        # time-to-beat main buckets: "short" <5h | "medium" 5–15 | "long" 15–40 | "epic" 40+ | "unknown"
  metadata: [String!]       # enrichment status: matched | no-match | ambiguous | pending | error | unlinked
  hasCover: Boolean
}

type GameFacetValue { value: String!  count: Int! }
type GameYearBucket { year: Int!  count: Int! }

type GameFacets {
  total: Int!               # games matching the full filter
  shelves: [GameFacetValue!]!
  genres: [GameFacetValue!]!
  tags: [GameFacetValue!]!
  storefronts: [GameFacetValue!]!
  platforms: [GameFacetValue!]!
  formats: [GameFacetValue!]!
  modes: [GameFacetValue!]!
  played: [GameFacetValue!]!     # never / played / recent
  lengths: [GameFacetValue!]!
  metadata: [GameFacetValue!]!
  releaseYears: [GameYearBucket!]!
  favorites: Int!
}

extend type Query {
  # Existing args keep working; `filter` is additive and wins where both are given.
  games(page: Int = 1, limit: Int = 48, q: String, shelf: String, platform: String, owned: String,
        sort: String = "title", sortDir: String = "asc", filter: GameFilterInput): GamePage!
  gameFacets(filter: GameFilterInput): GameFacets!
}
```

- **Faceting rule:** each facet's counts use **every other active filter except its
  own**. That's standard faceted search, so picking "Epic" still shows the other stores'
  counts. It's a single `$facet` aggregation, which is cheap at household scale, and is
  household-scoped like everything else.
- **Played buckets** use the caller's `GamePlayer`: never = no hours and no lastPlayed;
  played = hours > 0 or lastPlayed; recent = lastPlayed within 30 days.
- **Sorts** add `timeToBeat` (main, nulls last) and `random` (seeded per session and
  stable while paginating: the client sends `seed`; add `seed: Int` to `games`). Every
  sort gets an order-asserting test, as today.
- **Saved filters:** `GameSavedFilter` gains `filter: JSON` (the whole GameFilterInput)
  plus `sortBy`/`sortDir`. Old saved filters keep working.

### B2. The interface

Target: it should feel like a good storefront's browse page, calm and fast, not a
spreadsheet.

- **Desktop (md+):** a **filter panel** column (~280 px, collapsible, remembered)
  between the app sidebar and the grid. Sections, each collapsible, in order:
  - Shelf
  - Played (Never / Played / Recently)
  - Store
  - Platform
  - Genre
  - Tags: grouped by the vocabulary groups, searchable, top 12 with "Show all"
  - Modes (Single-player, Co-op online, Local co-op, PvP…)
  - Length (Short <5h, Medium, Long, Epic, Unknown)
  - Release year: range slider over the year histogram
  - Format (Game Pass / subscription)
  - Favorites
  - Metadata: No match / Needs a choice, for cleanup

  Every option shows its live count. Options that would give zero are dimmed, and
  selected ones never hide.
- **Above the grid:**
  - result count ("124 games")
  - a row of **active-filter chips**, each removable, with "Clear all"
  - sort menu with direction
  - grid/list toggle
  - **"Save view"**, which saves to the profile. Saved views appear in the app sidebar
    under Shelves.
- **Phone:** a "Filters · 3" button opens a **full-height sheet** with the same sections
  and a sticky footer, "Show 124 games". The chips row scrolls horizontally inside its own
  strip, and the page never scrolls sideways.
- **Cards:** genre and tag chips on the detail page are **tappable** and add that filter.
  Cards themselves stay uncluttered.
- **State lives in the URL.** Every filter round-trips through the query string, so back,
  forward and sharing work. Facet queries are debounced (~150 ms) and results keep
  showing while new ones load (no flash to empty).
- **Accessibility:** checkbox groups with labels, 44 px targets, the 12 px floor,
  keyboard navigation through sections, and live-region announcements of the result
  count. It must pass the mobile harness with `--enforce-a11y`.

## Decisions recorded while building the server side (2026-09-25)

**Vocabulary.**
- `packages/schemas/gamegeek/tags.js` holds `TAG_GROUPS`, `ALL_TAGS`, `TAG_SYNONYMS` and
  `mapProviderTags()`. They're re-exported from `gamegeek/constants`, so the package's
  exports map didn't change.
- A term's lookup key is NFKC, lowercased, with `&` → "and" and apostrophes removed. Every
  other run of punctuation becomes a single space. So `beat-em-up`, `Beat 'em up` and
  `beat em up` meet.
- Every canonical tag maps to itself. An explicit `null` in the table is a considered drop:
  IGDB's Action, Drama, Thriller, Kids, Erotic, Non-fiction, Educational and Romance themes,
  the Text and Auditory perspectives, `great-soundtrack`, and store-feature noise.
- Ordering is by group (Gameplay, Story & mood, Setting, Look & view), then first-seen. The
  cap of 12 cuts from the end, so a tag-rich game loses Look & view first. Fallout on RAWG
  loses Isometric this way.
- The starting set is 91 tags, not ~70, because it's exactly the table above.

**IGDB (verified live 2026-09-25).**
- `/external_games` rows are `{ game, uid, external_game_source }`, with 1 = Steam.
  `category` no longer comes back.
- The lookup is `where external_game_source = 1 & uid = ("…","…")`, with up to 10 uids per
  request. A uid that maps to two IGDB games is treated as ambiguous and skipped.
- Tags are fetched with `where id = (a,b,…)`, up to 10 ids per request. The terms come from
  themes, then keywords, then player perspectives.

**RAWG.** Only tags with `language === 'eng'` are kept. A tag with no language field is
dropped. Both its name and its slug are offered to the mapper.

**The tags pass.**
- The worker runs it after the enrichment loop, on every run: boot, every 6 h, after an
  import, and the run endpoint.
- Selection is `status = matched` and `tagsFetchedAt = null`.
- **"Otherwise → title search"** means no IGDB id, no IGDB id from the Steam lookup, *and*
  no RAWG id. A RAWG-only game uses RAWG's tags and is not title-searched.
- An IGDB id found by the Steam lookup or the title search is stored only if the field is
  still empty and no other game in the household holds it. It's then recorded in
  `enrichment.filled` and `filledHashes`, so an unlink clears it. When another game already
  holds that id, the game still gets that id's tags.
- A game is marked `tagsFetchedAt` once at least one source answered, even with zero tags.
  If a source throws, nothing is written and the next run retries.
- If neither IGDB nor RAWG is configured, the pass doesn't run. Games aren't marked, so
  adding keys later picks them up.
- `autoTags` are fingerprinted as `filledHashes.autoTags`. The pass replaces them only while
  they're empty or still match that fingerprint, and an unlink clears them under the same
  rule. Unlink also resets `tagsFetchedAt` and `tagSources`, and a re-match re-tags inline.
- New matches (worker, refresh, manual apply) are tagged inline, using the terms the matched
  IGDB or RAWG detail already carries. A failed inline tag never fails the match.
- `GET /api/metadata/enrich/status` gains `tagsQueued`, and the run summary gains `tags`.

**Genres.**
- `canonicalGenres()` runs on the Playnite mapping, enrichment's `planFill`, and the
  gateway's `createGame`, `createGames` and `updateGame`.
- The boot migration (`src/migrations/genres.js`) runs before `listen`, so before the worker
  is scheduled. It's idempotent.
- Each update is scoped `{_id, householdId}` and guarded on the exact array it read.
- When enrichment wrote a game's genres and the fingerprint still matches, the migration
  moves `filledHashes.genres` to the new value, so an unlink still clears those genres.
- It logs one line with the changed count.

**Gateway (B1 as written, plus these semantics).**
- **Where `filter` meets the old args:** a field of `filter` that's given (not null) wins
  over `q`, `shelf` or `platform`. An empty list means "no constraint". `owned` stays a
  separate, global clause.
- **Which values each facet lists:**
  - Open vocabularies (shelves, genres, tags, storefronts, platforms, formats, modes) list
    values with a count, plus every selected value, with 0 if it has none. They're sorted
    by count descending, then by value.
  - `played` is always `never, played, recent`. `recent` is a subset of `played`.
  - `lengths` is always the five buckets, in order.
  - `metadata` is always the six statuses, in order.
- **Buckets:**
  - Lengths: short is 0 < h < 5, medium is 5 ≤ h < 15, long is 15 ≤ h < 40, and epic is
    h ≥ 40. Unknown is null or ≤ 0.
  - Release year is UTC.
  - `shelves` reports no row, a null shelf or an empty shelf as `unshelved`.
  - `favorite: false` means "not my favorite", including games with no row.
- **Random sort:** `$toHashedIndexKey` of `"<_id>:<seed>"`. The same seed gives the same
  order on every page. No seed means seed 0. MongoDB 7.0+.
- **Validation:** `tags` and `genres` are free strings, at most 60 characters and 50 items.
  Every other list is a closed vocabulary from `constants.js`, and
  `releaseYearMin ≤ releaseYearMax`. The schema is strict, so unknown keys are rejected.
  `GameSavedFilterInput.filter` is checked by the same schema.
- `q` also searches `autoTags`.
