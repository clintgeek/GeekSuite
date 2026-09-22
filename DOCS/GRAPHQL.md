# GeekSuite GraphQL

A map of the suite's single GraphQL surface: where it runs, how it is assembled,
and what every app exposes through it. Written 2026-09-12 from the typeDefs
themselves; when this file and `apps/basegeek/packages/api/src/graphql/<app>/typeDefs.js`
disagree, the typeDefs win — update this file.

## 1. Where it lives

- **One Apollo Server**, mounted at `/graphql` in basegeek
  (`apps/basegeek/packages/api/src/server.js`, `new ApolloServer({ typeDefs, resolvers })`
  then `expressMiddleware`). Host port **8987**.
- **Every suite app's nginx** proxies its own `/graphql` location to
  `http://192.168.1.17:8987/graphql` (see `DOCS/RUNBOOK.md` §2 and the nginx section), so the
  browser talks to whichever app domain it is on and lands here. Startgeek is the exception:
  it calls basegeek's public URL directly via `apps/startgeek/src/lib/graphql.js`.
- **Auth**: `optionalUser({ validateSession: localSessionValidator })` — the JWT is verified
  in-process with basegeek's own secret and the user loaded from Mongo (no HTTP round-trip to
  itself; see `DOCS/CONTEXT.md` and BURN_REVIEW_2 §3). The resolver context is
  `{ user: req.user || null }`; resolvers enforce ownership themselves.
- **Logging**: every POST with an `operationName` is logged as
  `[GQL] <operationName> | vars: [<variable names>]` — names only, never values.
- **Operations**: `Query` and `Mutation` only. There is no `Subscription` type.

## 2. How the schema is assembled

`apps/basegeek/packages/api/src/graphql/index.js` merges (via `@graphql-tools/merge`):

```
shared/typeDefs.js          scalars + cross-app types
basegeek/typeDefs.js        admin, API keys, aiGeek
notegeek/typeDefs.js        (declares the root `type Query` / `type Mutation`)
bujogeek/typeDefs.js
flockgeek/typeDefs.js
fitnessgeek/typeDefs.js
bookgeek/typeDefs.js
glance/typeDefs.js          StartGeek front page (read-only)
```

Each app module owns `typeDefs.js`, `resolvers.js`, usually `validation.js` (zod), and its
Mongoose `models/`. Scalar resolvers for `Date` and `JSON` live in `index.js`.

Do **not** import services (e.g. `services/aiFeatureRunner.js`) from a typeDefs file:
`tools/gql-arg-audit.mjs` imports every module's typeDefs standalone with no env.

## 3. Shared types (`shared/typeDefs.js`)

| Type | Purpose |
|---|---|
| `scalar Date` | ISO-8601 date/datetime. Parses strings and integer millis; serializes to `toISOString()`. |
| `scalar JSON` | Pass-through. Object literals must be sent as variables, not inline. |
| `AIProvenance` | `source!`, `reason`, `model`, `provider`, `cached!`, `callsToday!`, `cap` — attached to every AI-assisted result. `source: "fallback"` means no model was consulted. |
| `DeleteResponse` | `success!`, `message` |
| `SaveOrderResponse` | `success!`, `updatedAt` |
| `TagCount` | `tag!`, `count!` |

## 4. Per-app surface

### 4.1 basegeek — admin, API keys, aiGeek

**Queries**

| Field | Returns | Notes |
|---|---|---|
| `apiKeys` | `[APIKey]` | |
| `apiKey(id: ID!)` | `APIKey` | |
| `apiKeysAppsList` | `[APIKeyAppUsage]` | per-app key counts / last used |
| `aiConfig` | `JSON` | |
| `aiStats` | `JSON` | |
| `aiDirectorModels` | `JSON` | |
| `aiUsage(provider: String!)` | `JSON` | |
| `aiFreeModels` | `[AIFreeModel!]!` | Model steward. Authenticated, **not** admin. |
| `aiRecommendModel(task: String!, priority: String, freeOnly: Boolean, limit: Int)` | `AIRecommendation!` | Model steward. Authenticated, **not** admin. |
| `aiAppConfigs` | `JSON` | App routing |
| `aiAppConfig(appName: String!)` | `JSON` | App routing |

**Mutations**

| Field | Returns |
|---|---|
| `createAPIKey(name!, appName!, description, permissions: [String], rateLimit: JSON, expiresAt: Date)` | `JSON` (includes the one-time plaintext key) |
| `updateAPIKey(id!, name, description, permissions, rateLimit, expiresAt, isActive)` | `APIKey` |
| `deleteAPIKey(id!)` | `DeleteResponse` |
| `regenerateAPIKey(id!)` | `JSON` |
| `saveAIConfig(config: JSON!)` | `JSON` — a blank key means "keep" |
| `removeAIProviderKey(provider!)` | `JSON` — the only way to delete a stored credential |
| `resetAIStats` | `Boolean` |
| `deleteModelPricing(provider!, modelId!)` | `Boolean` |
| `deleteModelFreeTier(provider!, modelId!)` | `Boolean` |
| `setCatalogOverride(provider!, modelId!, override: String)` | `JSON` — `'deny' \| 'allow' \| null` (anything else clears) |
| `saveAIAppConfig(appName!, config: JSON!)` | `JSON` |
| `deleteAIAppConfig(appName!)` | `Boolean` |

Notable types: `AIFreeModel` (every capability flag non-null; nullable only where the catalog
genuinely may not know — context window, pricing, `lastSeen`/`updatedAt`), `AIRecommendedModel`
(`reasoning!`, `score` 0–100 as a tiebreaker), `AITaskRequirements`, `AIRecommendation`,
`APIKey`, `APIKeyAppUsage`, `FreeTierLimits`.

Retired (kept as comments in the typeDefs for archaeology): `bulkUpdateFreeTiers`,
`updateModelPricing`, `updateModelFreeTier`, `resetAllFreeTiers`, `seedDirectorPricing`,
`seedDirectorFreeTier`, `testAIProvider`, `syncProviderModels`. The catalog job observes what
these used to assert.

### 4.2 notegeek

**Queries**

| Field | Returns |
|---|---|
| `notes(tag, prefix, type, limit: Int, sort)` | `[Note!]!` |
| `note(id: ID!)` | `Note` |
| `noteTags` | `[String!]!` |
| `searchNotes(q: String!)` | `[SearchSnippet!]!` |
| `suggestForNote(noteId: ID, title: String!, excerpt: String!, tags: [String!]!)` | `NoteSuggestions!` — AI tags + related notes, with `provenance` |
| `noteVersions(noteId: ID!)` | `[NoteVersion!]!` — newest first; `content` is null here by design |
| `noteVersion(id: ID!)` | `NoteVersion` — one version, with its body |

**Mutations**

| Field | Returns |
|---|---|
| `createNote(title, content: String!, type, tags: [String!])` | `Note!` |
| `updateNote(id!, title, content, type, tags, changeReason)` | `Note!` — `changeReason` labels the history entry: `edit` (default), `compose`, `restore` |
| `restoreNoteVersion(versionId: ID!)` | `Note!` — snapshots the current state first, so a restore is undoable |
| `composeNote(content: String!)` | `ComposedNote!` — a NEW document built from a pile of scraps; writes nothing |
| `deleteNote(id!)` | `Boolean!` |
| `renameTag(oldTag!, newTag!)` | `Boolean!` |
| `deleteTag(tag!)` | `Boolean!` |

Types: `Note` (`isLocked`, `isEncrypted`, `tags`), `SearchSnippet` (`score`, `snippet`),
`SuggestedTag`, `RelatedNote` (`why` only set when a model was consulted), `NoteSuggestions`,
`NoteVersion` (`reason`, `createdAt`; `content` fetched one at a time),
`ComposedNote` (`markdown!`, `stats!`, `provenance`), `ComposeStats`
(`chunksFailed`, `truncated`, `degenerate` — all three are the caller's to report).

`tidyMarkdown` / `TidyMarkdownResult` were removed 2026-09-22 with the Tidy feature; Compose replaced it.
Content is sanitized on save through `notegeek/sanitize.js` (same DOMPurify profile as the
client).

### 4.3 bujogeek

**Queries**

| Field | Returns | Notes |
|---|---|---|
| `tasks(status, tags: [String])` | `[Task!]!` | |
| `task(id!)` | `Task` | |
| `dailyTasks(date)` / `weeklyTasks(date)` / `monthlyTasks(startDate, endDate)` | `[Task!]!` | Recurring series expanded per window; blocked tasks excluded |
| `allTasks` | `[Task!]!` | |
| `blockedTasks` | `[Task!]!` | Status `blocked`, newest-blocked first; the only list where they surface |
| `taskTags` | `[TagCount!]!` | |
| `tasksByTag(tag!)` | `[Task!]!` | |
| `collections` / `collection(id!)` | `[Collection!]!` / `Collection` | |
| `habits(includeArchived: Boolean = false)` | `[Habit!]!` | |
| `habitLogs(startDate!, endDate!)` | `[HabitLog!]!` | inclusive `yyyy-MM-dd` window |
| `journalEntries(type, tags)` / `journalEntry(id!)` | `[JournalEntry!]!` / `JournalEntry` | |
| `templates(type, isDefault)` / `template(id!)` | `[Template!]!` / `Template` | |
| `pushVapidKey` | `String` | null = reminders not configured on this deployment |
| `pushSubscriptions` | `[PushSubscription!]!` | caller's registered devices |
| `reviewDraft(weekStart!)` | `ReviewDraftResult!` | AI weekly review; `weekStart` must be a Monday. Opt-in via `appPreferences.bujogeek.aiReviewDraft`; 10 model calls/user/day; degrades to deterministic with `provenance.reason: "opted_out"` |

**Mutations**

| Field | Returns | Notes |
|---|---|---|
| `createTask(content!, signifier, status, priority, tags, dueDate, createdAt, updatedAt, note, recurrencePattern @deprecated, recurrenceRule, isSeriesMaster, collectionId)` | `Task!` | Recurrence is an RRULE string (`DTSTART:...\nRRULE:FREQ=WEEKLY`); `recurrencePattern` is translated server-side |
| `updateTask(id!, input: UpdateTaskInput!, editScope: EditScope)` | `Task!` | |
| `deleteTask(id!, editScope: EditScope)` | `DeleteResponse!` | |
| `updateTaskStatus(id!, status!)` | `Task!` | |
| `blockTask(id!, reason)` | `Task!` | Park; BAD_USER_INPUT on completed/cancelled; a virtual occurrence materializes a blocked override |
| `unblockTask(id!)` | `Task!` | Back to pending; dueDate kept |
| `addSubtask(parentId!, content!, signifier, status, priority, tags, dueDate)` | `Task!` | One level only |
| `reorderSubtasks(parentId!, orderedSubtaskIds: [ID!]!)` | `Task!` | Must name every child exactly once |
| `migrateTaskToFuture(id!, futureDate: Date!)` | `Task!` | |
| `saveDailyTaskOrder(dateKey!, orderedTaskIds: [ID!]!)` | `SaveOrderResponse!` | |
| `createCollection(name!, description)` / `updateCollection(id!, name, description, archived)` | `Collection!` | |
| `deleteCollection(id!, deleteTasks: Boolean = false)` | `DeleteResponse!` | Detaches entries by default |
| `createHabit(name!, daysOfWeek: [Int!], color)` / `updateHabit(id!, name, daysOfWeek, color, archived)` | `Habit!` | |
| `deleteHabit(id!)` | `DeleteResponse!` | Takes its log history with it |
| `toggleHabitLog(habitId!, date!)` | `ToggleHabitLogResult!` | Idempotent per calendar day |
| `createJournalEntry(title!, content!, type, date, tags, status, aiDrafted)` / `updateJournalEntry(id!, ...)` | `JournalEntry!` | `aiDrafted` is stamped here when saving a `reviewDraft` |
| `deleteJournalEntry(id!)` | `DeleteResponse!` | |
| `createJournalFromTemplate(templateId!, date)` | `JournalEntry!` | |
| `createTemplate(name!, description, type, content!, isDefault, isPublic, tags)` / `updateTemplate(id!, ...)` | `Template!` | |
| `deleteTemplate(id!)` | `DeleteResponse!` | |
| `updateBujoPreferences(theme!)` | `JSON!` | |
| `savePushSubscription(input: PushSubscriptionInput!)` | `PushSubscription!` | Keyed by endpoint; idempotent |
| `removePushSubscription(endpoint!)` | `DeleteResponse!` | `success: false` if the endpoint isn't the caller's |

### 4.4 flockgeek

**Queries**

| Field | Returns |
|---|---|
| `birds(status)` / `bird(id!)` | `[Bird!]!` / `Bird` |
| `birdTraits(birdId!)` | `[BirdTrait!]!` |
| `birdNotes(birdId!)` | `[BirdNote!]!` |
| `healthRecords(birdId!)` | `[HealthRecord!]!` |
| `eggProductions(startDate: Date, endDate: Date, birdId, groupId)` | `[EggProduction!]!` |
| `hatchEvents(activeOnly)` / `hatchEvent(id!)` | `[HatchEvent!]!` / `HatchEvent` |
| `pairings(activeOnly)` / `pairing(id!)` | `[Pairing!]!` / `Pairing` |
| `flockGroups(activeOnly)` / `flockGroup(id!)` | `[FlockGroup!]!` / `FlockGroup` |
| `groupMemberships(groupId, activeOnly)` | `[GroupMembership!]!` |
| `flockLocations(activeOnly)` | `[FlockLocation!]!` |
| `meatRuns(status)` / `meatRun(id!)` | `[MeatRun!]!` / `MeatRun` |
| `flockEvents(entityType, entityId)` | `[FlockEvent!]!` |

**Mutations**

| Field | Returns |
|---|---|
| `createBird(name, tagId: String!, species, breed, strain, cross, sex, hatchDate, origin, foundationStock, locationId, temperamentScore, status, statusDate, statusReason, notes)` | `Bird!` |
| `updateBird(id!, ...same fields, all optional)` | `Bird!` |
| `createFlockGroup(name!, purpose, type, startDate: Date!, endDate, description, notes)` / `updateFlockGroup(id!, ...)` | `FlockGroup!` |
| `createFlockLocation(name!, type!, capacity, description, notes)` / `updateFlockLocation(id!, ..., isActive)` | `FlockLocation!` |
| `recordEggProduction(birdId, groupId, locationId, date: Date!, eggsCount: Int!, daysObserved, avgEggWeightGrams, eggColor, eggSize, notes)` | `EggProduction!` |
| `updateEggProduction(id!, date, eggsCount, daysObserved, locationId, notes)` | `EggProduction!` |
| `createPairing(name!, roosterIds: [ID], henIds: [ID], pairingDate, active, notes)` / `updatePairing(id!, ...)` | `Pairing!` |
| `recordHatchEvent(setDate: Date!, hatchDate, eggsSet: Int!, pairingId, notes)` | `HatchEvent!` |
| `updateHatchEvent(id!, setDate, hatchDate, eggsSet, eggsFertile, chicksHatched, pullets, cockerels, notes)` | `HatchEvent!` |
| `createMeatRun(pairingId!, hatchEventId, name, startDate: Date!, startCount: Int!, notes)` | `MeatRun!` |
| `updateMeatRun(id!, harvestDate, harvestCount, mortalityCount, avgWeightGrams, status, notes)` | `MeatRun!` |
| `addHealthRecord(birdId!, eventDate: Date!, type!, diagnosis, treatment, outcome, notes)` | `HealthRecord!` |
| `deleteFlockEntity(type: String!, id: ID!)` | `Boolean!` — one generic delete for every entity type |

### 4.5 fitnessgeek

The largest module (716 lines). Several reports/insights return a `FitnessJSON` scalar rather
than a shaped type.

**Queries**

| Area | Fields |
|---|---|
| Settings / goals | `fitnessUserSettings`, `activeNutritionGoals`, `nutritionGoalsHistory`, `derivedMacros` |
| Weight | `fitnessWeights`, `fitnessWeight(id!)` |
| Food | `fitnessFoods(search)`, `fitnessFood(id!)` |
| Food logs | `foodLogs(date: Date, startDate: Date, endDate: Date, mealType)`, `foodLog(id!)` |
| Meals | `fitnessMeals(mealType, search)`, `fitnessMeal(id!)` |
| Medications | `fitnessMedications`, `fitnessMedication(id!)` |
| Blood pressure | `bloodPressures`, `bloodPressure(id!)` |
| Streak / summaries | `loginStreak`, `dailySummary(date)`, `weeklySummary(startDate!)` |
| Household | `fitnessHousehold`, `fitnessHouseholdMemberLogs(memberId!, date!)` |
| Reports | `fitnessFoodReportOverview(start, days)`, `fitnessFoodReportTrends(start, days)` |
| AI insights | `fitnessInsightsMorningBrief`, `fitnessInsightsDailySummary(date)`, `fitnessInsightsCorrelations`, `fitnessInsightsWeeklyReport(start, days)`, `fitnessInsightsTrendWatch(start, days)`, `fitnessInsightsCoaching`, `fitnessInsightsContext(days)` |
| Quick add | `parseFoodEntry(text!, date): ParsedFoodEntry!` — `text` ≤ 500 chars; `date` is the caller's **local** `YYYY-MM-DDTHH:mm` (only the hour is read, to pick a meal type). Read-only: proposes, never logs. |
| Garmin | `garminStatus`, `garminDaily(date)`, `garminSleep(date)`, `garminActivities(start: Int, limit: Int)` |

**Mutations**

| Area | Fields |
|---|---|
| Settings / goals | `updateFitnessUserSettings(input: FitnessUserSettingsInput!)`, `setNutritionGoals(input: NutritionGoalsInput!)` |
| Weight | `addFitnessWeight(input: WeightInput!)`, `updateFitnessWeight(id!, input!)`, `deleteFitnessWeight(id!)` |
| Food | `addFitnessFood(input: FitnessFoodInput!)`, `updateFitnessFood(id!, input!)`, `deleteFitnessFood(id!)` |
| Food logs | `addFoodLog(input: FoodLogInput!)`, `updateFoodLog(id!, input: FoodLogUpdateInput!)`, `deleteFoodLog(id!)`, `logMeal(mealId!, date!, mealType): [FoodLog]`, `copyFitnessMeal(from_date!, to_date!, from_meal_type, to_meal_type, from_user_id): [FoodLog]` |
| Meals | `addFitnessMeal(input: FitnessMealInput!)`, `updateFitnessMeal(id!, input!)`, `deleteFitnessMeal(id!)` |
| Medications | `addFitnessMedication(input!)`, `updateFitnessMedication(id!, input!)`, `deleteFitnessMedication(id!)` |
| Blood pressure | `addBloodPressure(input!)`, `updateBloodPressure(id!, input!)`, `deleteBloodPressure(id!)` |
| Streak / summaries | `recordLoginStreak`, `refreshDailySummary(date)` |
| Household | `createFitnessHousehold(display_name!)`, `joinFitnessHousehold(household_id!, display_name!)`, `updateFitnessHouseholdSettings(input: FitnessJSON!)`, `leaveFitnessHousehold` |
| AI | `fitnessInsightsChat(message!, history: [ChatMessageInput])` |
| Garmin | `updateGarminWeight(date, weightLbs: Float!, timezone)` |

`FitnessUserSettings` is shared with the REST settings routes through one module — add fields
there first (see `DOCS/CONTEXT.md`, "Adding a field", and
`apps/fitnessgeek/DOCS/USER_SETTINGS_SCHEMA.md`).

### 4.6 bookgeek

**Queries**

| Field | Returns |
|---|---|
| `books(page, limit, sort, sortDir, author, tag, shelf, owned, q)` | `BookPage!` |
| `book(id!)` | `Book` |
| `shelves` | `ShelfStats!` |
| `bookProfile` | `BookProfile` |
| `libraryFilters` | `[BookSavedFilter!]!` |
| `bookAiStatus` | `BookAiStatus!` |
| `whatNext(limit: Int = 5)` | `WhatNextResult!` — AI recommendations |
| `draftBookMetadata(bookId!)` | `BookMetadataDraft!` — AI metadata draft |

**Mutations**

| Field | Returns |
|---|---|
| `createBook(input: CreateBookInput!)` | `Book` |
| `updateBook(id!, input: UpdateBookInput!)` | `Book` |
| `deleteBook(id!, deleteFiles: Boolean)` | `DeleteBookResponse` |
| `saveBookProfile(input: BookProfileInput!)` | `BookProfile` |
| `saveLibraryFilter(input: SaveLibraryFilterInput!)` | `[BookSavedFilter!]!` |
| `deleteLibraryFilter(id: String!)` | `[BookSavedFilter!]!` |
| `addBookShelf(label!)` | `BookProfile` |
| `removeBookShelf(id: String!)` | `RemoveBookShelfResult!` |

### 4.7 glance — StartGeek front page (read-only)

| Field | Returns | Notes |
|---|---|---|
| `glanceToday(date)` | `GlanceToday!` | One round-trip: `tasks` (due/overdue/events/upcoming + counts), `habits`, `recentNotes`, `reading`, `fitness`, `flock` |
| `glanceSearch(query!, limit: Int = 12)` | `[GlanceSearchResult!]!` | Cross-app search; each result carries `app`, `type`, `url` |
| `glanceAsk(query!, limit: Int = 12)` | `GlanceAsk!` | AI-planned search over the user's own Things. `intent` echoed back as chips; `answer` null unless grounded in context; `citations` are result ids |
| `glanceDraft(input!, kind!, today)` | `GlanceDraft!` | AI reading of a `>`/`<` capture line the deterministic parser couldn't. Drafting only; `degraded: true` + null draft means carry on as if AI were off |
| `glanceBrief(date!, localHour!)` | `GlanceBrief!` | Morning brief, three sentences, display-only. `brief` null before 5 a.m. local or if the snapshot failed — not an error |
| `calendarEvents(sources: [CalendarSourceInput!]!, from: Date, to: Date)` | `[CalendarEvent!]!` | ICS feeds by URL; `CalendarSourceInput { url!, color }` |

## 5. Guards and tooling

- **Argument drift audit** — `tools/gql-arg-audit.mjs` (`pnpm check:gql`, CI job `gql-audit`)
  catches resolvers reading args the schema doesn't declare, and vice versa. GraphQL itself
  will not report this. See `DOCS/RUNBOOK.md` "GraphQL argument audit".
- **Schema loads** — `apps/basegeek/packages/api/src/__tests__/gatewaySchemaLoads.test.js`
  fails the build if the merged schema doesn't parse (an unescaped backtick inside a `gql`
  template literal has bitten before; see RUNBOOK).
- **Parity tests** — `fitnessgeekSchemaParity.test.js` and `userSettingsSchemaParity.test.js`
  keep the gateway's fitnessgeek types in step with the shared model modules.
- **CSRF** — every frontend's GraphQL client appends `csrfHeaders()` last; see `DOCS/CONTEXT.md`
  for the double-submit token and the shared `geeksuite:csrf-reload-attempted` guard.
- **Errors** — a 401 or a real `UNAUTHENTICATED` GraphQL error logs the user out; 5xx does not.

## 6. Adding to the schema

1. Edit `apps/basegeek/packages/api/src/graphql/<app>/typeDefs.js` and `resolvers.js`; add zod
   rules to the module's `validation.js`.
2. Cross-app shapes (provenance, delete responses, tag counts) go in `shared/typeDefs.js`
   once — never redeclare them per module.
3. Run `pnpm check:gql` and the gateway tests.
4. Update the matching client `graphql/` folder
   (`apps/<app>/frontend/src/graphql/` or `apps/bookgeek/web/src/graphql/`) and this file.
