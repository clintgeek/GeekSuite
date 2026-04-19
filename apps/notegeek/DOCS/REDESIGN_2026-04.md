# notegeek Redesign — April 2026 — "Ink Studio"

Branch: `notegeek-pass` (continuing from the consolidation + hardening
work).

## Why redesign

The post-hardening notegeek is operationally sound, but visually it's
a mid-fidelity Material-UI scaffold dressed with warm-neutral indigo.
It doesn't feel like a finished GeekSuite app. The other four apps
each own a distinct visual identity:

- **bujogeek** — Analog Soul: parchment, Fraunces serif, paper grain.
- **fitnessgeek** — Teal Modern Tracker: DM Serif Display + DM Sans, Stone palette.
- **bookgeek** — Literary Library: slate-and-amber, Libre Baskerville body.
- **basegeek** — Mission Control: warm stone, Geist, amber glow.

Notegeek currently overlaps with bujogeek's territory (warm + Fraunces serif)
without owning the writing-tool space. This redesign claims that space.

## Direction — "Ink Studio"

A writer's-tool aesthetic: cream paper, ink-black type, oxblood accent.
Sister to basegeek (same Geist typography → suite continuity) but
applied to a content-editor paradigm rather than a control panel.

**One-line pitch:** *iA Writer meets a typewriter manual — calm cream
surfaces, sharp Geist typography, oxblood for the few things that
matter, monospace for everything that's data.*

**Family DNA preserved:**
- Geist typeface (matches basegeek — suite consistency)
- Warm-neutral (no blue cast) palette
- 8px MUI spacing grid
- Soft 8–12px corners on interactive surfaces
- 1px subtle borders over heavy shadows

**Notegeek's own signature:**
- Cream paper background instead of stone gray
- **Oxblood** primary accent (#8B2C2A) — owned by no other app
- Mono treatment for ALL metadata (timestamps, tags, type tags,
  word counts) — reinforces "writer's tool"
- Editor surface gets sharper corners (4px) than chrome (8–12px) —
  signals "this is content, not chrome"
- Hairline rules (1px) for separation, not heavy boxes

---

## Design tokens (authoritative — agents read these)

### Color palette

```js
// Light mode — "cream paper"
{
  background: {
    default:   '#FBF7EE',   // cream paper
    paper:     '#FFFCF5',   // surface (cards, dialogs)
    elevated:  '#FFFFFF',   // editor surface (the actual writing area)
  },
  text: {
    primary:   '#1F1C16',   // ink black, warm
    secondary: '#6B6258',   // muted ink
    disabled:  '#A8A09A',   // hairline ink
  },
  divider:    '#E5DDC8',    // hairline rule
  border:     '#D8D0BD',    // 1px component border
  primary: {
    main:  '#8B2C2A',       // oxblood — the sharp accent
    light: '#B5524F',
    dark:  '#5E1A19',
    contrastText: '#FFFCF5',
  },
  // Glow / focus
  glow: {
    ring:   'rgba(139, 44, 42, 0.18)',  // focus ring
    soft:   'rgba(139, 44, 42, 0.05)',  // hover bg
    medium: 'rgba(139, 44, 42, 0.10)',
    border: 'rgba(139, 44, 42, 0.28)',
  },
  // Semantic (muted, not alarmist — writers don't want alarms)
  success: '#5B7A4A',  // moss
  warning: '#A8782F',  // ochre
  error:   '#8B2C2A',  // same as primary — confidence
  info:    '#3D6B7A',  // muted teal
}

// Dark mode — "ink desk lamp"
{
  background: {
    default:   '#16140F',   // warm black, NOT pure black or stone
    paper:     '#1F1C16',
    elevated:  '#26221A',   // editor surface
  },
  text: {
    primary:   '#EDE6D6',   // warm off-white
    secondary: '#998F80',
    disabled:  '#5C544A',
  },
  divider:    '#2D2A24',
  border:     '#3A352D',
  primary: {
    main:  '#C97570',       // oxblood lifted for dark contrast
    light: '#E0A29D',
    dark:  '#8B2C2A',
    contrastText: '#1F1C16',
  },
  glow: {
    ring:   'rgba(201, 117, 112, 0.22)',
    soft:   'rgba(201, 117, 112, 0.06)',
    medium: 'rgba(201, 117, 112, 0.12)',
    border: 'rgba(201, 117, 112, 0.30)',
  },
  success: '#7DA869',
  warning: '#D4A05A',
  error:   '#C97570',
  info:    '#7AA4B0',
}
```

**Note type accent colors** (used as the dot/swatch on note rows;
each note type gets one). Earthy and editorial, not playful:

```js
text:        '#1F1C16',  // ink (default — same as text primary)
markdown:    '#3D6B7A',  // muted teal
code:        '#5B7A4A',  // moss
mindmap:     '#A8782F',  // ochre
handwritten: '#8B2C2A',  // oxblood (matches primary)
```

### Typography

**Fonts loaded:**
```html
<!-- Geist (display + body) — matches basegeek for suite consistency -->
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-sans/style.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-mono/style.css">
<!-- JetBrains Mono — already used; keep for the editor itself -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

**Stack:**
```js
fontFamily:     '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
fontFamilyMono: '"JetBrains Mono", "Geist Mono", ui-monospace, monospace',
```

**Scale (intentionally lean):**
```js
h1:        { fontWeight: 700, fontSize: '2rem',     letterSpacing: '-0.025em', lineHeight: 1.15 },
h2:        { fontWeight: 700, fontSize: '1.5rem',   letterSpacing: '-0.02em',  lineHeight: 1.2 },
h3:        { fontWeight: 600, fontSize: '1.25rem',  letterSpacing: '-0.015em', lineHeight: 1.3 },
h4:        { fontWeight: 600, fontSize: '1.0625rem',letterSpacing: '-0.01em',  lineHeight: 1.35 },
h5:        { fontWeight: 600, fontSize: '0.9375rem',lineHeight: 1.4 },
h6:        { fontWeight: 700, fontSize: '0.6875rem',letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1, fontFamily: 'mono' },
subtitle1: { fontWeight: 500, fontSize: '0.9375rem',lineHeight: 1.5 },
subtitle2: { fontWeight: 600, fontSize: '0.6875rem',letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'mono' },
body1:     { fontWeight: 400, fontSize: '0.9375rem',lineHeight: 1.65 },
body2:     { fontWeight: 400, fontSize: '0.8125rem',lineHeight: 1.6 },
button:    { fontWeight: 600, fontSize: '0.8125rem',textTransform: 'none', letterSpacing: '0.005em' },
caption:   { fontWeight: 500, fontSize: '0.75rem',  fontFamily: 'mono' },  // metadata: mono!
overline:  { fontWeight: 600, fontSize: '0.6875rem',letterSpacing: '0.10em', textTransform: 'uppercase', fontFamily: 'mono' },
```

**Caption uses mono on purpose** — every timestamp, tag prefix, byte
count, etc. uses `<Typography variant="caption">` which is now mono.
This is the most distinctive typographic move; commit to it.

### Spacing + radius + depth

- MUI base spacing: 8px (unchanged — family standard)
- Border radius:
  - `shape.borderRadius: 8` (default)
  - Buttons / inputs: 6px (component override)
  - Cards / dialogs: 10px
  - **Editor surface: 4px** (deliberately sharper — "this is content")
  - Pills / chips: 4px (sharper than other apps; reads as ink stamps)
- Shadows (warm, low-elevation; rely on borders for definition):
  ```js
  shadows: [
    'none',
    '0 1px 2px rgba(31, 28, 22, 0.06)',
    '0 2px 4px rgba(31, 28, 22, 0.08)',
    '0 4px 8px rgba(31, 28, 22, 0.10)',
    '0 8px 16px rgba(31, 28, 22, 0.12)',
    '0 12px 24px rgba(31, 28, 22, 0.14)',
    // ...rest fill with the largest
  ]
  ```
  Dark mode: same scale but `rgba(0, 0, 0, 0.30–0.50)`.

### Component overrides (priorities)

- **MuiButton** — 6px radius, no shadow. Outlined hovers with
  `glow.soft` background + amber-style border. Focus-visible:
  `0 0 0 3px ${glow.ring}`.
- **MuiPaper** — no `backgroundImage` gradient, 1px border in
  `border` token, no default elevation.
- **MuiCard** — 10px radius, 1px border, hover lifts shadow but does
  NOT translateY (we're not bujogeek).
- **MuiAppBar** — flat (elevation 0), 1px bottom border in `divider`,
  background = `paper` not `default`.
- **MuiDrawer.paper** — background `paper`, 1px right border.
- **MuiTextField** — 6px radius, `border` token, focused state gets
  primary border + 3px `glow.ring` shadow. Caret color = primary.
- **MuiChip** — 4px radius (sharp, ink-stamp feel), 22px height, mono
  font (matches caption).
- **MuiListItemButton** — 6px radius, selected state gets 2px-left-
  border in primary + `glow.soft` background (basegeek pattern).
- **MuiTabs.indicator** — 2px primary bar (basegeek pattern).
- **MuiDivider** — 1px, `divider` token. Use these everywhere as
  hairline rules between sections. Editorial.
- **MuiCssBaseline** — caret color primary on inputs / textareas /
  contenteditable. Selection background = `glow.medium`.

---

## Components & ownership

The redesign is split across two parallel agents (Chrome + Content)
plus me (Foundation). All three reference this doc for tokens.

### Foundation (me — already done by the time agents run)

- `frontend/src/theme/createAppTheme.js` — full palette + typography
  + component-overrides rewrite per the tokens above.
- `frontend/index.html` — swap fonts to Geist + JetBrains Mono. Drop
  Plus Jakarta Sans + Fraunces. Update preboot baseline colors.

### Agent A — Chrome

`frontend/src/components/`:

- `Layout.jsx` — restyle the master grid. Background uses `default`,
  not the old warm-paper. Spacing: header 48px, sidebar 240px,
  bottom nav 56px on mobile.
- `Header.jsx` — flat app bar, mono "NOTEGEEK" wordmark in caps with
  letterspacing, search input with `glow.ring` focus, theme toggle
  on the right. Strip any indigo references — accent is now oxblood.
- `Sidebar.jsx` — hairline rule between sections. "New Note" button
  uses primary contained variant with mono caption. Tag tree:
  monospace for tag paths, oxblood active state with left-border
  accent. Add a section heading style that uses overline (mono caps).
- `MobileBottomNav.jsx` — match the new flat aesthetic. Active item
  gets oxblood text + primary glow; inactive items are muted.
- `pages/LoginPage.jsx` + `components/Login.jsx` — match the new
  cream + oxblood look. Login form is centered on a paper card
  with a hairline border. Brand wordmark above. Login button uses
  primary oxblood.
- `pages/RegisterPage.jsx` + `components/Register.jsx` — match.

### Agent B — Content

`frontend/src/pages/` + `frontend/src/components/notes/` +
`frontend/src/components/`:

- `pages/QuickCaptureHome.jsx` — keep the "scratch surface" idea but
  replace the playful card desk with a more editorial layout:
  - Top: greeting in h2 (Geist 700) + note count caption (mono)
  - Quick-capture textarea: looks like a typewriter strip — mono
    font, cream surface, hairline border, no shadow, primary-glow
    on focus. Submit button beside it (oxblood).
  - Type pills row: small mono-text pills, sharp 4px corners, hover
    state, each with its note-type color dot.
  - Recent notes: switch from spatial grid to a tighter editorial
    list (rows with type-color dot, title in body1, snippet in
    caption-mono, tags as mono pills, timestamp in caption-mono
    right-aligned). Featured/desk metaphor goes away — too cute
    for this aesthetic.
- `components/NoteList.jsx` — restyle rows per the editorial pattern
  above. Hairline divider between rows (no card-per-row).
- `components/notes/NoteShell.jsx` — the editor surface is the star.
  - Background: `elevated` (whitest white in light mode; warm
    elevated in dark).
  - Border: 4px radius, 1px border, no shadow.
  - Padding generous (24–32px desktop, 16px mobile) — let the
    content breathe.
  - Sticky header (NoteMetaBar) lives on `paper` not `elevated` so
    the editor surface visually "lifts" above it.
- `components/notes/NoteMetaBar.jsx` — Title input is large
  (h3-equivalent, no underline, transparent bg). Type indicator:
  a small mono pill with the type color dot. Tag chips: 4px sharp
  corners, mono font, hairline border, `glow.soft` bg.
- `components/notes/NoteActions.jsx` — Save = primary contained
  oxblood. Cancel = text button. Delete = error-styled text button
  with confirmation dialog.

### Out of scope (deferred — note in DEFERRED_WORK if applicable)

- Fleshing out Settings page (still empty stub — own pass).
- Lock/encryption UI (the schema fields exist but UX needs design;
  pair with geekLock adoption — see DEFERRED_WORK.md).
- Tag tree collapse/expand (sidebar enhancement).
- Mobile editor full-screen mode.
- Onboarding empty-state illustration.

These can be flagged for a future polish pass.

---

## Verification

After both agents land:

1. `cd apps/notegeek/frontend && npx vite build` — must succeed.
2. Visual smoke: deploy with `./build.sh notegeek`, hit
   `https://notegeek.clintgeek.com`:
   - Login page shows cream + oxblood, Geist typeface.
   - Home page: typewriter strip + editorial recent notes.
   - Open a note: editor surface is sharp-cornered, sticky meta
     bar above with mono type pill.
   - Toggle theme: dark mode is warm-black ink-desk-lamp, not
     pure black.
   - Mobile: bottom nav uses oxblood active, sidebar drawer slides
     over.
3. Confirm metadata is mono throughout (any timestamp / tag /
   type indicator should be JetBrains Mono).

After verification: commit, push, archive the old `/mnt/Media/Docker/notegeek/`
directory (the audit confirmed its data/db is stale).

Risk rating impact: this redesign is purely cosmetic — no security
or operational change. Should not affect the post-hardening rating
(~3/10).
