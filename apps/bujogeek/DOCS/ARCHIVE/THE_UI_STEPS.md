# BuJoGeek — UI Redesign Implementation Steps

## How to Use This Document

This is the step-by-step implementation guide for the BujoGeek UI redesign. Each step is written so that **any competent React developer** can complete it independently. Steps are ordered by dependency — do them in order.

**Before you start ANY step:**
1. Read `THE_UI_PLAN.md` for the full design vision
2. Read `CONTEXT.md` for project context
3. Make sure you're on the correct branch
4. Run the dev server and verify current state works

**Rules:**
- One step = one focused change
- Test after every step
- Don't break existing functionality while building new
- Commit after each completed step
- Ask questions before guessing

**Legend:**
- 🔴 Critical — blocks other work
- 🟠 High — important but not blocking
- 🟡 Medium — nice to have
- ✅ Checkbox — mark when complete

---

## Phase A: Foundation

*Goal: New design tokens, fonts, layout shell, and route structure. Nothing changes visually for existing views yet — we're building the new skeleton alongside the old one.*

---

### A1. Install New Dependencies 🔴

- [ ] **Install packages**

  Run from the `client/` directory:
  ```bash
  npm install lucide-react framer-motion
  ```

  These are:
  - `lucide-react` — new icon library (replaces @mui/icons-material over time)
  - `framer-motion` — animation library for transitions and gestures

- [ ] **Add fonts to `client/index.html`**

  Add these lines inside the `<head>` tag, BEFORE any other stylesheets:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400&family=IBM+Plex+Mono:wght@400;500&family=Source+Sans+3:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  ```

- [ ] **Verify** — open the app, check the Network tab in DevTools. You should see font files loading from `fonts.gstatic.com`.

---

### A2. Update Color Tokens 🔴

- [ ] **Replace** the contents of `client/src/theme/colors.js` with the new color system.

  The new file should export these objects:

  ```javascript
  // Primary palette (GeekSuite blue — retained)
  export const colors = {
    primary: {
      50:  '#E8F2FA',
      100: '#C5DEF2',
      200: '#9FC9E9',
      300: '#7AB4E0',
      400: '#5CA3D9',
      500: '#6098CC',  // Main GeekSuite blue
      600: '#4B7AA3',
      700: '#3A5F7D',
      800: '#294557',
      900: '#182B31',
    },

    // Ink tones (replaces neutral grays — warmer)
    ink: {
      900: '#1A1A2E',  // primary text
      800: '#2D2D44',  // secondary text
      700: '#44445C',  // tertiary
      600: '#5A5A72',
      500: '#6E6E86',
      400: '#8E8EA0',  // muted
      300: '#B4B4C0',
      200: '#D4D4DC',  // borders
      100: '#EDEDF0',  // subtle bg
      50:  '#F7F7F8',  // page bg
    },

    // Parchment (warm backgrounds)
    parchment: {
      default: '#FAF9F7',  // main bg
      paper:   '#FFFFFF',  // cards
      warm:    '#F5F0EB',  // section bg
    },

    // Aging system
    aging: {
      fresh:   '#5B9E6F',  // sage green — new/today
      warning: '#D4843E',  // warm amber — 1-3 days
      overdue: '#C4453C',  // muted red — overdue
      stale:   '#8B4D6A',  // plum — old backlog
    },

    // Priority
    priority: {
      high:   '#C4453C',
      medium: '#D4843E',
      low:    '#6098CC',
    },

    // Status / semantic
    status: {
      success:   '#5B9E6F',
      successBg: '#EDF7F0',
      warning:   '#D4843E',
      warningBg: '#FDF3EB',
      error:     '#C4453C',
      errorBg:   '#FBEDED',
      info:      '#6098CC',
      infoBg:    '#EBF3FA',
    },
  };

  // Light mode surface colors
  export const lightColors = {
    background: {
      default: colors.parchment.default,
      paper:   colors.parchment.paper,
      warm:    colors.parchment.warm,
    },
    text: {
      primary:  colors.ink[900],
      secondary: colors.ink[700],
      disabled: colors.ink[400],
    },
    divider: colors.ink[200],
  };

  // Dark mode surface colors
  export const darkColors = {
    background: {
      default: '#1A1A2E',
      paper:   '#242440',
      warm:    '#2D2D50',
    },
    text: {
      primary:  '#E8E8EC',
      secondary: '#8E8EA0',
      disabled: '#5A5A72',
    },
    divider: '#3A3A55',
  };
  ```

- [ ] **Verify** — the app should still compile. Colors may shift slightly. That's expected.

---

### A3. Update Typography in Theme 🔴

- [ ] **Edit** `client/src/theme/theme.js` — update the `typography` section:

  ```javascript
  typography: {
    fontFamily: '"Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',

    // Display font for page titles, dates, headers
    h1: {
      fontFamily: '"Fraunces", Georgia, serif',
      fontSize: '2.25rem',
      fontWeight: 500,
      letterSpacing: '-0.02em',
      fontOpticalSizing: 'auto',
    },
    h2: {
      fontFamily: '"Fraunces", Georgia, serif',
      fontSize: '1.75rem',
      fontWeight: 500,
      letterSpacing: '-0.02em',
      fontOpticalSizing: 'auto',
    },
    h3: {
      fontFamily: '"Fraunces", Georgia, serif',
      fontSize: '1.375rem',
      fontWeight: 500,
      letterSpacing: '-0.01em',
    },

    // UI font for everything else
    h4: {
      fontSize: '1.125rem',
      fontWeight: 600,
    },
    h5: {
      fontSize: '1rem',
      fontWeight: 600,
    },
    h6: {
      fontSize: '0.875rem',
      fontWeight: 600,
      letterSpacing: '0.02em',
      textTransform: 'uppercase',
    },
    body1: {
      fontSize: '0.9375rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.8125rem',
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '0.75rem',
    },
    button: {
      fontWeight: 500,
      letterSpacing: '0.01em',
    },

    // Custom variant for monospace (signifiers, codes)
    // Access via: sx={{ fontFamily: theme.typography.mono }}
    mono: '"IBM Plex Mono", "Courier New", monospace',
  },
  ```

- [ ] **Verify** — refresh the app. You should see:
  - Body text in Source Sans 3 (slightly rounder than Inter)
  - If any headers are using h1/h2/h3, they'll now show Fraunces (serif)
  - No layout shifts or broken spacing

---

### A4. Update MUI Component Overrides 🟠

- [ ] **Update** the component overrides in `theme.js` to use the new `colors.ink` tokens instead of `colors.neutral`.

  Everywhere you see `colors.neutral[XXX]`, replace with the equivalent `colors.ink[XXX]`. The mapping:
  
  | Old (`neutral`) | New (`ink`) |
  |----------------|-------------|
  | `neutral[50]` | `ink[50]` |
  | `neutral[100]` | `ink[100]` |
  | `neutral[200]` | `ink[200]` |
  | `neutral[300]` | `ink[300]` |
  | `neutral[400]` | `ink[400]` |
  | `neutral[500]` | `ink[500]` |
  | `neutral[600]` | `ink[600]` |
  | `neutral[700]` | `ink[700]` |
  | `neutral[800]` | `ink[800]` |
  | `neutral[900]` | `ink[900]` |

  Do a find-and-replace in `theme.js`: replace `colors.neutral` with `colors.ink`.

- [ ] **Verify** — app compiles, no visual regressions beyond intended color warmth changes.

---

### A5. Create Utility Files 🟠

- [ ] **Create** `client/src/utils/taskAging.js`:

  ```javascript
  import { differenceInDays } from 'date-fns';
  import { colors } from '../theme/colors';

  /**
   * Calculate how old a task is based on its original date or creation date.
   * Returns an aging level and associated color.
   */
  export const getTaskAge = (task) => {
    const referenceDate = task.originalDate || task.dueDate || task.createdAt;
    if (!referenceDate) return { level: 'fresh', days: 0 };

    const days = differenceInDays(new Date(), new Date(referenceDate));

    if (days <= 0) return { level: 'fresh', days };
    if (days <= 2) return { level: 'warning', days };
    if (days <= 7) return { level: 'overdue', days };
    return { level: 'stale', days };
  };

  /**
   * Get the left border color for a task based on its age.
   */
  export const getAgingColor = (level) => {
    return colors.aging[level] || colors.aging.fresh;
  };

  /**
   * Get a human-readable age label.
   */
  export const getAgingLabel = (days) => {
    if (days <= 0) return null;
    if (days === 1) return 'yesterday';
    if (days <= 7) return `${days} days ago`;
    if (days <= 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  };
  ```

- [ ] **Create** `client/src/utils/constants.js`:

  ```javascript
  // Layout
  export const SIDEBAR_WIDTH = 240;
  export const TOPBAR_HEIGHT = 56;
  export const MOBILE_TAB_HEIGHT = 64;

  // Breakpoints (match MUI)
  export const MOBILE_BREAKPOINT = 600;
  export const TABLET_BREAKPOINT = 900;

  // Animation durations (ms)
  export const TRANSITION_FAST = 150;
  export const TRANSITION_NORMAL = 200;
  export const TRANSITION_SLOW = 300;

  // Task aging thresholds (days)
  export const AGING_WARNING = 2;
  export const AGING_OVERDUE = 7;

  // Signifiers
  export const SIGNIFIERS = {
    '*': { label: 'Priority', symbol: '*' },
    '@': { label: 'Event', symbol: '@' },
    'x': { label: 'Done', symbol: 'x' },
    '<': { label: 'Migrated Back', symbol: '<' },
    '>': { label: 'Migrated Forward', symbol: '>' },
    '-': { label: 'Note', symbol: '-' },
    '!': { label: 'Important', symbol: '!' },
    '?': { label: 'Question', symbol: '?' },
    '#': { label: 'Tag', symbol: '#' },
  };
  ```

- [ ] **Verify** — files created, no import errors.

---

### A6. Create New AppShell Layout 🔴

This is the **big layout change**. We're building a new layout component (`AppShell`) alongside the existing `AppLayout`. We'll swap them once ready.

- [ ] **Create** `client/src/components/layout/Sidebar.jsx`

  This is the desktop sidebar. Requirements:
  - Fixed left sidebar, 240px wide
  - Dark background (`colors.ink[900]` or `#0f172a` — match current `chromeBg`)
  - Logo area at top: "bujo**geek**" with current styling
  - Navigation items:
    - **Today** (lucide: `CalendarCheck` icon) → `/today`
    - **Review** (lucide: `ClipboardCheck` icon) → `/review`
    - **Plan** (lucide: `Calendar` icon) → `/plan`
    - **Templates** (lucide: `LayoutTemplate` icon) → `/templates`
  - Active state: left border accent + subtle background highlight
  - User avatar + logout at bottom
  - Import icons from `lucide-react`, NOT from `@mui/icons-material`

- [ ] **Create** `client/src/components/layout/TopBar.jsx`

  Minimal top bar for the main content area. Requirements:
  - Height: 56px
  - Left side: Page title (dynamic, based on route)
  - Right side: ThemeToggle + User avatar
  - On mobile: hamburger menu icon on the left
  - Transparent or subtle background — NOT the heavy blue bar
  - For desktop: background matches `parchment.default`
  - For mobile: background matches `parchment.paper` with subtle bottom border

- [ ] **Create** `client/src/components/layout/MobileTabBar.jsx`

  Bottom tab bar for mobile only. Requirements:
  - Height: 64px
  - Four tabs:
    - **Today** (lucide: `CalendarCheck`) → `/today`
    - **Review** (lucide: `ClipboardCheck`) → `/review`
    - **Plan** (lucide: `Calendar`) → `/plan`
    - **More** (lucide: `MoreHorizontal`) → opens a sheet/menu
  - Active tab: primary blue icon + label
  - Inactive: muted `ink[400]`
  - The "More" tab opens a bottom sheet or menu with: Templates, Settings, Logout

- [ ] **Create** `client/src/components/layout/AppShell.jsx`

  This replaces `AppLayout.jsx`. Requirements:
  - Uses `Sidebar` on desktop (≥900px)
  - Uses `TopBar` always
  - Uses `MobileTabBar` on mobile (<600px)
  - Main content area fills remaining space
  - Renders `children` in the main area
  - Same provider/context wrapping as current `AppLayout`

  Desktop layout:
  ```
  ┌──────────┬───────────────────────────────────────┐
  │ Sidebar  │ TopBar                                │
  │ (240px)  ├───────────────────────────────────────┤
  │          │ Main Content (scrollable)             │
  │          │                                       │
  └──────────┴───────────────────────────────────────┘
  ```

  Mobile layout:
  ```
  ┌───────────────────────────┐
  │ TopBar                    │
  ├───────────────────────────┤
  │ Main Content (scrollable) │
  │                           │
  ├───────────────────────────┤
  │ MobileTabBar              │
  └───────────────────────────┘
  ```

- [ ] **Verify** — don't wire this into the app yet. Just make sure the files compile with no errors. You can temporarily import and render `AppShell` in a test route to check visuals.

---

### A7. Update Route Structure 🔴

- [ ] **Update** `client/src/App.jsx` to use the new `AppShell` and new routes.

  New route structure:
  ```
  /              → redirect to /today
  /today         → TodayPage (new — create placeholder for now)
  /review        → ReviewPage (new — create placeholder for now)
  /plan          → PlanPage (new — create placeholder for now)
  /plan/weekly   → PlanPage with weekly sub-view
  /plan/monthly  → PlanPage with monthly sub-view
  /plan/backlog  → PlanPage with backlog sub-view
  /templates     → TemplatesPage (existing)
  /login         → LoginPage (existing)
  /register      → RegisterPage (existing)
  ```

  **Important:** Also keep the OLD routes (`/tasks/daily`, `/tasks/weekly`, etc.) working temporarily by redirecting them to the new routes. This prevents breaking bookmarks.

- [ ] **Create placeholder pages** for TodayPage, ReviewPage, and PlanPage.

  Each placeholder should just render a heading with the page name so you can verify routing works:
  ```jsx
  // client/src/pages/TodayPage.jsx
  import { Box, Typography } from '@mui/material';

  const TodayPage = () => (
    <Box sx={{ p: 4 }}>
      <Typography variant="h1">Today</Typography>
      <Typography variant="body1" color="text.secondary">
        Today view placeholder — implementation coming in Phase B.
      </Typography>
    </Box>
  );

  export default TodayPage;
  ```

  Do the same for `ReviewPage.jsx` and `PlanPage.jsx`.

- [ ] **Swap** `AppLayout` for `AppShell` in `App.jsx`.

- [ ] **Verify:**
  - Navigate to `/today` → see placeholder
  - Navigate to `/review` → see placeholder
  - Navigate to `/plan` → see placeholder
  - Navigate to `/templates` → see existing templates page
  - Navigate to `/tasks/daily` → redirects to `/today`
  - Sidebar highlights correct item
  - Mobile tab bar shows and navigates correctly

---

### A8. Create Shared Components 🟠

- [ ] **Create** `client/src/components/shared/SectionHeader.jsx`

  A reusable section label used in the Today view and elsewhere.
  ```
  ─── OVERDUE (3) ────────────────────────────────
  ```
  
  Props:
  - `title` (string) — section name, rendered uppercase
  - `count` (number, optional) — item count in parentheses
  - `action` (ReactNode, optional) — action button on the right (e.g., collapse toggle)
  
  Styling:
  - `h6` typography (uppercase, letter-spaced)
  - Color: `ink[400]` (muted)
  - Horizontal rule extending to fill width
  - Spacing: `mb: 1.5, mt: 3` (generous breathing room)

- [ ] **Create** `client/src/components/shared/EmptyState.jsx`

  For when a section or page has no content.
  
  Props:
  - `title` (string) — e.g., "No tasks for today"
  - `description` (string, optional) — e.g., "Add your first task to get started"
  - `action` (ReactNode, optional) — e.g., an "Add Task" button
  
  Styling:
  - Centered in container
  - Muted text (`ink[400]`)
  - Generous vertical padding
  - Optional subtle illustration (can add later)

- [ ] **Create** `client/src/components/shared/SkeletonLoader.jsx`

  Loading placeholder for task lists.
  
  Requirements:
  - Renders 5 skeleton task rows
  - Each row: checkbox circle skeleton + two text line skeletons
  - Uses MUI `Skeleton` component
  - Subtle shimmer animation

- [ ] **Verify** — all files compile. You can render them temporarily in a placeholder page to check visuals.

---

## Phase B: Today View

*Goal: Build the primary screen — the daily planner page. This is the most important view in the app.*

---

### B1. Create TaskRow Component 🔴

This **replaces** `TaskCard` with a planner-line aesthetic.

- [ ] **Create** `client/src/components/tasks/TaskRow.jsx`

  This renders a single task as a planner line.

  Props:
  - `task` — the task object
  - `onStatusToggle` — callback when checkbox is clicked
  - `onEdit` — callback when edit is triggered
  - `onDelete` — callback when delete is triggered

  Layout:
  ```
  [aging border] [checkbox] [signifier] [content]     [due] [priority] [tags]
                                        [note - italic, muted]
  ```

  Requirements:
  - **Left border**: 3px solid, color from `getAgingColor()` based on task age
  - **Checkbox**: Custom circle (not MUI Checkbox). Use an SVG circle outline.
    - Unchecked: circle outline in `ink[300]`
    - Checked: filled circle in `aging.fresh` (green) with checkmark stroke
    - On click: call `onStatusToggle`
    - Minimum touch target: 44px × 44px
  - **Signifier**: If `task.signifier` exists, show it in IBM Plex Mono inside a subtle pill badge
    - Background: `ink[100]`
    - Text: `ink[700]`
    - Font size: 0.75rem
  - **Content**: Main task text
    - Font: Source Sans 3, 15px (body1), weight 500
    - Completed tasks: `text-decoration: line-through`, color fades to `ink[400]`
    - Strip tags/priority markers from display (use existing `cleanContent` logic)
  - **Due badge**: Show relative time ("today", "yesterday", "3 days ago")
    - Color-coded: fresh=green, warning=amber, overdue=red
    - Font size: 0.75rem (caption)
  - **Priority indicator**: Small colored dot (not a flag icon)
    - High: red dot, Medium: amber dot, Low: blue dot
    - 8px circle, positioned right of content
  - **Tags**: Small muted chips
    - Background: `ink[100]`
    - Text: `ink[600]`
    - Font size: 0.7rem
  - **Note**: If `task.note` exists, show on second line
    - Italic, `ink[400]`, indented under content
  - **Hover state** (desktop): 
    - Show edit/delete action icons on the right
    - Subtle background tint

  Spacing:
  - Vertical padding: 10px
  - Horizontal padding: 12px (mobile) / 16px (desktop)
  - Gap between elements: 8px
  - Between task rows: 2px (tight, like planner lines)

- [ ] **Verify** — render `TaskRow` with a mock task object in a placeholder page. Check:
  - Aging border color changes based on task age
  - Checkbox toggles
  - Completed styling works
  - Responsive (check mobile and desktop)
  - Touch targets are at least 44px on mobile

---

### B2. Create TaskCheckbox Component 🟠

- [ ] **Create** `client/src/components/tasks/TaskCheckbox.jsx`

  An animated SVG checkbox with planner-style aesthetics.

  Props:
  - `checked` (boolean)
  - `onChange` (callback)
  - `color` (string, optional — defaults to `aging.fresh`)

  Requirements:
  - SVG-based, 24px viewBox
  - Unchecked: Circle stroke in `ink[300]`, no fill
  - Checked: Circle filled with `color`, white checkmark stroke inside
  - Animation: On check, the checkmark draws itself (stroke-dashoffset animation, 300ms)
  - On uncheck: instant reset (no reverse animation)
  - Wrap in a button for accessibility: `role="checkbox"`, `aria-checked`, `tabIndex={0}`
  - Minimum touch target: 44px × 44px (use padding around the SVG)
  - Use `framer-motion` for the animation:
    ```jsx
    <motion.path
      d="M6 12l4 4 8-8"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: checked ? 1 : 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    />
    ```

- [ ] **Integrate** `TaskCheckbox` into `TaskRow` (replace the inline checkbox logic).

- [ ] **Verify** — clicking the checkbox animates smoothly. Check/uncheck works.

---

### B3. Create TaskAgingIndicator 🟠

- [ ] **Create** `client/src/components/tasks/TaskAgingIndicator.jsx`

  The left-border color indicator for task age.

  Props:
  - `task` — task object (needs `originalDate`, `dueDate`, or `createdAt`)
  
  Requirements:
  - Renders as a `Box` with `borderLeft: 3px solid <color>`
  - Color is determined by `getTaskAge()` → `getAgingColor()` from `utils/taskAging.js`
  - If task is completed, border is `ink[200]` (muted, de-emphasized)

  This component wraps the task row content:
  ```jsx
  <TaskAgingIndicator task={task}>
    {/* task row content */}
  </TaskAgingIndicator>
  ```

- [ ] **Integrate** into `TaskRow`.
- [ ] **Verify** — tasks with different ages show different border colors.

---

### B4. Build TodayPage 🔴

Now we assemble the actual Today view.

- [ ] **Create** `client/src/components/today/OverdueSection.jsx`

  Renders overdue/aging tasks in a visually urgent section.

  Props:
  - `tasks` — array of overdue task objects

  Requirements:
  - Only renders if `tasks.length > 0`
  - Uses `SectionHeader` with title "OVERDUE" and count
  - Subtle warm background tint: `rgba(196, 69, 60, 0.04)` (very light red wash)
  - Renders each task using `TaskRow`
  - Tasks should be sorted: oldest first (most urgent at top)

- [ ] **Create** `client/src/components/today/TodaySection.jsx`

  Renders today's active (non-completed, non-overdue) tasks.

  Props:
  - `tasks` — array of today's active task objects

  Requirements:
  - Uses `SectionHeader` with title "TODAY" and count
  - Renders each task using `TaskRow`
  - Supports drag-to-reorder (use existing drag-and-drop logic from `TaskList`)
  - If empty, show `EmptyState` with "Nothing planned for today" + Add Task button

- [ ] **Create** `client/src/components/today/CompletedSection.jsx`

  Collapsible section for completed tasks.

  Props:
  - `tasks` — array of completed task objects

  Requirements:
  - Only renders if `tasks.length > 0`
  - Uses `SectionHeader` with title "COMPLETED" and count, plus collapse toggle
  - **Collapsed by default** — only shows the header
  - Click header to expand/collapse
  - Tasks inside are visually muted (strikethrough, lighter colors)

- [ ] **Create** `client/src/components/today/InlineQuickAdd.jsx`

  Persistent quick-add input at the bottom of the Today view.

  Requirements:
  - Always visible at the bottom of the Today page
  - Simple text input with placeholder: "What needs to get done today?"
  - On Enter: create the task for today, clear the input
  - Supports basic parsing: `#tag`, `!high`, `!medium`, `!low`
  - Left icon: `+` circle (lucide: `PlusCircle`)
  - Styling: subtle border, warm background, rounded corners
  - On focus: border color changes to primary blue
  - This does NOT replace the Cmd+K command palette — it's a simpler, always-visible option

- [ ] **Update** `client/src/pages/TodayPage.jsx` (replace the placeholder):

  The full Today page assembly:

  ```jsx
  const TodayPage = () => {
    // Fetch tasks for today using TaskContext
    // Split tasks into: overdue, active, completed
    // 
    // Overdue = tasks where age > 0 AND status !== 'completed'
    // Active = tasks for today AND status !== 'completed' AND not overdue
    // Completed = tasks for today AND status === 'completed'

    return (
      <Box>
        {/* Page Header: Date + Stats */}
        <PageHeader />

        {/* Sections */}
        <OverdueSection tasks={overdueTasks} />
        <TodaySection tasks={activeTasks} />
        <CompletedSection tasks={completedTasks} />

        {/* Quick Add */}
        <InlineQuickAdd />
      </Box>
    );
  };
  ```

- [ ] **Create** `client/src/components/layout/PageHeader.jsx`

  The date headline for the Today page.

  Requirements:
  - Date displayed large in Fraunces (h1): "Friday, February 13"
  - Stats line below in body2, muted: "13 tasks · 3 overdue · 5 completed"
  - Right side: "+ Add Task" button (opens command palette or editor)
  - Date navigation: left/right arrows to change day (subtle, not dominant)
  - "Today" button to jump back to current date

- [ ] **Verify the full Today view:**
  - Open `/today` → see the date headline
  - Overdue tasks appear at the top (if any)
  - Today's tasks appear in the main section
  - Completed tasks are collapsed by default
  - Inline quick add works — type a task, press Enter, it appears in the list
  - Navigation between days works
  - Mobile layout looks good

---

### B5. Wire Up Task Data 🔴

- [ ] **Connect** `TodayPage` to the existing `TaskContext`.

  The `TaskContext` already has `fetchTasks('daily', date)` which returns tasks for a given day. Use this.

  Logic for splitting tasks:
  ```javascript
  const overdueTasks = tasks.filter(t => {
    if (t.status === 'completed') return false;
    const age = getTaskAge(t);
    return age.days > 0;
  });

  const activeTasks = tasks.filter(t => {
    if (t.status === 'completed') return false;
    const age = getTaskAge(t);
    return age.days <= 0;
  });

  const completedTasks = tasks.filter(t => t.status === 'completed');
  ```

  **Note:** The overdue filtering logic may need refinement based on how the backend already handles migration. Check how the existing `TaskList` component filters — look at `client/src/components/tasks/TaskList.jsx` for the current sorting/filtering approach and reuse what makes sense.

- [ ] **Verify** — real task data appears in the Today view. Create a test task, see it appear. Complete it, see it move to Completed section.

---

## Phase C: Review Flow

*Goal: Build the review/migration screen — a first-class ritual for processing aging tasks.*

---

### C1. Create ReviewCard Component 🔴

- [ ] **Create** `client/src/components/review/ReviewCard.jsx`

  A larger card for reviewing a single task.

  Props:
  - `task` — the task object
  - `onKeep` — keep the task on today
  - `onMoveForward` — move to tomorrow or a future date
  - `onBacklog` — send to backlog
  - `onDelete` — delete the task

  Layout:
  ```
  ┌──────────────────────────────────────────────────┐
  │                                                  │
  │  ◯  Task content here                           │
  │     Note text if present (muted)                 │
  │     #tag #tag                      3 days old    │
  │                                                  │
  │  [ Keep Today ]  [ Tomorrow ]  [ Backlog ]  [ ✕ ]│
  │                                                  │
  └──────────────────────────────────────────────────┘
  ```

  Requirements:
  - Card with `parchment.paper` background, subtle border, 16px border-radius
  - Left border: aging color (3px)
  - Task content: same styling as `TaskRow` but larger (body1 at 1rem)
  - Age label in top-right: "3 days old" in `aging.overdue` color
  - Four action buttons at the bottom:
    - **Keep Today**: outlined, primary blue
    - **Tomorrow**: outlined, muted
    - **Backlog**: outlined, muted
    - **Delete (✕)**: ghost button, muted, turns red on hover
  - Padding: 20px
  - Margin bottom: 16px between cards
  - On mobile: action buttons stack into a 2×2 grid or use full-width rows

- [ ] **Verify** — render with a mock task. All four actions fire callbacks.

---

### C2. Create ReviewProgress Component 🟠

- [ ] **Create** `client/src/components/review/ReviewProgress.jsx`

  Shows progress through the review queue.

  Props:
  - `total` — total tasks to review
  - `reviewed` — number reviewed so far

  Requirements:
  - Text: "3 of 7 reviewed"
  - Subtle progress bar beneath the text
  - Progress bar: 4px tall, rounded, primary blue fill
  - When all reviewed: text changes to "All caught up!" in `aging.fresh` color

- [ ] **Verify** — progress updates as `reviewed` prop changes.

---

### C3. Create ReviewComplete Component 🟡

- [ ] **Create** `client/src/components/review/ReviewComplete.jsx`

  The "all caught up" completion state.

  Requirements:
  - Centered in the page
  - Display text (Fraunces): "All caught up"
  - Subtitle (muted): "You've reviewed all aging tasks. Nice work."
  - Optional: subtle checkmark illustration or icon (lucide: `CheckCircle2`, large, muted green)
  - Button: "Back to Today" → navigates to `/today`

- [ ] **Verify** — renders correctly, button navigates.

---

### C4. Build ReviewPage 🔴

- [ ] **Update** `client/src/pages/ReviewPage.jsx` (replace the placeholder):

  Requirements:
  - Fetch all aging tasks (tasks where `getTaskAge(task).days > 0` and `status !== 'completed'`)
  - This may require a new API call or filtering all tasks client-side
  - Two modes (toggle at top):
    - **End of Day**: today's incomplete tasks
    - **Weekly Review**: all aging tasks from the past week
  - Display `ReviewProgress` at the top
  - Render `ReviewCard` for each task
  - When a user takes action on a card:
    - **Keep Today**: update task's dueDate to today, remove from review queue
    - **Tomorrow**: update task's dueDate to tomorrow, remove from queue
    - **Backlog**: update task status to `migrated_back`, dueDate = null, remove from queue
    - **Delete**: delete the task, remove from queue
  - Track reviewed count for progress
  - When queue is empty: show `ReviewComplete`
  - Page header: "Review" in Fraunces (h2), with subtitle "X tasks need your attention"

- [ ] **Verify:**
  - Navigate to `/review`
  - See aging tasks as review cards
  - Take action on each card — it disappears from the list
  - Progress bar updates
  - When all reviewed, see completion state
  - Actions actually update the tasks in the database (check via /today or API)

---

## Phase D: Plan Views

*Goal: Build the future planning views — weekly spread, monthly calendar, backlog.*

---

### D1. Build Weekly Spread 🔴

- [ ] **Create** `client/src/components/plan/WeeklySpread.jsx`

  A 7-column week view.

  Props:
  - `date` — the reference date (determines which week to show)
  - `onDateChange` — callback when navigating weeks

  Requirements:
  - Desktop (≥900px): 7 equal columns side by side
  - Mobile (<600px): horizontal scroll, each day column is ~200px wide
  - Each column:
    - Header: day name + date number ("Mon 10")
    - Today's column: highlighted with subtle primary blue background
    - Task list: compact `TaskRow` components
    - "+ Add" at bottom of each column
  - Week navigation: left/right arrows + "This Week" button
  - Drag tasks between columns to reschedule (stretch goal — can skip for first pass)

- [ ] **Verify** — 7 columns render with correct dates. Tasks appear in correct day columns. Navigation changes week. Today is highlighted.

---

### D2. Build Monthly Calendar 🟠

- [ ] **Create** `client/src/components/plan/MonthlyCalendar.jsx`

  A calendar grid with task indicators.

  Props:
  - `date` — the reference date (determines which month to show)
  - `onDateChange` — callback when navigating months
  - `onDayClick` — callback when a day is clicked

  Requirements:
  - Standard calendar grid (7 columns × 5-6 rows)
  - Each day cell shows:
    - Day number
    - Colored dots indicating task count/status (max 3-4 dots, then "+N")
    - Dot colors: use aging system colors
  - Today: highlighted cell (subtle primary blue border)
  - Click a day: navigate to `/today` with that date selected (or open a detail panel)
  - Month navigation: left/right arrows + "This Month" button
  - Weekday header row: Mon, Tue, Wed, Thu, Fri, Sat, Sun

  You can reuse or adapt logic from the existing `MonthlyLog` component (`client/src/components/monthly/MonthlyLog.jsx`).

- [ ] **Verify** — calendar renders for the current month. Days with tasks show dots. Navigation works. Clicking a day does something useful.

---

### D3. Build Backlog List 🟠

- [ ] **Create** `client/src/components/plan/BacklogList.jsx`

  A list of parked/backlog tasks.

  Requirements:
  - Fetch tasks where `status === 'migrated_back'` or `isBacklog === true`
  - Sort by age (oldest first)
  - Each task: `TaskRow` with age indicator
  - Bulk actions at top: "Review All" (goes to Review mode for backlog only)
  - Stale task prompts: tasks older than 30 days get a subtle message — "This has been here 30 days. Still relevant?"
  - Section header: "Backlog" with count
  - Empty state: "Backlog is empty — everything is accounted for."

- [ ] **Verify** — backlog tasks appear, sorted by age. Empty state shows when appropriate.

---

### D4. Assemble PlanPage 🔴

- [ ] **Update** `client/src/pages/PlanPage.jsx` (replace the placeholder):

  Requirements:
  - Sub-navigation tabs at top: **Weekly** | **Monthly** | **Backlog**
  - Default sub-view: Weekly
  - Routes:
    - `/plan` or `/plan/weekly` → `WeeklySpread`
    - `/plan/monthly` → `MonthlyCalendar`
    - `/plan/backlog` → `BacklogList`
  - Tabs are styled as simple text buttons, underline active tab
  - Page header: "Plan" in Fraunces (h2)

- [ ] **Verify:**
  - Navigate to `/plan` → see weekly spread
  - Click "Monthly" tab → see calendar
  - Click "Backlog" tab → see backlog list
  - All sub-views show real data

---

## Phase E: Polish & Interactions

*Goal: Add the details that make the app feel crafted — animations, keyboard shortcuts, command palette, dark mode refinement.*

---

### E1. Command Palette (Cmd+K) 🔴

- [ ] **Create** `client/src/components/shared/CommandPalette.jsx`

  A VS Code / Linear style command palette for quick task entry.

  Requirements:
  - Opens on `Cmd+K` (Mac) or `Ctrl+K` (Windows)
  - Full-width centered modal (50-60% of viewport width, near top)
  - Single input field at top
  - Typing text creates a new task
  - Autocomplete suggestions below:
    - `#` triggers tag suggestions (from existing tags)
    - `!high`, `!medium`, `!low` sets priority
    - `@tomorrow`, `@next week` sets due date
  - Press Enter to create the task
  - Press Escape to close
  - Subtle backdrop blur
  - Animated entry: slide down + fade in (framer-motion)
  - This uses the existing `TaskContext.createTask()` method

- [ ] **Wire** into `AppShell` — render `CommandPalette` at the app root level, listen for keyboard shortcut globally.

- [ ] **Verify:**
  - Press Cmd+K → palette opens
  - Type "Fix auth bug #backend !high" → Enter → task created with tag "backend" and priority 1
  - Press Escape → palette closes
  - Works from any page

---

### E2. Keyboard Shortcuts 🟠

- [ ] **Create** `client/src/hooks/useKeyboardShortcuts.js`

  A custom hook that registers global keyboard shortcuts.

  Shortcuts to implement:
  | Shortcut | Action |
  |----------|--------|
  | `Cmd+K` / `Ctrl+K` | Open command palette |
  | `Cmd+N` / `Ctrl+N` | Focus inline quick add (Today only) |
  | `g t` | Navigate to Today |
  | `g r` | Navigate to Review |
  | `g p` | Navigate to Plan |

  Notes:
  - For two-key shortcuts (like `g t`): track the first key press, wait 500ms for the second
  - Don't fire shortcuts when user is typing in an input/textarea
  - Use `useEffect` with `keydown` listener

- [ ] **Wire** into `AppShell`.

- [ ] **Verify** — each shortcut works. No conflicts with browser shortcuts. Shortcuts don't fire while typing.

---

### E3. Page Transitions 🟡

- [ ] **Add** `framer-motion` page transitions in `AppShell`.

  Requirements:
  - Wrap the `children` content area in `AnimatePresence` and `motion.div`
  - On route change: crossfade (opacity 0 → 1, 200ms)
  - No slide or scale — just a calm fade
  - Use `key={location.pathname}` to trigger re-animation

  ```jsx
  import { AnimatePresence, motion } from 'framer-motion';

  <AnimatePresence mode="wait">
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  </AnimatePresence>
  ```

- [ ] **Verify** — navigating between Today/Review/Plan shows a subtle fade. No jank.

---

### E4. Skeleton Loaders 🟠

- [ ] **Implement** skeleton loading in `TodayPage`:
  - While `TaskContext` is fetching, show `SkeletonLoader` instead of task sections
  - Transition from skeleton to content should be smooth (fade)

- [ ] **Implement** skeleton loading in `ReviewPage`:
  - While fetching aging tasks, show skeleton review cards

- [ ] **Verify** — on slow network (use Chrome DevTools throttling), skeletons appear before content loads.

---

### E5. Dark Mode Refinement 🟠

- [ ] **Audit** every new component for dark mode compatibility:
  - `TaskRow` — check border colors, text colors, background
  - `ReviewCard` — check card background, button styles
  - `Sidebar` — already dark, should look good
  - `TopBar` — should use dark surface colors
  - `PageHeader` — Fraunces font should render well on dark bg
  - `CommandPalette` — dark modal background, light text
  - `MobileTabBar` — dark background, correct icon colors

- [ ] **Test** by toggling theme:
  - No white flashes
  - All text is readable
  - Borders are visible but subtle
  - Aging colors still stand out against dark backgrounds

- [ ] **Verify** — screenshot both modes, compare side by side. No ugly or broken states.

---

### E6. List Animations 🟡

- [ ] **Add** `framer-motion` `AnimatePresence` to task lists:
  - New tasks: fade in + slide down (200ms)
  - Completed tasks: fade out + slide right (300ms) before moving to Completed section
  - Deleted tasks: fade out + scale down (200ms)
  - Reordered tasks: smooth layout animation (use `layout` prop from framer-motion)

  ```jsx
  <AnimatePresence>
    {tasks.map(task => (
      <motion.div
        key={task._id}
        layout
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: 50 }}
        transition={{ duration: 0.2 }}
      >
        <TaskRow task={task} />
      </motion.div>
    ))}
  </AnimatePresence>
  ```

- [ ] **Verify** — add a task, see it animate in. Complete a task, see it animate out. Reorder tasks, see smooth repositioning.

---

### E7. Toast Notifications 🟡

- [ ] **Create** `client/src/components/shared/Toast.jsx`

  Simple notification toasts for task actions.

  Requirements:
  - Appears bottom-center of screen
  - Auto-dismisses after 3 seconds
  - Types: success (green), error (red), info (blue)
  - Includes undo button for destructive actions (delete, complete)
  - Example: "Task completed" [Undo]
  - Uses `framer-motion` for slide-up animation
  - Create a `useToast` hook or simple context to trigger toasts from anywhere

- [ ] **Wire** toasts into task actions:
  - Complete task → "Task completed" with Undo
  - Delete task → "Task deleted" with Undo
  - Task created → "Task added"

- [ ] **Verify** — perform task actions, see toasts. Undo works within the 3-second window.

---

## Phase F: Cleanup & Migration

*Goal: Remove old code, ensure everything works, update documentation.*

---

### F1. Remove Old Views 🟠

- [ ] **Remove** old route handling for `/tasks/*` (after confirming redirects work)
- [ ] **Remove** `client/src/components/MainContent.jsx` (replaced by route-based pages)
- [ ] **Remove** `client/src/components/navigation/BottomNav.jsx` (replaced by `MobileTabBar`)
- [ ] **Remove** old `AppLayout.jsx` (replaced by `AppShell`)
- [ ] Keep `TaskList.jsx` for now — some of its logic may still be used by plan views. Mark it for later cleanup.

- [ ] **Verify** — app runs cleanly with no dead imports or missing components.

---

### F2. Update Documentation 🟠

- [ ] **Update** `DOCS/CONTEXT.md`:
  - Update the directory structure section
  - Update the Current Features section
  - Update the route list
  - Update the UI/UX grade (should be B+ or better now)

- [ ] **Update** `DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md`:
  - Add new font families (Fraunces, Source Sans 3, IBM Plex Mono)
  - Add new color tokens (ink, parchment, aging)
  - Update component descriptions

- [ ] **Update** `README.md` with new screenshots and updated feature list.

---

### F3. Cross-Browser & Device Testing 🔴

- [ ] **Test on:**
  - Chrome (desktop)
  - Safari (desktop)
  - Firefox (desktop)
  - Chrome (Android)
  - Safari (iOS)

- [ ] **Check for:**
  - Font loading (Fraunces, Source Sans 3, IBM Plex Mono)
  - Layout integrity on all screen sizes
  - Touch targets ≥ 44px on mobile
  - No horizontal scrolling on mobile (except weekly view, which is intentional)
  - Dark mode works everywhere
  - Animations perform at 60fps (no jank)

- [ ] **Fix** any issues found.

---

## Quick Reference: File Map

| New File | Purpose | Phase |
|----------|---------|-------|
| `components/layout/AppShell.jsx` | Main layout wrapper | A |
| `components/layout/Sidebar.jsx` | Desktop navigation | A |
| `components/layout/TopBar.jsx` | Top bar | A |
| `components/layout/MobileTabBar.jsx` | Mobile bottom tabs | A |
| `components/layout/PageHeader.jsx` | Date headline + stats | B |
| `components/today/OverdueSection.jsx` | Overdue tasks section | B |
| `components/today/TodaySection.jsx` | Active tasks section | B |
| `components/today/CompletedSection.jsx` | Collapsed completed tasks | B |
| `components/today/InlineQuickAdd.jsx` | Always-visible quick add | B |
| `components/review/ReviewCard.jsx` | Single task review card | C |
| `components/review/ReviewProgress.jsx` | Review progress bar | C |
| `components/review/ReviewComplete.jsx` | "All caught up" state | C |
| `components/plan/WeeklySpread.jsx` | 7-column week view | D |
| `components/plan/MonthlyCalendar.jsx` | Calendar grid | D |
| `components/plan/BacklogList.jsx` | Parked tasks list | D |
| `components/tasks/TaskRow.jsx` | Planner-line task row | B |
| `components/tasks/TaskCheckbox.jsx` | Animated checkbox | B |
| `components/tasks/TaskAgingIndicator.jsx` | Age color indicator | B |
| `components/shared/CommandPalette.jsx` | Cmd+K quick entry | E |
| `components/shared/SectionHeader.jsx` | Section labels | A |
| `components/shared/EmptyState.jsx` | Empty state display | A |
| `components/shared/SkeletonLoader.jsx` | Loading placeholders | A |
| `components/shared/Toast.jsx` | Notification toasts | E |
| `hooks/useKeyboardShortcuts.js` | Keyboard shortcut handler | E |
| `utils/taskAging.js` | Task age calculations | A |
| `utils/constants.js` | App-wide constants | A |
| `pages/TodayPage.jsx` | Today view page | B |
| `pages/ReviewPage.jsx` | Review view page | C |
| `pages/PlanPage.jsx` | Plan view page | D |

---

## Completion Checklist

### Phase A Complete When:
- [ ] New fonts loading and visible
- [ ] New color tokens in place
- [ ] AppShell renders with sidebar (desktop) and tabs (mobile)
- [ ] Routes work: `/today`, `/review`, `/plan`
- [ ] Old routes redirect correctly
- [ ] Shared components created and rendering

### Phase B Complete When:
- [ ] TodayPage shows real tasks in three sections (overdue, active, completed)
- [ ] TaskRow looks like a planner line, not a data row
- [ ] Checkbox animates on complete
- [ ] Aging borders show correct colors
- [ ] Inline quick add creates tasks
- [ ] Page header shows date and stats

### Phase C Complete When:
- [ ] ReviewPage shows aging tasks as review cards
- [ ] All four actions work (keep, move, backlog, delete)
- [ ] Progress bar tracks review completion
- [ ] "All caught up" state appears when done

### Phase D Complete When:
- [ ] Weekly spread shows 7 columns with real data
- [ ] Monthly calendar shows task dots per day
- [ ] Backlog list shows parked tasks with age indicators
- [ ] Plan sub-navigation works

### Phase E Complete When:
- [ ] Cmd+K opens command palette and creates tasks
- [ ] Keyboard shortcuts navigate the app
- [ ] Page transitions are smooth
- [ ] Skeleton loaders appear during loads
- [ ] Dark mode looks good everywhere
- [ ] Task list animations work
- [ ] Toast notifications appear for actions

### Phase F Complete When:
- [ ] Old code removed
- [ ] Documentation updated
- [ ] Tested on all target browsers/devices
- [ ] No console errors
- [ ] No broken layouts
