# GeekSuite Shell Migration Playbook

How to apply the proven BuJoGeek skeleton to each remaining app.

> BuJoGeek is the reference implementation. When in doubt, look there.

---

## The Target Skeleton

Every app ends up with this structure. No more, no less.

```
App.jsx
└─ <ThemeProvider>           ← app's own (wraps @geeksuite/user or local)
   └─ <FocusModeProvider>    ← from @geeksuite/ui  [NEW]
      └─ <MuiThemeProvider theme={createXxxTheme(mode)}>
         └─ <CssBaseline />
            └─ <Router>
               └─ <AppShell>
                  └─ <GeekShell sidebar={<Sidebar />} topBar={<TopBar />}>
                     ├─ [mobile drawer if app has one]
                     ├─ <GeekAppFrame sx={{ pb: ... }}>
                     │    └─ {children / Routes}
                     └─ [mobile tab bar if app has one]
```

```
theme/theme.js
└─ createXxxTheme(mode)
   └─ createGeekSuiteTheme({ mode, accent, overrides })  ← composes shared
      └─ app identity lives in overrides only
```

---

## Rules Before You Start

1. **Do not touch BookGeek or StartGeek yet.** They are not in scope.
2. **The sidebar content stays app-specific.** Do not replace it with GeekSidebar.
   GeekSidebar is for apps that have no existing sidebar opinion.
   Apps with a designed sidebar (bujogeek, fitnessgeek, notegeek) keep theirs.
3. **The topbar content stays app-specific.** Same rule.
4. **Delete local layout components once replaced.** Leaving them creates confusion.
5. **Keep the app's color identity.** Only the shared rules are inherited.
   Accent colors, typography choices, and surface textures stay per-app.
6. Each app must end with ZERO local layout shells.
7. **The sidebar must NOT use `position: fixed` or `absolute`.** It must sit in the natural flex flow so `GeekShell` can correctly calculate the remaining space for the main content area.

---

## Step-by-Step Migration (do in this order for each app)

### Step 1 — Add the dependency (if missing)

Check `frontend/package.json` (or `web/package.json`):

```json
"@geeksuite/ui": "workspace:*"
```

If missing, add it. Run `pnpm install` from the monorepo root.

**Status:**
| App | Has dep |
|-----|---------|
| fitnessgeek | ✅ |
| flockgeek | ✅ |
| notegeek | ✅ |
| storygeek | ✅ |

---

### Step 2 — Compose the theme

**Goal:** Replace `createTheme(...)` with `createGeekSuiteTheme({ mode, accent, overrides })`.

**Pattern:**

```js
// theme/theme.js
import { createGeekSuiteTheme } from '@geeksuite/ui';

const xxxAccent = {
  main:         '#YOUR_ACCENT',   // keep app's existing accent
  light:        '#...',
  dark:         '#...',
  contrastText: '#FFFFFF',
};

function buildXxxOverrides(mode) {
  const isDark = mode === 'dark';

  return {
    // Only override what is genuinely app-specific.
    // Sizing, focus rings, spacing scale: DO NOT re-declare.
    typography: { /* app-specific fonts only */ },
    components: { /* app-specific surface colors, textures, identity */ },
  };
}

export function createXxxTheme(mode = 'light') {
  return createGeekSuiteTheme({
    mode,
    accent:    xxxAccent,
    overrides: buildXxxOverrides(mode),
  });
}
```

**What survives in overrides:** custom fonts, surface/paper colors, grain textures,
app-specific component colors, app-specific shadows.

**What does NOT go in overrides:** button sizing, border radius, focus ring width,
spacing scale, click targets, chip height, interaction tokens. Those come from
the shared system automatically.

**Per-app theme files to replace:**

| App | Current theme file | Current export | New export |
|-----|--------------------|----------------|------------|
| fitnessgeek | `src/theme/theme.jsx` | `createAppTheme` | `createFitnessTheme` |
| flockgeek | `src/theme/theme.js` | direct objects | `createFlockTheme` |
| notegeek | `src/theme/createAppTheme.js` | `createAppTheme` | `createNoteTheme` |
| storygeek | `src/theme/theme.js` | `lightTheme`/`darkTheme` | `createStoryTheme` |

---

### Step 3 — Update the app entry point

**Goal:** Swap the theme factory import and add `FocusModeProvider`.

```jsx
// App.jsx (or wherever MuiThemeProvider lives)
import { createXxxTheme } from './theme/theme';       // ← new name
import { FocusModeProvider } from '@geeksuite/ui';    // ← NEW

// In the render tree:
<ThemeProvider>                                        // ← app's own (light/dark toggle)
  <FocusModeProvider storageKey="xxxgeek.focusMode">  // ← NEW, scoped per app
    <MuiThemeProvider theme={muiTheme}>
      ...
    </MuiThemeProvider>
  </FocusModeProvider>
</ThemeProvider>
```

**Notes per app:**

- **fitnessgeek** — Has `SettingsContext` that controls theme mode.
  `FocusModeProvider` wraps inside `MuiThemeProvider`, same as bujogeek pattern.
- **flockgeek** — Has `AppThemeProvider` in `src/theme/`. Wrap `FocusModeProvider`
  inside it, around `MuiThemeProvider`.
- **notegeek** — Uses `ThemeModeProvider` in `src/theme/`. Same pattern.
- **storygeek** — Currently uses two static theme objects (`lightTheme`/`darkTheme`).
  Needs a mode-aware factory before `FocusModeProvider` can be wired.

---

### Step 4 — Rewrite AppShell (or equivalent layout component)

**Goal:** Replace the local layout with `GeekShell + GeekAppFrame`. Keep local
sidebar/topbar content exactly as-is.

**Template:**

```jsx
// components/layout/AppShell.jsx  (or LayoutShell.jsx, ModernLayout.jsx, etc.)
import { useState } from 'react';
import { Drawer, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { GeekShell, GeekAppFrame } from '@geeksuite/ui';
import { useAuth } from '../../context/AuthContext';    // ← app's own auth hook
import Sidebar from './Sidebar';                        // ← app-specific, keep it
import TopBar from './TopBar';                          // ← app-specific, keep it
import { SIDEBAR_WIDTH } from '../../utils/constants';  // ← or wherever

const AppShell = ({ children }) => {
  const theme    = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const showNavigation = Boolean(user);

  const sidebar = showNavigation
    ? (isMobile ? null : <Sidebar />)
    : null;

  const topBar = <TopBar onMenuClick={() => setMobileDrawerOpen(true)} />;

  return (
    <GeekShell sidebar={sidebar} topBar={topBar}>

      {/* Mobile drawer — only if app has one */}
      {isMobile && showNavigation && (
        <Drawer
          anchor="left"
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          PaperProps={{ sx: { width: SIDEBAR_WIDTH } }}
        >
          <Sidebar />
        </Drawer>
      )}

      {/* Main content — route transition included */}
      <GeekAppFrame sx={{ pb: /* MOBILE_TAB_HEIGHT if app has tab bar, else 0 */ 0 }}>
        {children}
      </GeekAppFrame>

      {/* Mobile tab bar — only if app has one */}
      {/* {isMobile && showNavigation && <MobileTabBar />} */}

    </GeekShell>
  );
};

export default AppShell;
```

> **Watch out:** When migrating your `Sidebar.jsx`, make sure to remove `position: fixed`, `left: 0`, and `top: 0`. It should be a standard flex item. Use `height: '100vh'` and `flex-shrink: 0` to ensure it maintains its full-height presence and doesn't squish.

**Per-app layout files to replace and delete:**

| App | File to replace (becomes new AppShell) | Files to delete after |
|-----|----------------------------------------|----------------------|
| fitnessgeek | `components/Layout/ModernLayout.jsx` | `Layout.jsx`, `Layout/Drawer.jsx` (layout wrapper) |
| flockgeek | `components/LayoutShell.jsx` | — |
| notegeek | `components/Layout.jsx` | `NoteShell.jsx` if it is a layout wrapper (not a note surface) |
| storygeek | `components/Layout.jsx` | — |

> `WeightLayout.jsx` in fitnessgeek is a **domain layout**, not a shell. Leave it.
> `NoteShell.jsx` in notegeek — verify before deleting. If it wraps the note editing
> surface specifically (not the app shell), it stays.

---

### Step 5 — Anchor layout constants to shared tokens

Any file that declares `SIDEBAR_WIDTH` or `TOPBAR_HEIGHT` as local literals should
import from `geekLayout` instead:

```js
// Before
export const SIDEBAR_WIDTH = 220;
export const TOPBAR_HEIGHT = 60;

// After
import { geekLayout } from '@geeksuite/ui';
export const SIDEBAR_WIDTH = geekLayout.sidebarWidth;  // 220
export const TOPBAR_HEIGHT = geekLayout.topBarHeight;  // 60
```

If the app has no constants file, add the import directly at the use site.

---

### Step 6 — Verify and clean up

**Build check:**
```bash
cd apps/<app>/frontend && npx vite build --mode development 2>&1 | tail -20
```

**Confirm dead code is gone:**
```bash
# Should return nothing
grep -rn "createAppTheme\|lightTheme\|darkTheme\|AnimatePresence\|motion\.div" \
  apps/<app>/frontend/src --include="*.jsx" --include="*.js" | grep -v node_modules
```

**Confirm shared adoption:**
```bash
grep -rn "from '@geeksuite/ui'" apps/<app>/frontend/src --include="*.jsx" --include="*.js"
```

**Expected minimum imports after migration:**
```
LoginSplash           ← was already there
FocusModeProvider     ← in App.jsx
GeekShell             ← in AppShell
GeekAppFrame          ← in AppShell
geekLayout            ← in constants or AppShell
```

The theme file imports `createGeekSuiteTheme` internally — it doesn't need to
re-export it from the app layer.

---

## What Each App Keeps (Do Not Touch)

| App | Keep as-is |
|-----|-----------|
| fitnessgeek | `Sidebar.jsx`, `Drawer.jsx` nav content, chart theme (`chartTheme.js`), `WeightLayout.jsx` |
| flockgeek | `Navigation.jsx` sidebar content |
| notegeek | `Sidebar.jsx` content, `Header.jsx`, any note-surface-specific shells |
| storygeek | Inner page layout structure if any page uses it directly |

---

## Order of Operations

Do one app at a time. Prove it builds before moving to the next.

```
bujogeek     ✅ done — reference implementation
notegeek     → next (closest structure to bujogeek, clear layout file)
storygeek    → straightforward (simple Layout.jsx, no mobile tab bar)
flockgeek    → straightforward (LayoutShell is thin)
fitnessgeek  → last (most complex: multiple layouts, SettingsContext controls theme)
bookgeek     → not yet (intentionally different visual; revisit after others are solid)
startgeek    → not yet
```

---

## What Success Looks Like

After each migration, `grep -rn "from '@geeksuite/ui'"` for that app returns
at least the five imports listed in Step 6. No app should have a local
`createTheme()` call, a local `AnimatePresence` in its shell, or hardcoded
`220` / `60` layout constants.

The test is simple: open two apps side by side. The sidebar contents differ.
The way they move, focus, and respond does not.
