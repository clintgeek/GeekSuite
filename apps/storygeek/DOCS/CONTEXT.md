# StoryGeek — Context

This file is StoryGeek's project-context note (servers/ports/known-quirks), separate from
`DOCS/CONTINUITY.md` (the continuity-engine architecture — canon, facts, provenance) and
`LOCAL_DEV.md`/`SETUP.md` (dev setup). It didn't exist before 2026-09-05; this is its first
entry.

## Frontend — shared feedback primitives (2026-09-05)

`GeekEmptyState` / `GeekErrorState` / `GeekToastProvider`+`useToast` / `toneForMode` (all
`@geeksuite/ui`) replaced this app's local `Alert`/inline-empty patterns — TODO_ORDER #15/#19
fan-out, the last app in the sequence; full detail in `DOCS/THE_UI_UNIFICATION_PLAN.md` §3a
"Feedback Primitives" ("storygeek — done 2026-09-05, the last app in the fan-out").

`GeekToastProvider` is mounted in `frontend/src/components/Layout.jsx`, inside `GeekShell` and
outside `GeekAppFrame` — new code should call `useToast()` for transient confirmations rather
than adding a local `Snackbar`.

Two load-gated surfaces now split their error into a dedicated state instead of reusing the
same one for both "surface can't open" and "fire-and-forget failure": `StoryList`'s `loadError`
(→ `GeekErrorState` with `onRetry={loadStories}`, in the same slot the empty-shelves
`GeekEmptyState` uses) and `StoryPlay`'s `loadError` (→ `GeekErrorState` with
`onRetry={loadStory}`, replacing what used to be an infinite spinner on a failed load — the
early `if (!story)` return had no error branch at all before this). Bookify's own export
failure (`StoryPlay`'s `exportError`) stays a compact `GeekErrorState` inside the `CodexDialog`
body rather than a toast — an empty dialog with nothing else to show is the primitive's own
"surface is empty because something failed" case, not a fire-and-forget notice; the
clipboard-copy failure that used to share that state now has its own `notify()` call so a
stale successful export never gets clobbered by a copy error.

Left alone (see the plan doc for the full reasoning): `StoryCreation.jsx`'s inline validation
(dialog/form-adjacent — the user is looking straight at the form); `Narration`'s in-story
markdown and the composer's `/recall /checkpoint …` status line (content, not feedback);
`StoryPlay`'s `getDiceColor` `isDark` ternary (distinct per-tier hex values, not a
lighten/darken pair — not the `toneForMode` shape); `theme.js`'s palette-construction `isDark`
ternaries (base-palette authoring); `LoginPage` (public route, outside
`GeekShell`/`GeekToastProvider`, same gap every sibling app left open).

No local `EmptyState`/`ErrorState`/toast component existed here to delete, and no local
`MuiTooltip` override exists to touch for #19's tooltip half.

---
