# GeekSuite Design Language

This document defines the design language for all GeekSuite applications. It ensures a consistent, clean, and accessible user experience across all platforms. The system uses Material-UI (MUI) as the foundation, extended with custom theming and components.

## 🎨 Color System

### Primary Colors

| Role | Color |
|------|-------|
| Main | #6098CC |
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
- Error: #B00020
- Success: #4CAF50
- Warning: #FFC107
- Info: #2196F3

### Text Colors
- Primary: #212121
- Secondary: #757575
- Disabled: #BDBDBD
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
- Background: Primary Blue (#6098CC)
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
- Background: Primary Blue (#6098CC)
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