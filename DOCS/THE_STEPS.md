# GeekSuite — The Steps

Execution step tracker for the Suite-level documentation consolidation and repository hygiene pass.
Maintained by Sage and the Squad.

---

## 4-Stream Documentation & Backlog Consolidation

```mermaid
flowchart LR
    S1["Stream 1: Canonical Session Files"] --> S2["Stream 2: Backlog Consolidation"]
    S2 --> S3["Stream 3: Historical Archival"]
    S3 --> S4["Stream 4: Root README Alignment"]
    S4 --> S5["Stream 5: App-Level Consolidation"]
```

| Stream | Objective | Status | Owner |
|--------|-----------|--------|-------|
| **Stream 1** | Establish canonical Sage session files & track `DOCS/GRAPHQL.md` | **Complete** | Squad / Sage |
| **Stream 2** | Clean up `SUITE_TODO.md`, create `LANDED_2026_LOGS.md`, archive `TODO_ORDER.md` | **Complete** | Squad / Sage |
| **Stream 3** | Move 16 completed sprint / burn / planning docs to `DOCS/ARCHIVE/` via `git mv` | **Complete** | Squad / Sage |
| **Stream 4** | Update root `README.md` shared packages, tools, and documentation index | **Complete** | Squad / Sage |
| **Stream 5** | Standardize app docs (`flockgeek`, `notegeek`, `basegeek`, `bookgeek`) & prune agent scrapers | **Complete** | Squad / Sage |

---

## Stream 1: Canonical Session Files

Establishing clean, permanent entry points for development sessions and ensuring all key architecture docs are tracked:

- [x] **Step 1.1**: Verify and track `DOCS/GRAPHQL.md` in Git.
  - *Details*: Written 2026-09-12 from live Apollo typeDefs; documents basegeek endpoint, shared types, and 8-module schema map.
- [x] **Step 1.2**: Author `DOCS/THE_CONTEXT.md`.
  - *Details*: Master context covering basegeek SSO, Apollo GraphQL gateway, 8 active apps, shared packages, datastore port maps, and critical invariants (UTC in containers, cookie-first auth, 503 unavailable contract).
- [x] **Step 1.3**: Author `DOCS/THE_PLAN.md`.
  - *Details*: Strategic roadmap covering Night 2 completion, mobile harness status, Chef's open decision items (Q18b CSRF gate, AI resilience), and upcoming engineering passes.
- [x] **Step 1.4**: Author `DOCS/THE_STEPS.md`.
  - *Details*: Active execution tracker for the documentation consolidation program.

---

## Stream 2: Suite Backlog Consolidation

Consolidating `DOCS/SUITE_TODO.md` and archiving `DOCS/TODO_ORDER.md`:

- [x] **Step 2.1**: Author `DOCS/ARCHIVE/LANDED_2026_LOGS.md`.
  - *Details*: Extracted all historical landed sections from `DOCS/SUITE_TODO.md` (2026-08-30 hardening pass, 2026-09-02 contrast sweep, Tiers 1-2, shell grammar, Pass C/E, 2026-09-05 Night 2 burn completions, and GraphQL audit resolutions).
- [x] **Step 2.2**: Prune and focus `DOCS/SUITE_TODO.md`.
  - *Details*: Retain only active, queued, and deferred items. Group into Cross-cutting security, UI/UX, Shared libraries/refactors, Features, Tests & observability, and Nice-to-haves. Include direct link to `LANDED_2026_LOGS.md`.
- [x] **Step 2.3**: Archive `DOCS/TODO_ORDER.md` to `DOCS/ARCHIVE/TODO_ORDER_2026-09.md`.
  - *Details*: All Tiers 1 through 5 are landed/struck. Move via `git mv` to preserve commit history.

---

## Stream 3: Historical Document Archival

Relocating completed sprint, audit, and decision documents from `DOCS/` to `DOCS/ARCHIVE/` via `git mv`:

- [x] `DOCS/BURN_QUEUE.md` -> `DOCS/ARCHIVE/BURN_QUEUE.md`
- [x] `DOCS/BURN_REVIEW.md` -> `DOCS/ARCHIVE/BURN_REVIEW.md`
- [x] `DOCS/BURN_REVIEW_2.md` -> `DOCS/ARCHIVE/BURN_REVIEW_2.md`
- [x] `DOCS/NIGHT2_PLAN.md` -> `DOCS/ARCHIVE/NIGHT2_PLAN.md`
- [x] `DOCS/CLOSEOUT_PLAN.md` -> `DOCS/ARCHIVE/CLOSEOUT_PLAN.md`
- [x] `DOCS/MOBILE_UI_PLAN.md` -> `DOCS/ARCHIVE/MOBILE_UI_PLAN.md`
- [x] `DOCS/THE_UI_UNIFICATION_PLAN.md` -> `DOCS/ARCHIVE/THE_UI_UNIFICATION_PLAN.md`
- [x] `DOCS/UI_UNIFICATION_AUDIT.md` -> `DOCS/ARCHIVE/UI_UNIFICATION_AUDIT.md`
- [x] `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md` -> `DOCS/ARCHIVE/FITNESSGEEK_MODEL_CONSOLIDATION.md`
- [x] `DOCS/STORYGEEK_GATEWAY_DECISION.md` -> `DOCS/ARCHIVE/STORYGEEK_GATEWAY_DECISION.md`
- [x] `DOCS/AIGEEK_ELEVATION_PLAN.md` -> `DOCS/ARCHIVE/AIGEEK_ELEVATION_PLAN.md`
- [x] `DOCS/AI_IDEAS.md` -> `DOCS/ARCHIVE/AI_IDEAS.md`
- [x] `DOCS/AI_SEARCH_PLAN.md` -> `DOCS/ARCHIVE/AI_SEARCH_PLAN.md`
- [x] `DOCS/DASHGEEK_PLAN.md` -> `DOCS/ARCHIVE/DASHGEEK_PLAN.md`
- [x] `DOCS/SHELL_MIGRATION_PLAYBOOK.md` -> `DOCS/ARCHIVE/SHELL_MIGRATION_PLAYBOOK.md`
- [x] `DOCS/DOCKER_CLEANUP.md` -> `DOCS/ARCHIVE/DOCKER_CLEANUP.md`

---

## Stream 4: Root README Alignment

Synchronizing root `README.md` with the current repository reality:

- [x] **Step 4.1**: Update Shared Packages table to accurately reflect all 9 packages:
  - `@geeksuite/auth`, `@geeksuite/user`, `@geeksuite/api-client`, `@geeksuite/ui`
  - `@geeksuite/utils` (date/time helpers)
  - `@geeksuite/logger` (pino HTTP + redaction)
  - `@geeksuite/schemas` (Mongoose shared definitions — all 11 FitnessGeek pairs consolidated)
  - `@geeksuite/crypto-vault` (AES-256-GCM secrets at rest)
  - `@geeksuite/eslint-config` (shared flat config)
- [x] **Step 4.2**: Note developer tooling in `tools/`:
  - `tools/mobile-harness` (Playwright mobile grammar probe)
  - `tools/kill-orphans.mjs` (stale agent process cleanup)
  - `tools/syntax-check.mjs` (AST-level syntax gate)
  - `tools/gql-arg-audit.mjs` (GraphQL query argument auditor)
- [x] **Step 4.3**: Refresh Documentation index with direct links:
  - `DOCS/THE_CONTEXT.md`
  - `DOCS/RUNBOOK.md`
  - `DOCS/CONTEXT.md`
  - `DOCS/GRAPHQL.md`
  - `DOCS/CICD.md`
  - `DOCS/THE_PLAN.md`
  - `DOCS/SUITE_TODO.md`
  - `DOCS/ARCHIVE/`

---

## Stream 5: App-Level Consolidation & Hygiene

Standardizing documentation structure across all active apps:

- [x] **FlockGeek**: Consolidated root duplicate `CONTEXT.md` into `apps/flockgeek/DOCS/CONTEXT.md`; removed root `THE_PLAN.md`; archived 11 legacy phase/status notes into `apps/flockgeek/DOCS/ARCHIVE/`.
- [x] **NoteGeek**: Authored canonical `apps/notegeek/DOCS/CONTEXT.md` documenting GraphQL gateway ownership, TipTap/canvas editors, and auth proxies; archived 7 historical plans into `apps/notegeek/DOCS/ARCHIVE/`.
- [x] **BaseGeek**: Archived 8 sprint/job notes (`AIGEEK_*`, `AUTH_HARDENING_*`, `SSO_CLIENT_*`) into `apps/basegeek/DOCS/ARCHIVE/`.
- [x] **BookGeek**: Archived `THE_PLAN.md` and `DEVICE_BASKET_PLAN.md` into `apps/bookgeek/DOCS/ARCHIVE/`.
- [x] **BujoGeek & FitnessGeek**: Archived `HARDENING_2026-04.md` into respective `DOCS/ARCHIVE/` directories.
- [x] **Workspace Hygiene**: Pruned obsolete third-party agent scraper directories (`.devin/`, `.serena/`, `.zencoder/`).

---

## Verification & Completion Criteria

1. `git status` shows clean `git mv` renames in all `ARCHIVE/` directories.
2. `DOCS/GRAPHQL.md` is tracked in git.
3. All internal markdown links resolve to valid, active files.
4. No duplicate active backlog items exist between `SUITE_TODO.md` and `LANDED_2026_LOGS.md`.
5. Automated scripts provide clean, reproducible execution.
