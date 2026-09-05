# GeekSuite Design Language

This document defines the design language for all GeekSuite applications. It ensures a consistent, clean, and accessible user experience across all platforms. The system uses Material-UI (MUI) as the foundation, extended with custom theming and components.

## 🎨 Color System

### Primary Colors

| Role | Color |
|------|-------|
| Main | #4B7AA3 |
| Light | #7BB3F0 |
| Dark | #2E5C8A |
| Contrast Text | #FFFFFF |

### Secondary Colors

| Role | Color |
|------|-------|
| Main | #1976D2 |
| Light | #2196F3 |
| Dark | #1565C0 |
| Contrast Text | #FFFFFF |

### Backgrounds
- Default: #F5F5F5
- Paper: #FFFFFF
- Code Editor (Light Mode): #f5f5f5
- Mind Map: #f8f9fa

### Semantic Colors

Semantic colors are used as foreground (icons, outlined chips, error text) as often as
fills, so each mode carries its own value that clears 4.5:1 on that mode's paper.

| Role | Light | Dark |
|------|-------|------|
| Error | #B00020 | #F27C74 |
| Success | #2E7D32 | #66BB6A |
| Warning | #A35F00 | #FFB74D |
| Info | #0277BD | #4FC3F7 |

### Text Colors
- Primary: #212121
- Secondary: #6B6B6B
- Disabled: #9E9E9E (light) / #8F8F8F (dark)
- Placeholder: Secondary @ 70% opacity

## 🔤 Typography

### Font Families
- Primary: "Roboto", "Helvetica", "Arial", sans-serif
- Monospace: "Roboto Mono", monospace

### Font Sizes

| Type | Size |
|------|------|
| H1 | 2rem (28px) |
| H2 | 1.5rem (24px) |
| H3 | 1.25rem (20px) |
| H4 | 1.125rem (18px) |
| H5 | 1rem (16px) |
| H6 | 0.875rem (14px) |
| Body 1 | 0.875rem (14px) |
| Body 2 | 0.75rem (12px) |
| Code | 0.9rem (14.4px) |

### Font Weights
- Regular: 400
- Medium: 500
- Bold: 700

## 📐 Spacing

- Base Unit: 8px
- Scale: Multiples of base unit

### Common Layouts:
- Container/Component Padding: 16px (2 units)
- Grid Gutter: 24px (3 units)
- Mobile Padding: 8px
- Desktop Padding: 16px

## 🧩 Components

### App Bar
- Height: 60px
- Background: Primary Blue (#4B7AA3)
- Text: White
- Shadow: 0px 2px 8px rgba(0,0,0,0.1)
- Border: 1px solid rgba(0,0,0,0.1)
- Border Radius: 0 (no rounded corners)
- Padding: 8px (mobile) / 16px (desktop)

### Buttons
- Border Radius: 8px
- Text Transform: None
- Font Weight: 500
- Hover: 4% opacity overlay
- Disabled: 38% opacity
- Loading: Circular progress (24px)
- Minimum Touch Target: 44px × 44px

### Cards / Papers
- Radius: 8px
- Shadow: Subtle layered shadow
- Background: Paper (#FFFFFF)
- Hover: Slight elevation increase
- Active: Slight elevation decrease

### Input Fields
- Border Radius: 8px
- Focus: Primary-colored outline
- Placeholder: Secondary text @ 70% opacity
- Disabled: 38% opacity
- Error: Red outline + helper text

### Drawer
- Width: 220px
- Background: Primary Blue (#4B7AA3)
- Border: 1px solid rgba(0,0,0,0.1)
- Shadow: None
- Mobile: Temporary
- Desktop: Persistent

### Tags
- Background: Primary.50
- Text Color: Primary
- Padding: 4px 8px
- Border Radius: 4px
- Margin Right: 8px

## 🧠 Mind Map Components

### Nodes
- Root Node: #e3f2fd
- Regular Node: #ffffff
- Selected: 2px solid Primary
- Hover: Elevation increase
- Edit Indicator: Green dot (8px)

### Edges
- Color: #90caf9
- Border: 2px solid #1976d2

### Background
- Pattern: Dots
- Snap Grid: 15px × 15px

## 💻 Code Editor
- Background: #f5f5f5
- Font: Roboto Mono, 0.9rem, 1.5 line-height
- Padding: 16px
- Border: None
- Placeholder: Secondary text @ 70% opacity

## 📐 Layout & Grid

### Grid System (MUI Breakpoints)

| Label | Width |
|-------|-------|
| xs | 0px |
| sm | 600px |
| md | 900px |
| lg | 1200px |
| xl | 1536px |

### Container
- Max Width: 1200px
- Padding: 16px
- Full width on mobile, centered on desktop

## 🚦 Interactive States

### Hover
- Buttons: 4% primary overlay
- Cards: Elevation increase
- Links: Underline
- Icons: Background highlight
- Tags: Slight elevation

### Focus
- Outline: 2px solid primary
- Offset: 2px
- Inputs/Buttons: Primary outline

### Active
- Buttons: 12% opacity overlay
- Cards: Elevation decrease
- Icons: Slight scale-down

### Loading
- Circular progress: 24px
- Color: Inherit from parent
- Buttons: Full-width spinner
- Disabled during load

## ♿ Accessibility

### Text Contrast:
- On Primary / Paper: 4.5:1+
- Interactive Elements: 3:1+
- Error States: 4.5:1+

### Focus Indicators:
- Visible outlines on all interactives
- High contrast rings
- Full keyboard nav support
- ARIA labels on icons

### Colour on a surface, not colour in the abstract (2026-09-05)

A ratio is a property of a *pair*, so an ink is only "AA" against the ground it
actually lands on. The axe pass in `tools/mobile-harness` found 40 contrast
failures where the token was fine and the surface was not: `text.muted` clears
4.5:1 on the paper and 4.29:1 on a chip tint; an accent tuned to carry a white
button label reads at 3.12:1 as a focused form label.

The rules that fell out of that burn-down:

- **Paint text with the text tokens.** `text.primary` / `text.secondary` /
  `text.muted` are audited by `packages/ui/src/__tests__/themeContrast.test.js`
  against *every* surface the palette declares. A neutral from the raw ramp
  (`ink[300]`, `dark[500]`) is a border, a divider or a fill — as text it is
  unmeasured, and in practice it measures around 2:1.
- **Never paint text with a low-alpha ink.** `rgba(255,245,220,0.28)` is not a
  colour, it is a colour *and* whatever shows through it. Composite it or use a
  solid token.
- **A domain colour used as text goes through `readableOn`.** `readableOn(ink,
  surface, { min = 4.5 })` in `@geeksuite/ui` composites, measures, and walks
  the ink away from the surface until it clears the floor — returning it
  untouched when it already does. Pass the surface the text really sits on (a
  tint, not the paper), and `{ min: 3 }` only for large text or a graphic. Its
  older sibling `toneForMode` nudges by a fixed amount and does not measure;
  prefer `readableOn` for anything readable.
- **The ratchet is the record.** Every pair the suite asserts lives in
  `themeContrast.test.js`, `KNOWN_GAPS` is empty, and it stays empty.

## 🔖 Branding & Iconography

### Logo
- Fonts: Roboto Bold (primary), Roboto Mono (secondary)
- Icon: AutoStoriesOutlined
- Tagline: </>
- Size: 20px logo, 16px tagline

### Icons
- Source: Material-UI
- Size: 24px
- Color: Primary/Secondary text
- States:
  - Hover: Background highlight
  - Disabled: 38% opacity

## 📱 Responsive Design

### Principles
- Mobile-first base styles
- Progressive enhancement
- Min touch target: 44px x 44px

### Behavior by Breakpoint
- Drawer: Collapses to hamburger below sm
- Typography: Scales down on smaller screens
- Inputs & Buttons: Full width on mobile
- Spacing: Tighter on mobile
- Containers: No max-width on mobile

## ⚙️ Implementation Notes

### MUI Integration
- Wrap app in ThemeProvider
- Use theme overrides for components
- Use global styles for layout consistency
- Leverage MUI's sx prop for scoped styles

### CSS-in-JS Best Practices
- Use theme.spacing() for layout
- Use theme.palette for color consistency
- Use breakpoints for responsive tweaks
- Use theme.transitions for animations

## ✅ Best Practices Checklist
- Use theme values (colors, spacing, typography)
- Maintain consistent hierarchy & component naming
- Follow mobile-first design
- Ensure WCAG contrast ratios
- Use semantic HTML
- Manage focus correctly
- Test at all breakpoints
- Add ARIA labels
- Handle loading states gracefully
- Apply consistent disabled states

## 📐 Required Layout Pattern for All GeekSuite Apps

### Header
- Height: ~60px
- Background: Primary Blue
- Text: White
- Contents:
  - Left: Hamburger menu
  - Middle: App icon + name styled as AppGeek
  - Right: </> tagline
- Navigation inside drawer (triggered by hamburger)

### View Area
- Background: Very light grey
- Scroll behavior:
  - Single item: no scroll (internal scroll if needed)
  - Multiple items: scrollable view with 1rem padding
- Content in cards:
  - White background
  - Dark grey text
  - 1rem margin inside view box
  - Rounded corners

### Bottom Navigation Bar
- Height: similar to header
- Background: White
- Icons: Dark grey, active = theme blue