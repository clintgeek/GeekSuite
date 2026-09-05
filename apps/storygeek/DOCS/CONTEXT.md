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

## Known quirk — the StoryPlay test stall (root-caused 2026-09-05)

`StoryPlay.test.jsx` was `describe.skip`ped for a day because every interaction test pinned
vitest/jsdom at 60-98% CPU. Not a jsdom/GeekSheet/transition problem at all: it was a genuine
infinite render loop. `loadStory()` ends with `setMessages(storyData.events.map(...))`, a fresh
array on every call, so the component always re-renders after a load; the effect that calls it
was keyed on the whole `user` object (`}, [storyId, user])`), and the test's
`vi.mock('@geeksuite/auth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))` minted a
new object on every call — so each load caused a render, each render a new `user` identity, and
each identity another load. (`StoryList` has the same effect shape and survived only by
accident: it calls `setStories(response.data)` with the same object reference, so React bails
out of the re-render.)

Fixed in `StoryPlay.jsx` by keying the effect on `user?.id`, and in the test by returning one
frozen auth object from the mock factory. Production was never affected — `AuthProvider`
`useMemo`s its context value — but the loop was one identity change away. Rule of thumb for
this repo: **effects depend on `user?.id`, never on `user`**, and an auth mock must return the
same reference every call.
