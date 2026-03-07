# GeekSuite GraphQL Consolidation Guide

> **Goal**: Eliminate the per-app GraphQL subgraphs and the API Gateway. Each app becomes a smart frontend that talks to a **single unified GraphQL API** hosted by BaseGeek.

---

## Architecture Overview

### Current State (Federated Subgraphs)

```
┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ NoteGeek│  │ BujoGeek │  │ FlockGeek│  │ BookGeek │
│ :9988   │  │ :5005    │  │ :5001    │  │ :1800    │
│ /graphql│  │ /graphql │  │ /graphql │  │ /graphql │
│ Express │  │ Express  │  │ Express  │  │ Express  │
│ +Apollo │  │ +Apollo  │  │ +Apollo  │  │ +Apollo  │
│ Subgraph│  │ Subgraph │  │ Subgraph │  │ Subgraph │
└────┬────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │            │             │              │
     └────────────┴──────┬──────┴──────────────┘
                         │
                  ┌──────┴──────┐
                  │ API Gateway │  ← often not running!
                  │   :4100     │
                  └─────────────┘
```

Each app has: its own Express server, its own Apollo subgraph, its own resolvers, its own Mongoose models, all connecting to the **same MongoDB instance**.

### Target State (Unified API)

```
              ┌─────────────────────────────────────────┐
              │            BaseGeek API (:8987)          │
              │                                         │
              │  /graphql ── unified Apollo Server       │
              │    ├── notegeek/ (schema + resolvers)    │
              │    ├── bujogeek/ (schema + resolvers)    │
              │    ├── flockgeek/ (schema + resolvers)   │
              │    └── bookgeek/ (schema + resolvers)    │
              │                                         │
              │  /api/auth ── existing auth routes       │
              │  /api/users ── existing user routes      │
              │                                         │
              │  MongoDB connection (shared, singular)   │
              └─────────────────────────────────────────┘

     ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
     │ NoteGeek │  │ BujoGeek │  │ FlockGeek│  │ BookGeek │
     │ Frontend │  │ Frontend │  │ Frontend │  │ Frontend │
     │ (SPA)    │  │ (SPA)    │  │ (SPA)    │  │ (SPA)    │
     └──────────┘  └──────────┘  └──────────┘  └──────────┘
         │              │              │              │
         └──────────────┴──────┬───────┴──────────────┘
                               │
                     basegeek.clintgeek.com/graphql
```

- **No more API Gateway** — single Apollo Server in BaseGeek
- **No more per-app Express backends** for GraphQL (apps keep REST endpoints they need)
- **One MongoDB connection pool** instead of 4+
- **Frontends become pure SPAs** that point their Apollo client at BaseGeek's `/graphql`

---

## Current Subgraph Inventory

| App | Types | Queries | Mutations | Schema File |
|-----|-------|---------|-----------|-------------|
| **NoteGeek** | `Note` | 3 | 3 | `apps/notegeek/backend/graphql/typeDefs.js` |
| **BujoGeek** | `Task`, `JournalEntry`, `TagCount`, `SaveOrderResponse`, `DeleteResponse` | 10 | 11 | `apps/bujogeek/backend/src/graphql/typeDefs.js` |
| **FlockGeek** | `Bird`, `BirdTrait`, `BirdNote`, `HealthRecord`, `EggProduction`, `HatchEvent`, `Pairing`, `Group`, `GroupMembership`, `Location`, `Event`, `LineageCache`, `MeatRun` | 11 | 13 | `apps/flockgeek/backend/src/graphql/typeDefs.js` |
| **BookGeek** | (embedded in 2900-line server.js) | TBD | TBD | `apps/bookgeek/api/src/server.js` |

---

## Step-by-Step Instructions

### Phase 1: Set Up the Unified GraphQL Endpoint in BaseGeek

#### Step 1.1 — Create the Domain Folders

Inside BaseGeek's API, create a folder structure to hold each app's schema and resolvers:

```
apps/basegeek/packages/api/src/graphql/
├── index.js              ← Merges all schemas + resolvers
├── shared/
│   └── typeDefs.js       ← Shared types (DeleteResponse, PaginationInfo, etc.)
├── notegeek/
│   ├── typeDefs.js       ← Note schema (copy from notegeek)
│   ├── resolvers.js      ← Note resolvers (copy from notegeek)
│   └── models/           ← Mongoose models (copy from notegeek)
├── bujogeek/
│   ├── typeDefs.js
│   ├── resolvers.js
│   ├── models/
│   └── services/         ← TaskService, etc.
├── flockgeek/
│   ├── typeDefs.js
│   ├── resolvers.js
│   └── models/
└── bookgeek/
    ├── typeDefs.js
    ├── resolvers.js
    └── models/
```

#### Step 1.2 — Copy Schemas (One App at a Time)

Start with the **simplest app first** (NoteGeek), then work up to the complex ones.

For each app:

1. **Copy the `typeDefs.js`** into the corresponding `graphql/<appname>/` folder
2. **Remove federation directives** — change `extend type Query` to just `type Query` (or merge them). Remove `@key`, `@shareable`, and the `extend schema @link(...)` line since we won't be using federation anymore
3. **Copy the `resolvers.js`** into the same folder
4. **Copy the Mongoose models** the resolvers depend on
5. **Copy any service files** (e.g., BujoGeek's `taskService.js`)

> **Important**: All models already connect to the same MongoDB — you don't need to change connection strings. Just make sure the Mongoose model names don't clash (they shouldn't, since each app uses distinct collection names like `notes`, `tasks`, `birds`, etc.).

#### Step 1.3 — Create the Merged Schema Index

Create `apps/basegeek/packages/api/src/graphql/index.js`:

```js
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';
import { makeExecutableSchema } from '@graphql-tools/schema';

// Import each domain's schema + resolvers
import { typeDefs as noteTypeDefs, resolvers as noteResolvers } from './notegeek/index.js';
import { typeDefs as bujoTypeDefs, resolvers as bujoResolvers } from './bujogeek/index.js';
import { typeDefs as flockTypeDefs, resolvers as flockResolvers } from './flockgeek/index.js';
import { typeDefs as bookTypeDefs, resolvers as bookResolvers } from './bookgeek/index.js';
import { sharedTypeDefs } from './shared/typeDefs.js';

export const typeDefs = mergeTypeDefs([
  sharedTypeDefs,
  noteTypeDefs,
  bujoTypeDefs,
  flockTypeDefs,
  bookTypeDefs,
]);

export const resolvers = mergeResolvers([
  noteResolvers,
  bujoResolvers,
  flockResolvers,
  bookResolvers,
]);
```

> **Install dependency**: `pnpm add @graphql-tools/merge @graphql-tools/schema` in BaseGeek's API package.

#### Step 1.4 — Mount Apollo Server in BaseGeek

In BaseGeek's `server.js`, add the GraphQL endpoint:

```js
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs, resolvers } from './graphql/index.js';
import { optionalUser } from '@geeksuite/user/server';

// ... after existing middleware setup ...

const apolloServer = new ApolloServer({ typeDefs, resolvers });
await apolloServer.start();

// Auth middleware — extracts user from cookie/Bearer token
app.use('/graphql', optionalUser());

app.use('/graphql', expressMiddleware(apolloServer, {
  context: async ({ req }) => ({
    user: req.user || null,
    token: req.headers.authorization || '',
  }),
}));
```

#### Step 1.5 — Fix Resolver User ID Extraction

In each copied resolver, fix the user ID pattern. Currently they all do:

```js
const userId = context.user?.id || '000000000000000000000000';
```

Change this to throw an error or return empty results instead of silently querying a dummy user:

```js
const userId = context.user?.id;
if (!userId) return [];  // or throw new AuthenticationError(...)
```

---

### Phase 2: Update Frontend Apollo Clients

#### Step 2.1 — Update `@geeksuite/api-client`

In `packages/api-client/src/index.js`, change the GraphQL URL logic to always point at BaseGeek:

```js
// Old: const GRAPHQL_API_URI = envUri || '/graphql';
// New: Always point at BaseGeek
const GRAPHQL_API_URI = envUri || 'https://basegeek.clintgeek.com/graphql';
```

> **Alternatively**: Each app can set `VITE_GRAPHQL_API_URL=https://basegeek.clintgeek.com/graphql` in its `.env` file. This is the safer approach since it's per-app configurable.

#### Step 2.2 — Configure CORS on BaseGeek

BaseGeek's CORS config must accept requests from all GeekSuite app origins:

```js
const ALLOWED_ORIGINS = [
  'https://notegeek.clintgeek.com',
  'https://bujogeek.clintgeek.com',
  'https://flockgeek.clintgeek.com',
  'https://bookgeek.clintgeek.com',
  // ... add localhost for dev
];
```

Make sure `credentials: true` is set so cookies (auth tokens) are forwarded.

#### Step 2.3 — Update Each Frontend

For each app, update the env file:

```env
# .env (production)
VITE_GRAPHQL_API_URL=https://basegeek.clintgeek.com/graphql

# .env.local (development)
VITE_GRAPHQL_API_URL=http://localhost:8987/graphql
```

Then **rebuild and redeploy** the frontend.

---

### Phase 3: Remove Per-App Subgraph Code

> **Do this AFTER Phase 2 is working and verified.**

For each app backend:

1. Remove the `graphql/` directory (typeDefs, resolvers)
2. Remove the `setupGeekSuiteSubgraph()` call from `server.js`
3. Remove `@geeksuite/apollo-server-utils` from `package.json`
4. Keep the REST API routes — they may still be needed (auth callbacks, file uploads, etc.)
5. If the app backend has NO remaining REST routes, the backend can be eliminated entirely and the app becomes a pure SPA served by Nginx

---

### Phase 4: Remove the API Gateway

1. Delete `apps/api-gateway/` entirely
2. Remove any `GATEWAY_URL` environment variables from Docker configs
3. Remove the `/graphql-gateway` proxy from any app's `server.js`

---

### Phase 5: Clean Up Shared Packages

1. **`@geeksuite/apollo-server-utils`** — Can be deleted once no app uses `setupGeekSuiteSubgraph()`
2. **`@geeksuite/graphql-config`** — Move `baseTypeDefs` into the new `graphql/shared/typeDefs.js` in BaseGeek, then delete the package
3. **`@geeksuite/api-client`** — Keep! Update it to default to BaseGeek's URL

---

## Migration Order (Recommended)

Do one app at a time, fully verified before moving to the next:

| Order | App | Complexity | Why This Order |
|-------|-----|------------|----------------|
| 1 | **NoteGeek** | Low | Smallest schema (1 type, 3+3 operations). Good proof of concept. |
| 2 | **BujoGeek** | Medium | 2 types, well-structured service layer, already familiar. |
| 3 | **BookGeek** | Medium | Has a subgraph but also heavy REST/Kindle routes that stay in its backend. |
| 4 | **FlockGeek** | High | Largest schema (13 types, 24 operations). Do last since it's the most work. |

---

## Testing Checklist (Per App)

After migrating each app:

- [ ] Open the app in a browser
- [ ] Open DevTools Network tab
- [ ] Confirm GraphQL requests go to `basegeek.clintgeek.com/graphql` (not the app's own endpoint)
- [ ] Confirm data loads correctly (tasks, notes, birds, etc.)
- [ ] Confirm creating a new item works
- [ ] Confirm editing an item works
- [ ] Confirm deleting an item works
- [ ] Confirm auth works (log out, log back in, data is still there)
- [ ] Check browser console for errors

---

## Things to Watch Out For

1. **Type name collisions** — Both BujoGeek and BookGeek might have a `DeleteResponse` type. These need to be unified or namespaced (e.g., `BujoDeleteResponse`). Check for duplicates before merging schemas.

2. **Resolver context.user shape** — When each app was a subgraph, `context.user` came from `optionalUser()` on its own server. Now it comes from BaseGeek. Make sure the user object shape (`id`, `_id`, `userId`, `email`) is consistent. Check `normalizeSsoUser()` in `@geeksuite/user/server/tokenUtils.js`.

3. **Mongoose model registration** — Mongoose requires each model name to be unique. Since each app uses different collection names (`notes`, `tasks`, `birds`) this should be fine, but double-check there are no duplicate `mongoose.model('User', ...)` calls.

4. **Federation directives** — When copying schemas, remove ALL federation directives (`@key`, `@shareable`, `extend schema @link(...)`, `extend type Query`). Use plain `type Query` instead.

5. **CORS credentials** — Cross-origin GraphQL requires `credentials: 'include'` on the client and matching CORS headers on the server. The current `@geeksuite/api-client` doesn't set `credentials: 'include'` on the HTTP link — it only sends a Bearer token from `localStorage`. If apps switch to cross-origin requests, you'll need to ensure the token is passed as a header (it already is).
