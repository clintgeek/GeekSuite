# GeekSuite Unified Design System

> **Version**: 2.0 (Unified)
> **Last Updated**: 2025-04-19
> **Maintainer**: Nova / Echo
> **Applies to**: All GeekSuite apps (NoteGeek, FitnessGeek, dbGeek, StartGeek, etc.)

---

## 🎨 Color Palette

| Purpose        | Color Code | Notes |
|----------------|------------|-------|
| Primary        | `#4A90E2`  | Geek Blue (MUI/Vite default) |
| Secondary      | `#7B61FF`  | Accent Purple (MUI/Vite default) |
| Accent         | `#ff9800`  | Orange 500 |
| Background     | `#f5f5f5`  | Light Gray |
| Surface (Cards)| `#ffffff`  | White |
| Text - Primary | `#212121`  | Dark Gray |
| Text - Secondary| `#757575` | Medium Gray |
| Success        | `#28A745`  | Green (MUI/Vite default) |
| Warning        | `#FFC107`  | Yellow (MUI/Vite default) |
| Error          | `#DC3545`  | Red (MUI/Vite default) |
| Info           | `#2196f3`  | Blue 500 |

---

## 🧱 Layout Guidelines

- **Spacing**: Use 8px base spacing units.
  Common spacings: 4px, 8px, 16px, 24px, 32px, 40px, 64px
- **Container Widths**:
  - Mobile: `100%`
  - Tablet: `720px`
  - Desktop: `960px` or `1140px` max
- **Grid System**: Use MUI's responsive 12-column grid
- **Padding**: Minimum of `p-2` (8px) around elements
- **Borders**: `rounded-2xl` for components, with `shadow-md` for elevation
- **Default Padding**: 16px
- **Card Spacing**: 24px
- **Button Padding**: 8px 16px

---

## 🔤 Typography

| Element         | Style            | Font Size | Weight   | Font Family |
|------------------|------------------|------------|----------|-------------|
| h1               | Hero Title       | `2.5rem`   | 700      | "Roboto", "Helvetica", "Arial", sans-serif |
| h2               | Section Header   | `2rem`     | 600      | "Roboto", "Helvetica", "Arial", sans-serif |
| h3               | Subsection Title | `1.5rem`   | 500      | "Roboto", "Helvetica", "Arial", sans-serif |
| Body Text (lg)   | Paragraphs       | `1.125rem` | 400      | "Roboto", "Helvetica", "Arial", sans-serif |
| Body Text (sm)   | Notes, Hints     | `0.875rem` | 400      | "Roboto", "Helvetica", "Arial", sans-serif |
| Code             | Monospace        | `0.875rem` | 400      | Monospace |

**Font Weights**: 400 (regular), 500 (medium), 700 (bold)

---

## 🧩 Components

- **Cards**
  - Rounded corners (`2xl` / `border-radius: 16px`)
  - Shadows (`shadow-md`)
  - Optional icons in header
  - Title + content block
  - Soft shadow, `border-radius: 16px`

- **Buttons**
  - Primary: Contained with primary color
  - Secondary: Outlined or text variant
  - Size: `small`, `medium`, `large`
  - Rounded corners (`border-radius: 16px`) and min-width for tap targets
  - Elevation on hover

- **Inputs**
  - Use MUI's `TextField` with `variant="outlined"`
  - Minimum width of `250px` on desktop
  - Use helper text and validation styles

- **Modals**
  - Use `Dialog` with smooth open/close animations
  - Use for confirmations, warnings, or form entry
  - Centered with backdrop blur

- **Nav Bars**
  - Fixed top with elevation
  - App icon, app name, page nav
  - Mobile-friendly with drawer slide-out

---

## ✨ Animations

Use `framer-motion` for subtle transitions:
- Page transitions: fade-in or slide
- Component mount/unmount: scale+fade
- Button hover: slight scale up
- Modal open: spring slide from top or center

---

## 📱 PWA & Mobile Guidelines

- All apps must be mobile-friendly and installable as PWAs
- Use MUI breakpoints for responsive behavior
- Ensure 44px minimum tap targets
- Add service worker and manifest via Vite PWA plugin

---

## 🔐 Security & UX Notes

- Optional lockable notes or screens (NoteGeek)
- Autofocus on key elements (inputs, buttons)
- Use MUI `Snackbar` for alerts, toasts
- Token/session handling abstracted to `CredentialsGeek`

---

## ⚙️ MUI + Vite Implementation

### Stack

- **Frontend**: React + Vite + MUI
- **Styling**: MUI + SASS
- **Routing**: React Router v6
- **TypeScript**: Recommended
- **Animation**: Framer Motion
- **Utilities**: Tailwind (limited utility use)

### Vite Setup

```bash
npm create vite@latest geek-app -- --template react
cd geek-app
npm install
```

### Install MUI & Fonts

```bash
npm install @mui/material @emotion/react @emotion/styled @fontsource/roboto
```

Add in `main.tsx` or `index.tsx`:

```tsx
import "@fontsource/roboto";
```

### Theme Setup

```ts
// theme.ts
import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: { main: "#4A90E2" },
    secondary: { main: "#7B61FF" },
    background: { default: "#F5F5F5" },
    text: { primary: "#212121", secondary: "#757575" },
    success: { main: "#28A745" },
    error: { main: "#DC3545" },
    warning: { main: "#FFC107" },
    info: { main: "#2196f3" },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontSize: '2.5rem', fontWeight: 700 },
    h2: { fontSize: '2rem', fontWeight: 600 },
    h3: { fontSize: '1.5rem', fontWeight: 500 },
    body1: { fontSize: '1rem', fontWeight: 400 },
    body2: { fontSize: '0.875rem', fontWeight: 400 },
  },
  shape: {
    borderRadius: 16,
  },
  spacing: 8,
});

export default theme;
```

### Apply Theme

```tsx
import { ThemeProvider } from "@mui/material/styles";
import theme from "./theme";

<ThemeProvider theme={theme}>
  <App />
</ThemeProvider>
```

---

## 🧪 Component Checklist

- [x] Theming system via MUI ThemeProvider
- [x] Typography mapped to theme
- [x] Color mode toggle (dark/light)
- [x] Standard component set with variants
- [x] Mobile-first design and spacing
- [x] Reusable layout containers
- [x] Style isolation via `sx` prop or CSS Modules

---

## 🔧 Dev Tools

- React + Vite
- MUI v5+
- TypeScript recommended
- Tailwind (limited utility use)
- SASS for custom styles
- Framer Motion for animation
- React Router for navigation

---

## 🧠 Notes

- All styles and UX should follow the principles of:
  - Clarity
  - Consistency
  - Accessibility
  - Minimalism

- The goal of GeekSuite's UI is to feel intuitive, fast, lightweight, and developer-friendly.

- Use consistent spacing across all GeekSuite apps.
- Define all shared SASS variables in a `_variables.scss` file.
- Consider theme toggling for light/dark mode.
- All apps should load a consistent layout shell with the same top nav/footer and user info handling.

---

## ✅ Status

This unified design + setup guide applies to:
- [x] NoteGeek
- [ ] FitnessGeek (rewrite pending)
- [ ] dbGeek
- [ ] StartGeek
- [ ] CredentialsGeek

---

Want to contribute to the design system? Fork and submit PRs at `github.com/clintgeek/geeksuite-style`.
