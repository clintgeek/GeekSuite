# GeekSuite GraphQL Consolidation Guide

> **Goal**: Eliminate all per-app GraphQL subgraphs and the API Gateway. Every app frontend becomes a smart SPA querying a **single unified GraphQL API** hosted by BaseGeek at `basegeek.clintgeek.com/graphql`.

---

## Confirmed Decisions

| Decision | Choice |
|----------|--------|
| Date field type | `scalar Date` (standardize all apps on FitnessGeek's approach) |
| FitnessGeek module format | Convert to **ESM** (`import`/`export`) before merging |
| Rollout strategy | **All apps at once** — migrate all schemas, flip all frontends simultaneously |
| GraphQL mount point | `apps/basegeek/packages/api/src/server.js` (existing Express app) — add `/graphql` before the SPA catch-all |

---

## Architecture Overview

### Before

```
Frontend → /graphql → App's own Express+Apollo server → MongoDB
           (each app has its own backend container)
```

### After

```
Frontend → https://basegeek.clintgeek.com/graphql → BaseGeek Express+Apollo → MongoDB
           (one container, one connection, one endpoint)
```

BaseGeek already has:
- ✅ CORS configured for all GeekSuite origins with `credentials: true`
- ✅ MongoDB connected
- ✅ Auth routes (`/api/auth`, `/api/users`)
- ✅ ESM (`import`/`export`) throughout
- ✅ `optionalUser()` / `attachUser` middleware available via `@geeksuite/user/server`

---

## Subgraph Inventory

| App | Types | Notes |
|-----|-------|-------|
| **NoteGeek** | `Note` | Simplest — good first one |
| **BujoGeek** | `Task`, `JournalEntry`, `TagCount`, `DeleteResponse`, `SaveOrderResponse` | Well-structured service layer |
| **FlockGeek** | `Bird`, `Pairing`, `HatchEvent`, `MeatRun`, `Group`, `Location`, `EggProduction`, `HealthRecord`, `BirdTrait`, `BirdNote`, `GroupMembership`, `Event`, `LineageCache` | Largest — do last |
| **FitnessGeek** | `Weight`, `FoodItem`, `FoodLog`, `Meal`, `Medication`, `BloodPressure`, `UserSettings`, `NutritionGoals` + support types | Already well-structured, needs ESM conversion |
| **BookGeek** | Embedded in 2900-line `server.js` | Needs schema extracted first |

---

## Step-by-Step Instructions

---

### PHASE 0 — Pre-work: Convert FitnessGeek to ESM

FitnessGeek's backend currently uses CommonJS (`require`/`module.exports`). All other apps and BaseGeek use ESM. Do this conversion before Phase 1.

**In `apps/fitnessgeek/backend/`:**

1. Add `"type": "module"` to `package.json`
2. In every `.js` file, change:
   - `const X = require('...')` → `import X from '...'`
   - `module.exports = X` → `export default X` (or `export const X = ...`)
   - `require.resolve`, `__dirname`, `__filename` → use `import.meta.url` + `fileURLToPath`
3. Add file extensions to relative imports if missing: `import X from './foo'` → `import X from './foo.js'`

The files to convert are:
- `src/graphql/typeDefs.js`
- `src/graphql/resolvers.js`
- `src/graphql/index.js`
- `src/models/*.js` (all Mongoose models)
- `src/config/*.js`

---

### PHASE 1 — Extract BookGeek's Schema

BookGeek's GraphQL schema and resolvers are currently embedded in a 2900-line `server.js`. Before merging:

1. Find the `typeDefs` and `resolvers` values inside `apps/bookgeek/api/src/server.js`
2. Create:
   - `apps/bookgeek/api/src/graphql/typeDefs.js`
   - `apps/bookgeek/api/src/graphql/resolvers.js`
3. Import them back into `server.js` (the existing backend keeps running unchanged for now)

---

### PHASE 2 — Build the Unified GraphQL Module in BaseGeek

#### Step 2.1 — Create the Folder Structure

```
apps/basegeek/packages/api/src/graphql/
├── index.js              ← Entry point: merges all schemas
├── shared/
│   └── typeDefs.js       ← Shared scalars and types (Date, DeleteResponse, etc.)
├── notegeek/
│   ├── typeDefs.js
│   ├── resolvers.js
│   └── models/           ← Note.js
├── bujogeek/
│   ├── typeDefs.js
│   ├── resolvers.js
│   ├── models/           ← Task.js, JournalEntry.js
│   └── services/         ← taskService.js
├── flockgeek/
│   ├── typeDefs.js
│   ├── resolvers.js
│   └── models/
├── fitnessgeek/
│   ├── typeDefs.js
│   ├── resolvers.js
│   └── models/
└── bookgeek/
    ├── typeDefs.js
    ├── resolvers.js
    └── models/
```

#### Step 2.2 — Create `graphql/shared/typeDefs.js`

This holds types that appear in multiple apps so they're defined only once:

```js
import { gql } from 'graphql-tag';

export const sharedTypeDefs = gql`
  scalar Date

  type DeleteResponse {
    success: Boolean!
    message: String
  }

  type SaveOrderResponse {
    success: Boolean!
    updatedAt: String
  }

  type TagCount {
    tag: String!
    count: Int!
  }
`;
```

> **Important**: Remove `DeleteResponse`, `SaveOrderResponse`, `TagCount`, and the `scalar Date` from individual app schemas — they live here now.

#### Step 2.3 — Copy and Clean Each App's Schema

For each app, copy `typeDefs.js` and `resolvers.js` into the corresponding folder, then:

**Schema cleanup checklist (typeDefs.js):**

- [ ] Remove `extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", ...)` — no longer needed
- [ ] Change `extend type Query { ... }` → `type Query { ... }`
- [ ] Change `extend type Mutation { ... }` → `type Mutation { ... }`
- [ ] Remove `@key(fields: "id")` from all types
- [ ] Remove `@shareable` from all types
- [ ] Remove `DeleteResponse`, `SaveOrderResponse`, `TagCount` (they're in shared now)
- [ ] Change all date fields from `String` to `Date` (to match the `scalar Date` standard)

**Resolver cleanup checklist (resolvers.js):**

- [ ] Fix the dummy userId fallback. Change every instance of:
  ```js
  const userId = context.user?.id || '000000000000000000000000';
  ```
  to:
  ```js
  const userId = context.user?.id;
  if (!userId) return []; // or throw new Error('Unauthorized');
  ```
  FitnessGeek's resolvers already do this correctly — use them as a reference.

- [ ] Verify Mongoose model `id` field resolvers. Each app needs:
  ```js
  ModelName: {
    id: (doc) => doc._id.toString(),
  }
  ```

#### Step 2.4 — Copy Mongoose Models

Copy each app's `models/` directory into `graphql/<appname>/models/`. Then check for these issues:

- **Mongoose model name conflicts**: Each app uses different model names (`Note`, `Task`, `Bird`, etc.) — no conflicts expected. Double-check before running.
- **Shared `User` model**: BaseGeek already has a `User` model in `src/models/`. Don't copy it from the subgraphs — reference the existing one instead.

#### Step 2.5 — Create `graphql/index.js`

```js
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';

import { sharedTypeDefs } from './shared/typeDefs.js';

import { typeDefs as noteTypeDefs } from './notegeek/typeDefs.js';
import { resolvers as noteResolvers } from './notegeek/resolvers.js';

import { typeDefs as bujoTypeDefs } from './bujogeek/typeDefs.js';
import { resolvers as bujoResolvers } from './bujogeek/resolvers.js';

import { typeDefs as flockTypeDefs } from './flockgeek/typeDefs.js';
import { resolvers as flockResolvers } from './flockgeek/resolvers.js';

import { typeDefs as fitnessTypeDefs } from './fitnessgeek/typeDefs.js';
import { resolvers as fitnessResolvers } from './fitnessgeek/resolvers.js';

import { typeDefs as bookTypeDefs } from './bookgeek/typeDefs.js';
import { resolvers as bookResolvers } from './bookgeek/resolvers.js';

export const typeDefs = mergeTypeDefs([
  sharedTypeDefs,
  noteTypeDefs,
  bujoTypeDefs,
  flockTypeDefs,
  fitnessTypeDefs,
  bookTypeDefs,
]);

export const resolvers = mergeResolvers([
  noteResolvers,
  bujoResolvers,
  flockResolvers,
  fitnessResolvers,
  bookResolvers,
]);
```

Install required dependencies in BaseGeek's API package:

```bash
cd apps/basegeek/packages/api
pnpm add @apollo/server @graphql-tools/merge @graphql-tools/schema graphql-tag
```

#### Step 2.6 — Mount Apollo Server in BaseGeek's `server.js`

Add this **before** the SPA catch-all (`app.get('*', ...)`):

```js
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs, resolvers } from './graphql/index.js';
import { optionalUser } from '@geeksuite/user/server';

// In the server startup (the app.listen callback, or top-level await):
const apolloServer = new ApolloServer({ typeDefs, resolvers });
await apolloServer.start();

app.use('/graphql', optionalUser());
app.use('/graphql', expressMiddleware(apolloServer, {
  context: async ({ req }) => ({
    user: req.user || null,
  }),
}));
```

> **Note**: `optionalUser()` extracts the JWT from the `Authorization: Bearer <token>` header and populates `req.user`. This is already used by every subgraph — same behavior, same package.

---

### PHASE 3 — Update All Frontend Apps

#### Step 3.1 — Set `VITE_GRAPHQL_API_URL` in Each App

For each app, update the production env file:

**`apps/<appname>/frontend/.env`** (or wherever the production env lives):
```env
VITE_GRAPHQL_API_URL=https://basegeek.clintgeek.com/graphql
```

**`apps/<appname>/frontend/.env.local`** (local dev):
```env
VITE_GRAPHQL_API_URL=http://localhost:8987/graphql
```

Apps to update: `notegeek`, `bujogeek`, `flockgeek`, `fitnessgeek`, `bookgeek`

#### Step 3.2 — Rebuild All Frontends

`VITE_GRAPHQL_API_URL` is baked into the JS bundle at build time. After updating the env files, rebuild and redeploy all apps:

```bash
cd /mnt/Media/Projects/GeekSuite
./build.sh --all
```

---

### PHASE 4 — Remove Per-App Subgraph Backends

> ⚠️ **Do this only after Phase 3 is verified working end-to-end.**

For each app, in its `backend/server.js`:

1. Remove `setupGeekSuiteSubgraph()` and its import
2. Remove `typeDefs`/`resolvers` imports
3. Remove the `graphql/` directory
4. Remove `@geeksuite/apollo-server-utils` from `package.json`
5. If the app has **no remaining REST routes**, the entire backend can be deleted and the app becomes a static Nginx container

Apps that likely have REST routes to keep:
- **NoteGeek**: REST notes routes may still exist in BaseGeek (`/api/notes`)
- **BujoGeek**: Check — may have REST routes outside GraphQL
- **BookGeek**: Definitely keep — has Kindle UI and REST import/export routes
- **FitnessGeek**: Check for Garmin/InfluxDB data sync routes

---

### PHASE 5 — Clean Up

1. **Delete `apps/api-gateway/`** — no longer needed
2. Remove `/graphql-gateway` proxy routes from any remaining app servers
3. **`@geeksuite/apollo-server-utils`** — delete after all apps remove it
4. **`@geeksuite/graphql-config`** — contents moved to `graphql/shared/typeDefs.js` in BaseGeek; delete the package

---

## Verification Checklist (Run After Phase 3)

For each app, open it in a browser and verify:

- [ ] DevTools Network: GraphQL requests go to `basegeek.clintgeek.com/graphql`
- [ ] Data loads (tasks, notes, birds, etc.)
- [ ] Creating a new item works
- [ ] Editing an item works
- [ ] Deleting an item works
- [ ] Logging out and back in still shows data
- [ ] No errors in browser console

---

## Known Gotchas

| Issue | Details |
|-------|---------|
| **Duplicate type names** | `DeleteResponse` appears in BujoGeek + potentially others. Move all shared types to `graphql/shared/typeDefs.js` and remove from individual schemas. |
| **`Date` scalar conflicts** | FitnessGeek defines `scalar Date`. The `sharedTypeDefs` defines it once. Every other app's `String` date fields should be migrated to `Date` consistently. |
| **Mongoose model re-registration** | Mongoose throws if you register the same model name twice. Use `mongoose.models.ModelName || mongoose.model(...)` pattern as a guard. |
| **`context.user.id` vs `context.user._id`** | Apps are inconsistent — some use `.id`, some `._id`. Verify the `optionalUser()` middleware output shape and standardize. |
| **FitnessGeek `__dirname`** | CommonJS `__dirname` doesn't exist in ESM. Replace with `const __dirname = path.dirname(fileURLToPath(import.meta.url))`. |
| **BookGeek models** | BookGeek's models are deep inside `server.js`. Extract them carefully and verify collection names don't conflict with other apps. |
