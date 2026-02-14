# NoteGeek UI Redesign Plan

> **Status:** In Progress
> **Started:** February 1, 2026
> **Aesthetic Direction:** "Warm Digital Notebook"

---

## 🎯 Goals

1. **Optimize for engagement** – Make users excited to open the app
2. **Ease of use** – Intuitive navigation, minimal friction
3. **Responsive excellence** – Native-feeling experience on desktop, tablet, and mobile
4. **Distinctive design** – Avoid generic "AI slop" aesthetics; create memorable, characterful UI

---

## 🎨 Design Direction: "Warm Digital Notebook"

**Concept:** Soft, paper-like textures with ink-inspired accents. Think Notion meets Moleskine.

### Typography
- **Display:** Distinctive serif or geometric sans for headings (e.g., Fraunces, Clash Display, or Satoshi)
- **Body:** Clean, readable sans-serif with personality (e.g., Plus Jakarta Sans, Cabinet Grotesk)
- **Monospace:** For code snippets (e.g., JetBrains Mono, Fira Code)

### Color Palette
| Role | Light Mode | Dark Mode |
|------|------------|-----------|
| Background | Warm off-white `#FAF9F7` | Deep charcoal `#1A1A1A` |
| Surface | Cream `#FFFEF9` | Soft black `#242424` |
| Primary | Rich indigo `#4F46E5` | Bright indigo `#6366F1` |
| Secondary | Warm coral `#F97316` | Soft coral `#FB923C` |
| Accent | Sage green `#10B981` | Mint `#34D399` |
| Text Primary | Ink black `#1F2937` | Off-white `#F9FAFB` |
| Text Secondary | Warm gray `#6B7280` | Cool gray `#9CA3AF` |
| Divider | Subtle warm `#E5E2DD` | Subtle dark `#333333` |

### Motion Principles
- **Staggered reveals** on page load (50-100ms delays)
- **Hover states** with subtle scale (1.02x) and shadow lift
- **Smooth transitions** (200-300ms ease-out)
- **Micro-interactions** on buttons and cards

### Visual Details
- Subtle paper texture overlays
- Soft shadows with warm tint
- Rounded corners (12-16px for cards, 8px for buttons)
- Thin, elegant borders

---

## 📱 Screen-by-Screen Plan

### 1. QuickCaptureHome (Priority: HIGH) ⬅️ START HERE
**Current State:** Plain stacked buttons for note types, no visual hierarchy

**Redesign:**
- [ ] Time-aware greeting ("Good morning, [name]")
- [ ] Visual note type cards in responsive grid (2x3 on desktop, 2x3 on tablet, 2+2+1 on mobile)
- [ ] Each card has:
  - Distinctive illustration/icon for note type
  - Gradient or colored background
  - Hover animation (lift + glow)
  - Clear label
- [ ] Recent notes section below (horizontal scroll on mobile, grid on desktop)
- [ ] Quick stats or tip of the day (optional)

### 2. Login/Register (Priority: HIGH)
**Current State:** Basic SSO button in a plain Paper component

**Redesign:**
- [ ] Full-screen split layout (illustration left, form right on desktop)
- [ ] Animated brand logo
- [ ] Background pattern or gradient mesh
- [ ] Smooth loading states
- [ ] Mobile: Stacked layout with brand at top

### 3. Layout & Navigation (Priority: HIGH)
**Current State:** Standard MUI AppBar + Drawer + Bottom Nav

**Redesign:**
- [ ] Refined header with better branding
- [ ] Sidebar with visual tag indicators (colored dots)
- [ ] Improved mobile bottom nav with custom icons
- [ ] Smooth drawer transitions
- [ ] Collapsible sidebar with persist state

### 4. NoteList (Priority: MEDIUM)
**Current State:** Grid of Paper cards with basic hover

**Redesign:**
- [ ] Masonry or Pinterest-style layout option
- [ ] Note type visual indicators (colored stripe or icon)
- [ ] Better preview rendering (first line bold, rest truncated)
- [ ] Staggered load animation
- [ ] Empty state with illustration

### 5. NotePage / NoteViewer (Priority: MEDIUM)
**Current State:** Basic content display

**Redesign:**
- [ ] Clean reading view with optimal line length
- [ ] Floating action bar for edit/delete/share
- [ ] Better tag display
- [ ] Smooth scroll with progress indicator (optional)

### 6. NoteEditorPage (Priority: MEDIUM)
**Current State:** Type-specific editors

**Redesign:**
- [ ] Unified header with save status indicator
- [ ] Better toolbar design for each editor type
- [ ] Autosave visual feedback
- [ ] Mobile-optimized controls

### 7. SearchResults (Priority: LOW)
**Current State:** Standard list

**Redesign:**
- [ ] Search-as-you-type with debounce
- [ ] Highlighted matching terms
- [ ] Filter chips for note types
- [ ] Recent searches

### 8. Settings (Priority: LOW)
**Current State:** Unknown (needs review)

**Redesign:**
- [ ] Clean section-based layout
- [ ] Theme preview cards
- [ ] Account info display

---

## 🛠 Implementation Order

1. **Theme Foundation**
   - Update `createAppTheme.js` with new palette and typography
   - Add Google Fonts imports
   - Create CSS custom properties for textures/gradients

2. **QuickCaptureHome**
   - Complete redesign with new aesthetic

3. **Layout Components**
   - Header, Sidebar, MobileBottomNav refinements

4. **Login/Register**
   - Full visual overhaul

5. **NoteList**
   - Card redesign and animations

6. **Note viewing/editing**
   - Polish the core note experience

7. **Search & Settings**
   - Final touches

---

## 📝 Progress Log

| Date | Screen | Changes |
|------|--------|---------|
| Feb 1, 2026 | Planning | Created redesign plan, analyzed current UI |
| Feb 1, 2026 | Theme Foundation | New color palette (Warm Digital Notebook), Fraunces + Plus Jakarta Sans typography, custom shadows, paper texture overlay |
| Feb 1, 2026 | QuickCaptureHome | Complete redesign: time-aware greeting, gradient note type cards with staggered animations, recent notes horizontal scroll |
| Feb 1, 2026 | Branding | Added dedicated brand colors (note=black/white, geek=blue) to theme, updated Header and Login |
| Feb 1, 2026 | Login | Complete redesign: floating gradient shapes, grid pattern, frosted glass card, animated entrance, tagline, emoji decorations |
| Feb 1, 2026 | Header | Frosted glass effect, refined branding, subtle hover animations on buttons |
| Feb 1, 2026 | Sidebar | Colored tag indicators, "Collections" section label, improved empty state, frosted logout area, hover animations |
| Feb 1, 2026 | MobileBottomNav | Custom nav items with filled/outlined icon states, active dot indicator, frosted glass background |
| Feb 1, 2026 | NoteList | Complete redesign: colored type indicator bar, type icons, relative timestamps, staggered animations, improved empty state, note count |
| Feb 1, 2026 | NoteViewer | Complete redesign: floating action bar, type indicator chip, colored gradient bar, Fraunces title, clickable tags, rich markdown styling, DeleteNoteDialog integration |
| Feb 1, 2026 | NotePage | Improved loading/error states with centered spinners and styled alerts |
| Feb 1, 2026 | NoteEditorPage | Complete redesign: animated type picker cards with gradients, improved loading/error states, TypeCard component |
| Feb 1, 2026 | NoteShell | Warm gradient background, frosted glass header/toolbar, custom scrollbar styling |
| Feb 1, 2026 | NoteMetaBar | Fraunces title input with type-colored accent bar, type chip with icon, improved spacing |
| Feb 1, 2026 | NoteActions | Styled save/delete/toggle buttons, success state feedback, hover animations, tooltips |
| Feb 1, 2026 | NoteTypeSelector | Custom pill-style buttons with type colors, hover states, smooth transitions |
---

## 🔗 Resources

- [Frontend Design Instructions](/.github/instructions/frontend-design.instructions.md)
- [Current Theme](client/src/theme/createAppTheme.js)
- [Main Styles](client/src/styles/main.scss)
