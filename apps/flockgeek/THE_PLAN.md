# FlockGeek – THE_PLAN

_Last updated: 2025-11-28_

This is a living implementation plan. We start with the dashboard, then expand to other improvements as we learn more.

---

## Phase 1 – Dashboard modernization

**Goal:** Make the FlockGeek Home/Dashboard feel consistent with the BabelGeek and photoGeek dashboards while staying true to FlockGeek’s data.

### 1.1 – Understand existing dashboards

- Inspect BabelGeek dashboard implementation (frontend and any specific backend endpoints it uses).
- Inspect photoGeek dashboard implementation.
- Locate the current FlockGeek Home/Dashboard route/component and API calls.

### 1.2 – Define FlockGeek dashboard design

- List the key cards/metrics we want (e.g., counts, recent activity, shortcuts).
- Decide layout (grid, sections, top summary strip, etc.).
- Note any data that FlockGeek doesn’t yet expose and where it would come from.
- Treat `/` (Home) as the primary operational dashboard, similar to BabelGeek/photoGeek. Show a greeting, CTA buttons for core flock actions (log eggs, view birds/groups), and highlight SummaryCards/RecentActivity/QuickActions.
- Keep `/dashboard` as a secondary/system status surface for now; reuse components once Home stabilizes.
- Reuse existing `useHomeData` hook for initial data so iteration stays frontend-only. Extend backend only if new metrics (e.g., egg trends) are needed later.

### 1.3 – Backend support (if needed)

- Identify any missing backend endpoints required for the new dashboard.
- Add or extend endpoints in `backend/` without breaking existing clients.
- Add basic tests/logging as needed.

### 1.4 – Frontend implementation

- Implement the new Home/Dashboard UI in `frontend/`.
- Wire up data fetching to the relevant backend endpoints.
- Keep styles consistent with the rest of FlockGeek and reusable where possible.

### 1.5 – QA and polish

- Verify the dashboard in local dev (happy path, empty states, and error states).
- Adjust copy/layout based on how it feels in use.
- Capture any follow-up improvements into the “Later” section below.

---

## Phase 2 – Later improvements (parking lot)

- TBD as we learn more about FlockGeek’s current UX and performance.
