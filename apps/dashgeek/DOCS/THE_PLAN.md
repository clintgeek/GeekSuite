# DashGeek — Product Spec

> The GeekSuite command center. One screen to rule them all.

**URL:** `dash.clintgeek.com`
**Status:** Planning
**Last Updated:** 2026-04-04

---

## Vision

DashGeek is a unified dashboard that surfaces data from every GeekSuite app in one place. It has no database of its own — it reads from all app databases through BaseGeek's unified GraphQL API. It answers one question: *"What's going on across my world right now?"*

---

## Architecture

```
dash.clintgeek.com
  │
  ├── Frontend (React + Vite)
  │     ├── Uses @geeksuite/ui for shared components
  │     ├── Uses @geeksuite/api-client for Apollo Client
  │     └── SSO via BaseGeek (geek_token cookie on .clintgeek.com)
  │
  └── /graphql → nginx proxy → BaseGeek (192.168.1.17:8987)
        │
        └── basegeek/packages/api/src/graphql/dashboard/
              ├── typeDefs.js   (cross-app query types)
              └── resolvers.js  (fan-out queries across app DBs)
```

**Key constraints:**
- No new backend service — BaseGeek serves everything
- No new database — dashboard resolvers query existing app DBs via `getAppConnection()`
- Same deployment pattern as all GeekSuite apps (Docker, nginx, SSO)
- Read-heavy by design — DashGeek never writes to other apps (except via explicit cross-app actions like "push to notes")

---

## Four Pillars

### 1. Cross-App Dashboard

The home screen. A single-page daily snapshot pulling from every app.

**Widgets:**
| Widget | Source App | Data |
|--------|-----------|------|
| Today's Tasks | BujoGeek | Open tasks, completed count, streaks |
| Recent Notes | NoteGeek | Last 5 updated notes, pinned notes |
| Reading Progress | BookGeek | Current book, page/chapter progress, reading streak |
| Nutrition Today | FitnessGeek | Calories, macros vs goals, meals logged |
| Weight Trend | FitnessGeek | Last 7 entries, trend direction |
| Flock Status | FlockGeek | Active bird count, today's egg production, active pairings |

**Layout:**
- Responsive grid — cards rearrange based on screen size
- Each widget is a self-contained component with its own GraphQL query
- Widgets handle their own loading/error states gracefully (one failing app doesn't break the page)
- User can eventually reorder/hide widgets (stored in BaseGeek user preferences)

**GraphQL approach:**
- Individual widget queries (not one giant query) for independent loading and caching
- Example: `dashBujoSummary(date: "2026-04-04")` returns today's task stats
- Example: `dashNutritionSummary(date: "2026-04-04")` returns today's macro totals

### 2. Universal Search

A single search bar that queries across all GeekSuite apps.

**Behavior:**
- User types a query → results grouped by app
- Each result links directly to the item in its native app
- Results show app icon, item type, title, and a snippet/preview

**Search targets:**
| App | Searchable Items |
|-----|-----------------|
| NoteGeek | Note title, content |
| BujoGeek | Task/entry content |
| BookGeek | Book title, author, notes |
| FitnessGeek | Food names, meal names |
| FlockGeek | Bird name/tag, group name, location name |

**GraphQL:**
```graphql
type SearchResult {
  id: ID!
  app: String!
  type: String!
  title: String!
  snippet: String
  url: String!
  updatedAt: Date
}

type Query {
  dashSearch(query: String!, apps: [String], limit: Int): [SearchResult!]!
}
```

**Implementation:**
- Resolver fans out to each app's DB with text search / regex
- Results merged, sorted by relevance (exact match > partial > fuzzy)
- Optional `apps` filter to scope search to specific apps
- AI classification as a future enhancement (route ambiguous queries)

### 3. AI Assistant

A chat interface powered by BaseGeek's AI proxy, with context awareness across all apps.

**How it works:**
1. User asks a question in the chat panel
2. DashGeek's resolver gathers relevant context from app DBs based on the question
3. Context + question sent to BaseGeek's `/openai/v1/chat/completions`
4. AI response returned with citations to source data

**Example interactions:**
- "How's my week going?" → Pulls bujo completion rate, weight trend, reading progress, egg production, meals logged. AI synthesizes into a narrative summary.
- "What should I eat for dinner?" → Pulls today's logged meals, remaining macro budget, favorite foods. AI suggests a meal.
- "When did my egg production drop?" → Pulls egg data, correlates with flock changes. AI identifies patterns.
- "Summarize my notes about gardening" → Searches notes, returns AI-generated summary.

**GraphQL:**
```graphql
type AIChatMessage {
  role: String!
  content: String!
  sources: [AISource]
}

type AISource {
  app: String!
  type: String!
  id: ID!
  title: String!
}

type Query {
  dashAIChat(messages: [AIChatInput!]!): AIChatMessage!
}
```

**Context gathering strategy:**
- Parse the user's question to determine which apps are relevant
- Pull lightweight summaries from those apps (not full records)
- Include user's goals/settings for personalization
- Keep context under token limits — summarize, don't dump

**Conversation history:**
- Stored in localStorage (no new DB table)
- Last N messages sent with each request for continuity
- Clear chat button to reset context

### 4. Weekly Digest

An auto-generated summary of the past week across all apps.

**Content:**
| Section | Data |
|---------|------|
| Productivity | Tasks completed/created ratio, streaks, notable completions |
| Reading | Pages/chapters read, books finished, current book progress |
| Health & Fitness | Weight change, avg daily calories, macro adherence, exercise |
| Flock | Total eggs, hatch events, bird status changes |
| Notes | New notes created, most active tags |
| Highlights | AI-generated "best of" — biggest wins, patterns, suggestions |

**Delivery:**
- Phase 1: A `/digest` page in DashGeek that generates on visit
- Phase 2: Scheduled generation (cron via BaseGeek) stored for quick access
- Phase 3 (optional): Email delivery

**GraphQL:**
```graphql
type WeeklyDigest {
  weekStart: Date!
  weekEnd: Date!
  bujo: BujoDigest
  books: BookDigest
  fitness: FitnessDigest
  flock: FlockDigest
  notes: NoteDigest
  aiSummary: String
}

type Query {
  dashWeeklyDigest(weekStart: Date): WeeklyDigest!
}
```

---

## Implementation Phases

### Phase 1 — Foundation
- [ ] Project scaffolding (Vite + React, same as other apps)
- [ ] Docker setup (Dockerfile, docker-compose.yml)
- [ ] Nginx config (dash.clintgeek.com → container, /graphql → BaseGeek)
- [ ] SSO integration (same @geeksuite/api-client pattern)
- [ ] Dashboard layout with placeholder widgets
- [ ] BaseGeek dashboard resolvers (typeDefs + resolvers skeleton)

### Phase 2 — Dashboard Widgets
- [ ] BujoGeek widget (today's tasks)
- [ ] NoteGeek widget (recent notes)
- [ ] BookGeek widget (current reading)
- [ ] FitnessGeek widget (today's nutrition + weight trend)
- [ ] FlockGeek widget (flock status + eggs)
- [ ] Widget error boundaries (graceful per-widget failure)

### Phase 3 — Universal Search
- [ ] Search bar UI component
- [ ] dashSearch resolver with fan-out queries
- [ ] Results display grouped by app
- [ ] Deep links to source items in native apps

### Phase 4 — AI Assistant
- [ ] Chat panel UI
- [ ] Context gathering resolvers
- [ ] Integration with BaseGeek AI proxy
- [ ] Source citations in responses
- [ ] Conversation history (localStorage)

### Phase 5 — Weekly Digest
- [ ] Digest page UI
- [ ] Per-app digest resolvers
- [ ] AI summary generation
- [ ] Historical digest access

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend | React + Vite | Same as all GeekSuite apps |
| UI Library | @geeksuite/ui + MUI | Consistent look and feel |
| GraphQL Client | @geeksuite/api-client | Shared Apollo Client with SSO |
| Styling | Emotion (via MUI) | Already in the ecosystem |
| State | Apollo Cache + React state | No Zustand needed — read-heavy app |
| Backend | BaseGeek (existing) | No new service |
| Auth | BaseGeek SSO (geek_token) | Already works across .clintgeek.com |
| AI | BaseGeek AI proxy | Existing /openai/v1/chat/completions |

---

## Design Notes

- **Color theme:** Distinct from other apps but clearly GeekSuite family. Consider a neutral/dark palette since it aggregates all app colors.
- **Navigation:** Minimal. Dashboard is the home. Search is always accessible (top bar or Cmd+K). AI assistant is a slide-out panel. Digest is a single page.
- **Mobile:** Must work on mobile. Widgets stack vertically. Search and AI are full-screen on mobile.
- **Performance:** Widgets load independently. Stale data is acceptable for a few seconds (StaleWhileRevalidate for widget queries). Search and AI are always NetworkOnly.

---

## Open Questions

1. Should widgets be configurable (show/hide, reorder) from day one, or is a fixed layout fine for v1?
2. Should the AI assistant have "quick actions" (e.g., "Log this meal", "Create a note") or stay read-only in v1?
3. Should the weekly digest compare against previous weeks (trends)?
4. Do we want a notification center in DashGeek that aggregates alerts from all apps?
