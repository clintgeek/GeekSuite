# GeekSuite UI Unification Audit

Phase 1 execution artifact for [`THE_UI_UNIFICATION_PLAN.md`](THE_UI_UNIFICATION_PLAN.md).

Generated from a four-lane squad audit:

- Shared foundation packages
- NoteGeek, BuJoGeek, StoryGeek
- FitnessGeek, FlockGeek
- BaseGeek, BookGeek, StartGeek

---

## Context Notes

The root files required by the local agent instructions were not present:

- `DOCS/THE_CONTEXT.md`
- `DOCS/THE_PLAN.md`
- `DOCS/THE_STEPS.md`

The audit used:

- `DOCS/CONTEXT.md`
- `DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md`
- `DOCS/THE_UI_UNIFICATION_PLAN.md`

The requested `ui-design` skill path was also not present in this environment:

- `/home/clint/.claude/skills/ui-design.md`

---

## Shared Foundation

### Current State

`@geeksuite/ui` was previously limited to `LoginSplash`. It did not provide the shared tokens,
theme factory, primitives, shell components, global search entry point, quick capture entry point,
or focus mode API required by the unification plan.

`@geeksuite/user` already provides useful suite-wide preference infrastructure:

- Theme preference
- Cookie sync
- Remote preference sync
- `html[data-theme]`
- Vite theme preboot

### First Implementation Slice

The safe foundation path is:

- Add shared design tokens.
- Add a shared MUI theme factory.
- Add low-risk primitive wrappers.
- Add shell primitives.
- Add feature entry stubs for global search, quick capture, and focus mode.
- Migrate apps incrementally.

Do not start by rewriting every app theme. That would spread the same decision across eight
surfaces and make review noisy.

---

## Cross-App Drift Summary

### Typography

The plan requires one type family and scale. Current apps diverge heavily:

- BaseGeek: Geist / Geist Mono
- NoteGeek: expressive editorial stack
- BuJoGeek: Source Sans / Fraunces
- FitnessGeek: DM Sans / DM Serif / JetBrains Mono
- FlockGeek: IBM Plex / DM Serif
- StoryGeek: custom storybook/fantasy theme fonts
- BookGeek: Inter / serif CSS stack
- StartGeek: Geist via Tailwind/CSS

### Layout Constants

The plan requires:

- Sidebar: `220px`
- Top bar: `60px`

Common drift:

- Several apps use `240px` sidebars.
- FitnessGeek uses `232px`.
- Mobile drawers often use `280px`.
- Top bars commonly use `56px`, `64px`, or no shared top bar at all.

### Component Primitives

Common drift:

- Button radius varies from `6px` to `12px`.
- Button heights often fall below the `44px` click target.
- Text field focus states and radii vary by app.
- Cards use `10px`, `12px`, `14px`, `18px`, and Tailwind rounded classes.
- Chips vary between `4px`, `6px`, pill radius, `22px`, `24px`, and `28px` heights.
- Some themes apply hover lift broadly to non-clickable cards.

### Global Features

Current state:

- Global search does not exist.
- Suite quick capture does not exist.
- Focus Mode does not exist as an app-shell behavior.

Local equivalents exist in places:

- NoteGeek has note search and note quick capture.
- BuJoGeek has mature quick add and shortcut behavior.
- FitnessGeek has local food/weight/BP quick-add patterns.
- FlockGeek has local harvest entry and page filters.
- BookGeek has search/filter and add-book flows.
- StoryGeek has new story creation, but no search or quick capture pattern.
- StartGeek has launcher affordances, but no suite global controls.

---

## App Notes

### BaseGeek

BaseGeek is a good first app migration candidate because it already uses MUI.

Drift:

- Local dark amber/stone theme.
- Geist typography.
- Sidebar `240px`, collapsed `68px`.
- Mobile top bar `56px`.
- Custom semantic colors and radii.
- No global search, quick capture, or focus mode shell entry.

First pass:

- Replace the local theme with `createGeekSuiteTheme({ mode: 'dark', accent })`.
- Preserve amber as accent only.
- Normalize sidebar/topbar dimensions.
- Add shared feature-entry actions to the top bar.

### NoteGeek

NoteGeek has useful local search and quick capture patterns but drifts in typography, shell
dimensions, theme colors, and component primitives.

First pass:

- Normalize shell constants.
- Preserve calm writing density.
- Route note search/capture into shared primitives later.

### BuJoGeek

BuJoGeek is structurally mature and already centralizes some constants.

Drift:

- `240px` sidebar.
- `56px` top bar.
- Mature quick add is app-local.
- Focus Mode is absent.

First pass:

- Normalize constants.
- Keep quick add behavior.
- Add shared shell focus mode after constants are stable.

### StoryGeek

StoryGeek has the largest expressive theme drift.

First pass:

- Do not flatten the writing identity.
- Normalize primitives and shell behavior first.
- Add search/capture later because the app lacks equivalent entry points.

### FitnessGeek

FitnessGeek is structurally ready for a theme and shell pass but has many local quick-add variants.

First pass:

- Normalize MUI theme primitives.
- Set drawer width to `220px`.
- Set top bar to `60px`.
- Keep data-dense layouts.

### FlockGeek

FlockGeek has a strong local "Field Ledger" theme.

First pass:

- Keep amber/field accent only.
- Move typography, neutrals, semantic colors, radii, and interaction states to suite rules.
- Normalize sidebar/topbar behavior.

### BookGeek

BookGeek is the heaviest migration because it uses standalone CSS/Tailwind-style classes instead
of MUI primitives.

First pass:

- Do not rewrite the whole app at once.
- Wrap the app in shared theme/shell.
- Replace top bar, sidebar, buttons, inputs, tags, and modal surfaces incrementally.

### StartGeek

StartGeek should stay launcher-like. Do not force a sidebar onto it.

First pass:

- Add suite global controls if StartGeek acts as the home surface.
- Fix visible focus on dock controls.
- Mirror shared tokens intentionally if Tailwind remains the implementation path.

---

## Recommended Migration Order

1. Shared `@geeksuite/ui` foundation.
2. BaseGeek MUI theme/shell proof case.
3. BuJoGeek and FitnessGeek constants and primitive alignment.
4. NoteGeek and FlockGeek identity-preserving theme alignment.
5. StoryGeek shell and primitive alignment.
6. BookGeek incremental CSS-to-shared-shell pass.
7. StartGeek lightweight focus/token/global-control alignment.

---

## Non-Negotiables For Future Passes

- Shared typography scale.
- Shared spacing scale.
- Shared neutral and semantic colors.
- App accent colors only for identity.
- `220px` sidebar where a sidebar exists.
- `60px` top bar where top chrome exists.
- `44px x 44px` minimum click target.
- Visible focus everywhere.
- No app-specific quick capture or global search result format.
- Focus Mode must hide non-essential shell chrome and preserve route state.

