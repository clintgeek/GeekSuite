# GeekSuite UI Unification Plan

Unify GeekSuite into a cohesive system while preserving distinct app identities.

The goal is not to make every app look identical. The goal is to make every app feel like it belongs
to GeekSuite.

> Unify the rules, not the appearance.
> Standardize the foundation, not the expression.

---

## Goal

A user should be able to move between GeekSuite apps without relearning the basics:

- Buttons behave the same way.
- Inputs focus the same way.
- Navigation follows the same patterns.
- Search, capture, tagging, and focus mode feel universal.
- Each app keeps its own identity, density, and working style.

Distinct apps are allowed to have distinct moods. They are not allowed to invent separate UI laws.

---

## Foundation

The suite-wide foundation lives in shared UI primitives and theme tokens, preferably under
`packages/ui` and the shared MUI theme used by each app.

Apps may define app-specific accent colors and domain-specific layouts, but must inherit:

- Typography scale
- Spacing scale
- Neutral colors
- Semantic colors
- Component primitives
- Interaction states
- Navigation behavior

If an app needs to diverge, document the reason before implementation. Unexplained divergence is
design debt.

---

## 1. Global Design System

### Typography

Define one type scale used across every app.

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| H1 | 28px / 2rem | 600 | Primary page titles |
| H2 | 24px / 1.5rem | 600 | Major sections |
| H3 | 20px / 1.25rem | 600 | Panel and subsection headings |
| Body | 14px / 0.875rem | 400 | Default interface text |
| Caption | 12px / 0.75rem | 400 | Metadata, labels, helper text |

Rules:

- Use the same font family everywhere: `"Roboto", "Helvetica", "Arial", sans-serif`.
- Use `"Roboto Mono", monospace` only for code, logs, technical IDs, or monospaced data.
- Headings use weight `600`.
- Body text uses weight `400`.
- Interactive labels may use weight `500`.
- Do not create app-specific type scales.

### Spacing

Use one spacing scale across the suite:

| Token | Value |
|-------|-------|
| 1 | 4px |
| 2 | 8px |
| 3 | 12px |
| 4 | 16px |
| 6 | 24px |
| 8 | 32px |

Rules:

- No arbitrary spacing values.
- All component padding, gaps, margins, and layout gutters align to this scale.
- Use `theme.spacing()` or shared spacing tokens instead of raw numbers where possible.
- App density may vary, but it must vary by choosing different values from the same scale.

### Color System

Define shared suite colors:

| Role | Token | Value |
|------|-------|-------|
| Primary | `primary.main` | `#6098CC` |
| Primary Light | `primary.light` | `#7BB3F0` |
| Primary Dark | `primary.dark` | `#2E5C8A` |
| Background | `background.default` | `#F5F5F5` |
| Paper | `background.paper` | `#FFFFFF` |
| Text Primary | `text.primary` | `#212121` |
| Text Secondary | `text.secondary` | `#757575` |
| Border | `divider` | `rgba(0, 0, 0, 0.12)` |
| Success | `success.main` | `#4CAF50` |
| Warning | `warning.main` | `#FFC107` |
| Error | `error.main` | `#B00020` |
| Info | `info.main` | `#2196F3` |

Rules:

- Every app uses shared neutrals and semantic colors.
- Every app may define one accent color for domain identity.
- Accent colors may highlight app-specific surfaces, icons, charts, or selected states.
- Accent colors must not replace semantic meaning.
- Error, warning, success, and info must mean the same thing everywhere.

---

## 2. Component Consistency

Standardize these primitives across all apps.

### Buttons

All buttons share:

- Border radius: `8px`
- Minimum click target: `44px x 44px`
- Font size: Body
- Font weight: `500`
- Text transform: none
- Horizontal padding from the spacing scale
- Hover: subtle overlay, same intensity across apps
- Active: stronger overlay or slight pressed state
- Disabled: reduced opacity with no hover behavior
- Loading: consistent spinner size and placement

Apps may vary button color by intent, not by local style preference.

### Inputs

Search fields, text fields, selectors, and editable controls share:

- Height
- Border radius: `8px`
- Padding
- Placeholder treatment
- Focus ring
- Error treatment
- Disabled treatment

Search is a normal input pattern, not a custom one-off widget per app.

### Cards and Panels

Cards and panels share:

- Border radius: `8px`
- Background: shared paper token
- Border or shadow style from shared theme
- Internal spacing from the spacing scale
- Hover elevation only when the surface is interactive

Rules:

- Do not nest visual cards inside visual cards.
- Use panels for working surfaces.
- Use cards for repeated items, summaries, or discrete objects.

### Tags and Chips

Tags and chips share:

- Height
- Padding
- Border radius: `4px`
- Font size: Caption
- Consistent close/remove affordance when removable
- Consistent selected state when selectable

Tags are part of the universal "Thing" model and should look structurally identical across apps.

---

## 3. Navigation Rules

### Sidebar

The sidebar must behave consistently everywhere.

Shared rules:

- Desktop width: `220px`
- Mobile behavior: temporary drawer or equivalent overlay
- Active state: same visual structure across apps
- Item spacing: shared spacing scale
- Icon size: shared icon token
- Collapsed/hidden behavior: consistent across apps

The sidebar contents may differ by app. The sidebar behavior may not.

### Top Bar

Top bars must use consistent placement for:

- User profile
- Settings
- Search, when present
- App-level actions
- Global capture entry point

Shared rules:

- Height: `60px`
- Keep global/account actions in predictable positions.
- Keep app-specific actions grouped separately from global controls.
- Do not move profile/settings/search arbitrarily between apps.

### Routing Feel

Transitions between views should feel identical across apps.

Rules:

- Use one transition timing curve and duration.
- Avoid app-specific page animation styles unless explicitly justified.
- Preserve focus after navigation.
- Preserve scroll behavior intentionally, not accidentally.

---

## 4. Interaction Model

### Focus States

All interactive elements use the same visible focus treatment:

- `2px` outline
- Primary color
- `2px` offset
- High contrast against the surrounding surface

No invisible focus. No app-specific focus experiments.

### Hover States

Hover behavior should share the same intensity and vocabulary:

- Buttons: subtle overlay
- Icon buttons: background highlight
- Cards: elevation increase only if clickable
- Tags: slight background/elevation change
- Links: underline or agreed shared treatment

### Click Targets

Interactive controls must use consistent sizing:

- Minimum target: `44px x 44px`
- Compact data views may visually compress content, but the actual target must remain usable.
- No tiny icon-only actions without tooltip and accessible label.

### Keyboard Behavior

If keyboard shortcuts are implemented, they must follow a suite-wide philosophy:

- Global shortcuts are reserved for global actions.
- App shortcuts are scoped to app working surfaces.
- Escape closes transient UI before leaving workflows.
- Slash or command-style search behavior should be consistent if introduced.

---

## 5. Mental Model Unification

Everything in GeekSuite is a **Thing**.

Examples:

- Note = Thing
- Task = Thing
- Book = Thing
- Metric = Thing
- Flock record = Thing
- Story document = Thing

Each app specializes in one or more types of Thing, but common operations should feel universal:

- Tagging
- Search
- Capture
- Opening/detail view
- Editing
- Archiving or completing where applicable

This does not require one shared database model for every object. It does require a shared user
model of how objects behave.

### Thing Interface Expectations

Where a Thing appears, the user should usually be able to identify:

- Title or primary label
- Type
- Source app
- Timestamp or relevant date
- Tags
- Status, if applicable
- Primary action

---

## 6. Global Features

### Global Search

GeekSuite needs global search across all apps.

Requirements:

- Search all supported Thing types.
- Use a unified result format.
- Show source app clearly.
- Support app-specific result previews without changing the shared result skeleton.
- Route users into the source app's canonical detail view.

Unified result format:

| Field | Purpose |
|-------|---------|
| `id` | Stable Thing ID |
| `type` | Thing type: note, task, book, metric, etc. |
| `app` | Source app |
| `title` | Primary display label |
| `summary` | Short preview |
| `tags` | Shared tag display |
| `updatedAt` | Recency |
| `url` | Canonical route |

### Quick Capture

GeekSuite needs quick capture accessible everywhere.

Requirements:

- Minimal UI.
- Available from the top bar and keyboard shortcut once shortcuts are standardized.
- Can create at least:
  - Note
  - Task
  - Item
- Lets users choose target app/type without leaving the current context.
- Uses shared input, button, focus, and tag primitives.

Quick capture must feel like a suite feature, not an app-specific modal copied eight times.

---

## 7. Focus Mode

Every app must support **Focus Mode**.

Focus Mode removes all non-essential UI and leaves only the primary working surface.

Required behavior:

- Hide sidebar.
- Hide top chrome.
- Preserve the current route and working state.
- Provide a predictable way to exit.
- Avoid layout jump where possible.
- Persist preference per app or per user, according to the shared user-settings model.

Focus Mode is high priority because it gives each app a calmer working surface without breaking
suite consistency.

---

## 8. Density Rules

Apps may differ in density.

Examples:

- NoteGeek: low density, calm writing and thinking surfaces
- FitnessGeek: high density, data-rich dashboards and tables
- BookGeek: visual grid and cover-forward browsing
- BujoGeek: structured planning density
- StartGeek: launcher density with glanceable widgets

Allowed variation:

- Number of visible panels
- Information density
- App accent color
- Data visualization style
- Domain-specific empty states
- Layout emphasis

Non-negotiable foundation:

- Same spacing scale
- Same typography system
- Same component primitives
- Same focus and hover rules
- Same global features
- Same navigation behavior

---

## 9. What NOT to Share

Over-extraction is as harmful as under-extraction. The rule is simple:

> DRY the rules. Not the screens.

If a component answers **"how should this look/behave?"** → it belongs in `packages/ui`.

If a component answers **"what is this thing?"** → it belongs in the app.

### Do Not Share Page Layouts

Each app has fundamentally different working surfaces. These must not be extracted into shared packages:

- `GeekDashboardLayout` — does not exist
- `GeekListPage` — does not exist
- `GeekDetailPage` — does not exist
- `GeekGridPage` — does not exist

A fitness dashboard is not a notes editor. A book grid is not a bullet journal. Shared layouts would force artificial structural parity between surfaces that have nothing in common.

Apps own their layouts. The shared system owns the primitives that compose them.

### Do Not Share Domain UI Components

Domain-specific components belong to the app that owns the domain:

| Component | Belongs in |
|-----------|------------|
| `TaskCard` | `bujogeek` |
| `BookTile` | `bookgeek` |
| `WorkoutPanel` | `fitnessgeek` |
| `NoteCard` | `notegeek` |
| `MetricWidget` | `fitnessgeek` |
| `FlockRecord` | its app |

These are domain expressions, not primitives. Putting them in `packages/ui` would couple every app to every other app's domain model.

### The Litmus Test

Before extracting anything to `packages/ui`, ask:

1. **Would every app use this?** If no — it stays in the app.
2. **Does it encode a rule (size, focus, spacing, behavior)?** If yes — it belongs shared.
3. **Does it encode domain knowledge (tasks, books, workouts)?** If yes — it stays in the app.
4. **Would sharing it force layout or content decisions on other apps?** If yes — do not share it.

The danger is not failing to extract enough. The danger is extracting too much and locking every app into a shared structural decision that only one app needed.

---

## 10. Anti-Patterns

Do not allow:

- Different button styles per app
- Different spacing systems
- Different input field designs
- Inconsistent sidebar behavior
- Different typography logic
- Custom focus states per app
- App-specific global search result shapes
- App-specific quick capture copies
- Semantic colors used as decoration
- Hidden keyboard focus
- Tiny click targets

These are not harmless personality quirks. They are product fragmentation.

---

## 11. Success Criteria

The UI unification work is successful when a user can:

- Instantly recognize any app as part of GeekSuite.
- Never relearn basic interactions.
- Feel different apps serve different purposes.
- Never feel like they switched to a different product.
- Use search and capture from anywhere.
- Enter focus mode in every app.
- Trust tags, chips, buttons, fields, panels, and navigation to behave consistently.

---

## Implementation Plan


### Phase 1: Token Audit

- Inventory each app's typography, spacing, colors, buttons, inputs, cards, tags, sidebar, and top bar.
- Identify hardcoded values that should become theme tokens.
- Record allowed app accent colors.
- Record unauthorized design drift.

### Phase 2: Shared Theme and Primitive Lockdown

- Move canonical tokens into the shared theme.
- Expose shared primitives from `packages/ui`.
- Standardize Button, Input, Card/Panel, Tag/Chip, Sidebar, TopBar, and FocusMode APIs.
- Add usage documentation with examples.

### Phase 3: App-by-App Alignment

- Convert each app to shared primitives.
- Preserve app-specific identity through accent color, layout density, and domain surfaces.
- Remove duplicated local component styling when shared primitives cover the need.
- Verify mobile and desktop layouts.

### Phase 4: Global Search and Quick Capture

- Define the suite-wide Thing result contract.
- Implement a global search entry point.
- Add per-app result providers.
- Implement one shared quick capture surface.
- Route captured Things into the correct app/service.

### Phase 5: Focus Mode

- Add a shared Focus Mode state and UI behavior.
- Wire each app's shell to hide sidebar and top chrome.
- Persist preference consistently.
- Verify route/state preservation.

### Phase 6: Regression Guardrails

- Add visual or component tests for shared primitives where practical.
- Add linting or review checklist items for raw spacing/color usage.
- Add accessibility checks for focus, contrast, and click target size.
- Update `DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md` once implementation details are finalized.

---

## Review Checklist

Before merging UI work, verify:

- Typography uses the shared scale.
- Spacing uses the shared scale.
- Colors use shared tokens or documented app accent tokens.
- Buttons, inputs, cards, panels, tags, sidebars, and top bars use shared primitives.
- Focus and hover behavior match the suite standard.
- Click targets are at least `44px x 44px`.
- App identity comes from accent, density, and domain layout, not custom fundamentals.
- Focus Mode still works.
- Global search and quick capture entry points remain reachable.

---

## Blunt Summary

Unify the rules, not the appearance.

Standardize the foundation, not the expression.

The apps should feel like siblings, not clones. And definitely not strangers.
