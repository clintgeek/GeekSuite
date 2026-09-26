# BookGeek — cleanup plan

*Written 2026-09-25. Chef: "Let's clean up bookgeek, it's an important app." This replaces
the sequencing in `DOCS/BOOKGEEK_PREP_PLAN.md`, whose verified facts and deletion list
still stand.*

## What changed since the prep plan

The prep plan assumed BookGeek was the library to copy. GameGeek now does everything
BookGeek's library does, and more: faceted filters with storefront-style counts, URL
state, saved views, stable cached pagination, scroll memory, the `/` focus and a
contrast-audited UI. So the shared `@geeksuite/collection` pieces should be extracted
**from GameGeek**, with BookGeek adopting them. The two apps then share one
implementation instead of two copies.

The state as measured on 2026-09-25:
- 554 books.
- `api/src/server.js` is 2,902 lines.
- `web/src/App.jsx` is 2,730 lines and owns nearly all state (`useState` for books,
  filters, selection, baskets…). `react-router` is mounted but unused.
- Rows are patched in place, so there is no scroll-reset bug.
- The `Book` model is still hand-duplicated in the api and the gateway.

## Phase A — remove the rot (no behaviour change) — **in progress**

1. **Delete** the dead REST CRUD (`GET/POST /api/books`, `GET/PATCH/DELETE /api/books/:id`,
   `GET /api/shelves`), the `/kindle-test*` routes, and the dead models `IngestionJob` and
   `Recommendation`. Re-verify zero callers first.
2. **One `Book` definition:** `@geeksuite/schemas/bookgeek/{book,profile}`, the
   fitnessgeek/gamegeek pattern. Both the api and the gateway build their models from it,
   which ends the hand-synced drift tripwire. A parity test pins it.
3. **Docs:** fix `apps/bookgeek/DOCS/CONTEXT.md`'s stack paragraph (it says
   Bun/Tailwind/shadcn; the app is Node/Express + Vite/React 18/MUI 5) and the stale "four
   dead sorts" line (fixed in `f7ccbfec`).

The Kindle flows (`/kindle*`, `/download-basket*`, send-to-Kindle, device baskets), the
Calibre import, ebook conversion, covers and the reader all stay working and are
re-verified.

**Progress (2026-09-25), done, awaiting commit.** Details are in
`apps/bookgeek/DOCS/CONTEXT.md` → "Phase A cleanup (2026-09-25)".
- Step 1 **done**: the dead CRUD, `/api/shelves` and `/kindle-test*` are gone
  (`server.js` 2,902 → 2,447 lines), and `IngestionJob`/`Recommendation` are
  gone from both the api and the gateway. **Exception:** `DELETE /api/books/:id`
  is kept. It is the only code that deletes a book's files from disk, and the
  gateway's `deleteBook` ignores the UI's "Also delete files". That is a live
  bug, and this route is its fix. Chef's call.
- Step 2 **done**: `packages/schemas/bookgeek/{book,profile}.js`. The two
  copies were identical. Both writers build from the factories, parity tests
  are on both sides (red/green verified), and production was checked read-only
  (554 books, 0 dropped paths, indexes match). The api imports the factory
  by relative path until it declares `@geeksuite/schemas`, which needs a
  lockfile update.
- Step 3 **done**: CONTEXT.md stack paragraph, the sorts line, and the stale
  "still live" and "Chef's call" notes.

## Phase B — structure — **approved by Chef 2026-09-25** ("B and C need to be done, for sure") — **done 2026-09-25**

- **`App.jsx` → routes and per-view state.** Real routes (`/`, `/book/:id`, `/settings`,
  deep-linkable like GameGeek), state moved into hooks per view, and the book list moved
  into the Apollo cache with a field policy instead of hand-managed `setBooks`.
- **`server.js` → an `app.js` plus route modules** (kindle, baskets, covers, files,
  imports). That makes the app importable without listening, so boot-smoke finally covers
  it instead of three routers.
- Behaviour-preserving, one module per commit, with BookGeek's 224 web tests, api tests
  and harness scenes green at every step.

**Progress (2026-09-25): done, awaiting commit.** Details are in
`apps/bookgeek/DOCS/CONTEXT.md` under "Phase B cleanup (2026-09-25)".
- **B1:** `server.js` went from 2,447 to 66 lines, split into `app.js`
  (`createApp()`) and route modules. boot-smoke now imports `app.js`. The old
  and new servers answered 170 probes identically.
- **B2:** `App.jsx` went from 2,730 to 281 lines. It has real routes (`/`,
  `/book/:id` over the mounted library, `/settings`), the filters are in the
  URL, the list is in the Apollo cache with a paginated field policy, and the
  state lives in `hooks/*`. Edits, shelf moves and deletes change the cache in
  place and never refetch the list.
- **Bug fix:** "Also delete files" now goes to `DELETE /api/books/:id?deleteFiles=true`.
- 256 web tests and 215 api tests. The harness ran 34 scenes with 0
  violations and 0 a11y findings.

## Phase C — parity with GameGeek — **approved 2026-09-25**; C1 (extract from GameGeek into `packages/collection`, with GameGeek moved onto it) is running in parallel with Phase A; C2 (BookGeek adopts it) comes after Phase B

- **Extract `@geeksuite/collection` from GameGeek:** the facet panel and sheet, active
  chips, sort menu, saved views, the URL filter codec, the paginated-list cache policy,
  scroll memory, and the server-side `buildSearchFilter` / facet `$facet` helpers.
  GameGeek switches to the package in the same commit, so there's no second copy.
- **BookGeek adopts them.** A `bookFacets` gateway query (shelf, author, series, tags,
  format, owned, has-file, read year, rating), the BookGeek filter panel, and saved views
  migrated from its existing `savedFilters`.
- Genre and tag normalization for books if Calibre's tags need it (they're user-curated,
  so likely **no** vocabulary mapping).

### C1 — done 2026-09-25 (uncommitted at time of writing): what moved, and the package's API

GameGeek runs on `@geeksuite/collection` now, and no second copy is left in
`apps/gamegeek`. The behaviour is unchanged. The facet `$facet` pipeline and the
conditions are byte-identical to the old ones across 20 filter shapes (JSON-compared
against the pre-change module). The harness shows 72 scenes, 0 violations and 0 a11y
findings with `--enforce-a11y --desktop`, the same as the baseline run taken just before.

**Deleted from GameGeek:**
- `components/filters/*`, all 12 files: FacetSection, FacetOptions, TagFacet,
  YearRangeFacet, FilterSections, FilterPanel, FiltersSheet, ActiveChips, SortMenu,
  SaveViewDialog, LibraryHeader and filterUi.
- `components/SavedViews.jsx`.
- Seven hooks: `useLibraryFilter`, `useGameFacets`, `useGamePages`,
  `useRefreshLibraryList`, `useLibraryScrollMemory`, `useInfiniteSentinel` and
  `useDebouncedValue`.
- `mergeGamesPage`, and `groupTagOptions` (replaced by the package's `groupOptions`).
- The codec bodies in `utils/libraryFilter.js`, and `buildOptions`, `visibleOptions`
  and the chip builder in `utils/facets.js`.
- In the gateway, `gamegeek/filters.js` lost its own `searchRegex`, `matchOf`, value
  facet, open/fixed shapers and year-range code. `resolvers.js` lost its own random key,
  nulls-last sort and page `$facet`.

**What stays in GameGeek, as configuration:**
- `utils/libraryFilter.js`: the codec schema (URL keys, vocabularies), `SORTS`,
  `buildGamesVariables`, and `savedViewSearch`, which maps legacy views.
- `utils/facets.js`: `SECTIONS`, `CHIP_SPECS`, value labels and hints, and the Cleanup
  section.
- `utils/tagGroups.js`, the tag-vocabulary mirror.
- `utils/collectionConfig.js`: the noun is "game", in the display font.
- `hooks/useLibrary.js`: binds the package to `GetGames` and `GetGameFacets`.
- `components/SaveLibraryView.jsx`: binds `saveGameFilter`.
- In `Sidebar.jsx`, `SavedViews` is bound to `deleteGameFilter`.
- `graphql/cachePolicies.js`, the Game type policies.
- In the gateway: the played, length, metadata and needsDecision semantics, the tags ∪
  autoTags match, the `__me` GamePlayer join, `effectiveFilter`, and `SORT_FIELDS`.
- GameCard, GameRow and ShelfStrip, plus everything for install, Playnite and enrichment.

**Client API** (`import … from '@geeksuite/collection'`):

| Export | What it is |
|---|---|
| `createFilterCodec(schema)` | Builds a URL codec. `schema.fields` is an ordered list. Each field has a `key`, a `param`, and a `type`: `search`, `list` (with `drop` and `values`), `enum` (with `values`, `default`, `counts: false` and `requires`), `boolean` (1/0), `flag` (only true is written), or `range` (with `minKey`, `maxKey` and `parse`). `schema.state` lists fields that live outside the filter (GameGeek's `owned`). `schema.sorts` is `{ order, default, random, defaultDir }`. Optional: `params` renames `sort`, `dir` and `seed`; `legacy(params, state)` reads old links. The codec returns `read`, `toParams`, `write(params, patch)`, `toFilterInput`, `activeCount`, `isNarrowed`, `viewSearch(view)`, `canonicalSearch`, `searchWith(search, key, value)`, `clearPatch`, `EMPTY_FILTER` and `DEFAULT_STATE`. |
| `integerBetween(lo, hi)`, `newSeed()` | A parser for one side of a range, and a shuffle seed. |
| `useCollectionFilter(codec, { buildVariables })` | The URL-backed state: `{ state, filterInput, activeCount, variables(page), ready, update, toggle, remove, clearAll, setSort, reshuffle }`. It mints a missing random seed in place. |
| `CollectionProvider`, `useCollectionConfig` | App-wide `{ noun: { one, many }, displayFont }`. Pass a module-level constant. |
| `buildFacetOptions`, `visibleOptions`, `groupOptions`, `sectionOptions`, `sectionActiveCount` | Pure option building. `base` fixes the order and `current` gives live counts. A selected value always shows. |
| `buildActiveChips(codec, state, specs, context)`, `rangeLabel`, `suggestViewName` | Chips from an ordered spec list. Each spec has a kind: `search`, `list`, `single` (use `scope: 'state'` for state fields), `boolean`, `flag`, `range` or `custom`. Every chip carries the `patch` that removes it. |
| `FilterSections`, `FilterPanel`, `FiltersSheet` | The panel body, rendered from a `sections` config. The desktop column is collapsible. The phone sheet has a sticky "Show N" footer. Each takes `sections`, `lib`, `facets` and `context`. |
| `FacetSection`, `FacetOptions` / `OptionRow` / `ShowMoreButton`, `GroupedFacetOptions`, `RangeFacet`, `MatchToggle`, `SwitchRow` | The building blocks, for a `custom` section. |
| `ActiveChips`, `SortMenu` (`sorts`), `LibraryHeader` (`sorts`), `FiltersButton`, `SaveViewDialog` (`onSave(name)`), `SavedViews` (`hrefFor`, `onDelete`) | The chrome above the list. |
| `pillSx`, `countText`, `showLabel`, `useSectionOpen(storageKey, defaults)` | UI helpers. |
| `useDebouncedValue`, `useFacetQuery(query, filterInput, { field })`, `usePagedList(query, { variables, ready, field, itemsField, pageSize })`, `useScrollMemory(root, key, { rows, hasMore, storageKey })`, `useInfiniteSentinel` | Hooks. |
| `pagedListPolicy({ keyArgs, itemsField })`, `mergePagedList`, `refreshPagedList`, `removeFromPagedLists`, `evictRootFields`, `installTypePoliciesOnce` | The paginated-list cache. It keeps one list per filter and sort, and never collapses it on a refresh. |

**Server API** (`@geeksuite/collection/server`) never scopes a tenant. The app's
resolver puts its household/user `$match` first.

| Export | What it is |
|---|---|
| `searchRegex`, `buildSearchFilter(q, fields)` | An escaped, bounded, case-insensitive contains-search over the given fields. |
| `inList`, `yearRange`, `numberRange`, `matchOf(conditions, { stage, except })` | Condition building. Conditions are `{ key: { stage?, match } }`. |
| `buildFacetStage(conditions, { name: (match) => stages })` | One `$facet` in which each facet excludes its own condition (or its `exclude` key). A `total` facet comes first. |
| `valuesFacetStages`, `groupFacetStages`, `countFacetStages`, `histogramStages`, `yearHistogramStages` | Facet bodies. |
| `shapeOpenFacet`, `shapeFixedFacet`, `shapeHistogram`, `shapeCount` | Shape the `$facet` results for GraphQL. |
| `randomSortKey(seed)`, `nullsLastSort({ key, dir, tiebreak })`, `pageArgs`, `pageFacetStage`, `shapePage` | Sorts and paging. |

**Notes for C2 (BookGeek adoption):**
- Write `utils/libraryFilter.js` as a codec schema. For example: `shelf` (list),
  `author` (list), `series` (list), `tag` (list) with `match` (an enum that `requires`
  tags), `format` (a list with `values`), `owned` (boolean), `file` (flag), `read` (a
  range over `readYearMin`/`readYearMax`) and `stars` (a range with
  `integerBetween(1, 5)`).
- Old `savedFilters` map through `codec.viewSearch({ filter, sort, dir })` the way
  GameGeek's `savedViewSearch` maps its legacy fields.
- Write `SECTIONS` in panel order. Use `list` for shelf, author, series and format, with
  `limit` for long lists. Tags can be `grouped` without `groupOf`, which makes one
  searchable list, or with groups if Chef wants them. Use `range` for read year (bucket
  key to taste) and rating, and a `switch` for owned and has-file. Use `label(v, context)`
  to word values, and pass per-user data (custom shelves) through `context`.
- The gateway side for `bookFacets`: build `conditions` per filter key, then
  `buildFacetStage` with `valuesFacetStages` for authors, series and tags,
  `groupFacetStages` for shelf and format, `yearHistogramStages('readAt')`, and
  `countFacetStages` for owned and has-file. Shape with `shapeOpenFacet` and friends.
- The book list uses `pagedListPolicy` with `keyArgs` taken from filter and sort. It is
  refreshed with `refreshPagedList` after a create and `removeFromPagedLists` after a
  delete, and never with `refetch()`.
- In `vite.config`, alias `@geeksuite/collection` to its `src/index.js` like
  `@geeksuite/ui`, and keep MUI, React and `react-router-dom` in `dedupe`.
  BookGeek-web's vitest needs `/@geeksuite/` in `server.deps.inline` (GameGeek has it).
- Wrap the app in `CollectionProvider` with `{ noun: { one: 'book', many: 'books' } }`,
  and do it in the test render helper too.
- The package's own tests already run a books-shaped config
  (`packages/collection/src/__tests__/fixtures.js`), so that is a starting point.

## Later, not in this plan

- Suite households (`DOCS/SUITE_HOUSEHOLDS_PLAN.md`): BookGeek is the app with the real
  `householdId` migration.
- A taste model for books, like GameGeek's `TASTE_MODEL.md`, if Chef wants a book
  recommender.
