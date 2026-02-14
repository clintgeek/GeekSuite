# BuJoGeek — UI Redesign Plan

## The Problem

BujoGeek currently feels like a **task admin panel** — filters, rows, generic productivity SaaS. It's functional but lifeless. The user rarely opens it because it doesn't feel like a daily planning ritual. It feels disconnected from the real paper bullet journal workflow that inspired it.

We're fixing that.

---

## The Vision

**BujoGeek is a Digital Daily Planner.**

Not a task database. Not a kanban board. Not an admin dashboard.

Think: daily log, weekly review, monthly planning, momentum and progress.

The app should feel like **opening a leather-bound planner** — warm, focused, intentional — not like opening Jira.

### Tone
- Calm
- Intentional
- Focused
- Warm

### Aesthetic Direction: *"Analog Soul, Digital Spine"*

We're going for an **editorial / stationery** aesthetic. Think of a beautifully typeset planner page — generous whitespace, strong typographic hierarchy, subtle paper-like warmth. Not brutalist, not maximalist. **Refined minimalism with craft.** Every element should feel placed with care, like a well-designed notebook spread.

The one thing someone should remember: *"It felt like a real planner."*

---

## Product Context

### Where BujoGeek Sits in GeekSuite

| App | Role |
|-----|------|
| **NoteGeek** | Thinking workspace |
| **BujoGeek** | Daily planning + execution |
| **FitnessGeek** | Tracking & review |
| **FlockGeek** | Operations |

**Flow:** Paper notebook → quick capture → NoteGeek → long-form thinking → **BujoGeek → decide what gets done today**

BujoGeek is the "start your day" app. The bridge between thinking and doing.

### The Real Workflow

The user does NOT want to replace paper. Paper is for fast scribbling, meeting notes, thinking with pen.

BujoGeek is for:
- Processing notes later
- Deciding what matters
- Planning the day
- Tracking commitments
- **Automatic migration of tasks**

### Core Philosophy

Paper bullet journaling intentionally forces manual migration. Software should **remove the repetitive labor but keep the intentional review.**

> **Key principle: Automatic migration with intentional review.**

---

## The Daily Loop

This app is designed around a **ritual**, not a feature set.

| Time | Action |
|------|--------|
| **Morning** | Open BujoGeek → decide what today looks like |
| **During day** | Live in Today view → work from it |
| **Evening** | Review → carry forward or delete tasks |

This ritual is the center of gravity for every design decision.

---

## What Must Be Preserved

These behaviors are correct and must remain:

- Tasks **automatically migrate** forward (day → week → month)
- Aging tasks **turn red** to create urgency
- Aging tasks **bubble to the top** to force review
- This creates **passive accountability** — the system nags without notifications

---

## Aesthetic & Design System

### Typography

We reject generic fonts. The planner needs **character**.

| Role | Font | Why |
|------|------|-----|
| **Display / Headers** | **Fraunces** (variable, optical size) | Soft serif with warmth — feels like a printed planner title. Unexpected, memorable. |
| **Body / UI** | **Source Sans 3** | Humanist sans-serif. Readable, warm, not clinical like Inter or Roboto. Slightly rounder. |
| **Signifiers / Mono** | **IBM Plex Mono** | Clean monospace with personality. Better than JetBrains Mono for UI contexts — slightly warmer. |

All three are free via Google Fonts.

### Color Palette

The palette shifts from "generic blue SaaS" to **warm, grounded planner tones** while keeping the GeekSuite blue as anchor.

```
Primary (GeekSuite Blue — retained)
  500: #6098CC    ← anchor
  600: #4B7AA3
  400: #7AB4E0

Ink (replaces neutral grays — warm charcoal tones)
  900: #1A1A2E    ← primary text, deep ink
  800: #2D2D44    ← secondary text
  700: #44445C    ← tertiary
  400: #8E8EA0    ← muted
  200: #D4D4DC    ← borders
  100: #EDEDF0    ← subtle bg
   50: #F7F7F8    ← page bg

Parchment (warm background tones)
  default: #FAF9F7    ← main background (warm off-white, like paper)
  paper:   #FFFFFF    ← cards, elevated surfaces
  warm:    #F5F0EB    ← section backgrounds, subtle warmth

Accent: Aging / Urgency
  fresh:   #5B9E6F    ← new/today tasks (sage green)
  aging:   #D4843E    ← 2-3 day old (warm amber)
  overdue: #C4453C    ← overdue (muted red, not screaming)
  stale:   #8B4D6A    ← old backlog (muted plum)

Priority
  high:    #C4453C    ← muted red
  medium:  #D4843E    ← warm amber
  low:     #6098CC    ← the blue
```

### Dark Mode

Dark mode should feel like **writing in a dimly lit study**, not a terminal.

```
Background:  #1A1A2E (deep navy-charcoal, not pure black)
Surface:     #242440 (elevated cards)
Elevated:    #2D2D50 (popovers, modals)
Text:        #E8E8EC (soft white, not harsh)
Muted:       #8E8EA0
Border:      #3A3A55
```

### Iconography

Replace Material UI icons with **Lucide** icons. Lucide is:
- Lighter weight
- More consistent stroke width
- Less corporate, more craft-like
- Tree-shakeable

### Motion

Intentional, not gratuitous. Think pen-on-paper, not bounce-and-pop.

- **Page transitions:** Subtle crossfade (200ms)
- **Task completion:** Smooth strikethrough + gentle fade (not confetti)
- **List reordering:** Smooth spring physics via Framer Motion
- **Review flow:** Slide-in panels, not modal stacking
- **Loading:** Skeleton placeholders with subtle shimmer

### Spatial Design

- **Generous whitespace** — let the planner breathe
- **Clear vertical rhythm** — consistent spacing scale
- **Card depth:** Minimal shadow, rely on borders and background contrast
- **No dense tables.** No admin grids. Planner surfaces only.

---

## App Structure

### Information Architecture

```
BujoGeek
├── Today (primary — the daily planner page)
│   ├── Focus Section (top — what matters most)
│   ├── Today's Tasks (main list)
│   ├── Aging / Overdue (surfaced inline, visually distinct)
│   └── Quick Add (always accessible)
│
├── Review (first-class experience)
│   ├── Aging Tasks (cards with keep/move/delete actions)
│   ├── End-of-Day Review
│   └── Weekly Review
│
├── Plan (secondary)
│   ├── Weekly spread
│   ├── Monthly calendar
│   └── Backlog / Someday
│
├── Templates (utility)
│   └── Manage + apply daily templates
│
└── Settings (minimal)
    ├── Theme toggle
    ├── Account
    └── Preferences
```

### Navigation Model

| Platform | Navigation |
|----------|-----------|
| **Desktop (≥900px)** | Left sidebar (permanent, 240px) — collapsible |
| **Tablet (600-899px)** | Left sidebar (overlay on hamburger tap) |
| **Mobile (<600px)** | Bottom tab bar (4 tabs: Today, Review, Plan, More) |

The sidebar becomes the **planner's table of contents**. Clean, quiet, always there on desktop.

---

## View Designs

### 1. Today View — *The Daily Page*

This is the **most important screen in the entire app.** It must answer one question immediately:

> "What am I doing today?"

#### Layout (Desktop)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Friday, February 13                              + Add Task     │
│  "13 tasks · 3 overdue · 5 completed"                           │
│                                                                  │
│  ┌─ OVERDUE ──────────────────────────────────────────────────┐  │
│  │ ◯  Renew AWS credentials           3 days ago   !high     │  │
│  │ ◯  Review Sarah's PR               2 days ago   !med      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ TODAY ────────────────────────────────────────────────────┐  │
│  │ ◯  Sprint planning meeting         10:00 AM               │  │
│  │ ◯  JIRA-1234: Fix auth timeout     !high  #backend        │  │
│  │ ◯  Write deployment runbook                 #docs          │  │
│  │ ◯  Reply to vendor email                    #ops           │  │
│  │ ✓  Update standup notes            ────────────────        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ COMPLETED (5) ─────────────────────── [collapse] ─────────┐  │
│  │ ✓  Morning review                                          │  │
│  │ ✓  Check CI pipeline                                       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  + What needs to get done today?                         │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### Key Design Decisions

- **Date as headline** — large, display font (Fraunces). This is a planner page, not a data table.
- **Stats line** — subtle summary beneath date. Momentum at a glance.
- **Overdue section** — always at top if items exist. Warm amber/red background tint. Cannot be ignored.
- **Today section** — the main working list. Clean, spacious task rows.
- **Completed section** — collapsed by default. Satisfying to peek at.
- **Inline quick add** — persistent at bottom. Always one keystroke away. No modal needed for simple tasks.
- **No filters visible by default.** This is a daily planner, not a search tool. Filters live behind a toggle.

#### Task Row Design

Each task row is a **planner line**, not a table row.

```
◯  Task content here              due badge    priority    #tag
   └─ note text (if present, muted italic)
```

- **Checkbox:** Custom SVG circle, not MUI checkbox. Animated stroke on complete.
- **Content:** Source Sans 3, 15px, weight 500.
- **Signifier:** IBM Plex Mono badge, subtle background. Left of content.
- **Due badge:** Relative time ("today", "tomorrow", "3 days ago"). Color-coded by freshness.
- **Priority:** Small dot or subtle icon. Not a flag.
- **Tags:** Small chips, muted. Don't compete with content.
- **Aging indicator:** Left border color shifts from fresh (green) → aging (amber) → overdue (red) → stale (plum).

### 2. Review View — *The Migration Ritual*

This is a **first-class experience**, not a filter on the task list.

#### Purpose
- See everything that's aging
- Make intentional decisions: keep, move forward, or let go
- Feel closure at end of day/week

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Review                                     End of Day | Weekly  │
│  "7 tasks need your attention"                                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  ◯  Renew AWS credentials                    3 days old   │  │
│  │                                                            │  │
│  │  [ Keep Today ]  [ Move to Tomorrow ]  [ Backlog ]  [ ✕ ] │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │  ◯  Review Sarah's PR                        2 days old   │  │
│  │                                                            │  │
│  │  [ Keep Today ]  [ Move to Tomorrow ]  [ Backlog ]  [ ✕ ] │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ── All caught up! ──                                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### Key Design Decisions

- **Card-per-task** — larger cards than the daily view. One decision per card.
- **Explicit actions** — four clear buttons: Keep, Move, Backlog, Delete.
- **Progress indicator** — "3 of 7 reviewed" with a subtle progress bar.
- **Completion state** — when all tasks reviewed, show a calm "All caught up" message.
- **Two modes:** End-of-Day (today's unfinished) and Weekly (everything aging).
- **Swipeable on mobile** — swipe right to keep, swipe left to dismiss.

### 3. Plan View — *Future Planning*

Secondary view for looking ahead. Should NOT dominate the app.

#### Sub-views

**Weekly Spread:**
```
┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│   Mon   │   Tue   │   Wed   │   Thu   │   Fri   │   Sat   │   Sun   │
│         │         │  ★ TODAY │         │         │         │         │
│  task   │  task   │  task   │  task   │         │         │         │
│  task   │         │  task   │         │         │         │         │
│         │         │  task   │         │         │         │         │
└─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
```

- 7-column grid on desktop
- Horizontal scroll on mobile
- Drag tasks between days
- Today column visually highlighted

**Monthly Calendar:**
- Calendar grid with task-count dots per day
- Click day to drill into daily view
- Carry-forward indicators (arrows on days with migrated tasks)

**Backlog / Someday:**
- Separate area for parked tasks
- Age indicators (how long has this been here?)
- Bulk review actions
- "This has been here 30 days — still relevant?" prompts

---

## Component Architecture

### New Component Tree

```
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.jsx            ← replaces AppLayout (sidebar + header + main)
│   │   ├── Sidebar.jsx             ← desktop navigation
│   │   ├── TopBar.jsx              ← minimal top bar (date, actions, avatar)
│   │   ├── MobileTabBar.jsx        ← bottom tabs for mobile
│   │   └── PageHeader.jsx          ← reusable date headline + stats
│   │
│   ├── today/
│   │   ├── TodayPage.jsx           ← the primary screen
│   │   ├── OverdueSection.jsx      ← overdue tasks, visually urgent
│   │   ├── TodaySection.jsx        ← today's active tasks
│   │   ├── CompletedSection.jsx    ← collapsible completed list
│   │   └── InlineQuickAdd.jsx      ← persistent quick-add input
│   │
│   ├── review/
│   │   ├── ReviewPage.jsx          ← the review/migration screen
│   │   ├── ReviewCard.jsx          ← single task review card with actions
│   │   ├── ReviewProgress.jsx      ← "3 of 7 reviewed" indicator
│   │   └── ReviewComplete.jsx      ← "all caught up" state
│   │
│   ├── plan/
│   │   ├── PlanPage.jsx            ← future planning container
│   │   ├── WeeklySpread.jsx        ← 7-column week view
│   │   ├── MonthlyCalendar.jsx     ← calendar grid with task dots
│   │   └── BacklogList.jsx         ← someday/parked tasks
│   │
│   ├── tasks/
│   │   ├── TaskRow.jsx             ← replaces TaskCard (planner-line style)
│   │   ├── TaskCheckbox.jsx        ← custom animated checkbox
│   │   ├── TaskSignifier.jsx       ← signifier badge component
│   │   ├── TaskAgingIndicator.jsx  ← left-border color by age
│   │   ├── TaskInlineEdit.jsx      ← click-to-edit inline
│   │   ├── TaskContextMenu.jsx     ← right-click actions (desktop)
│   │   ├── TaskSwipeActions.jsx    ← swipe actions (mobile)
│   │   └── TaskEditor.jsx          ← full edit modal (keep existing, restyle)
│   │
│   ├── shared/
│   │   ├── CommandPalette.jsx      ← Cmd+K quick entry
│   │   ├── DateNavigator.jsx       ← compact date nav with calendar dropdown
│   │   ├── SectionHeader.jsx       ← reusable section label ("OVERDUE", "TODAY")
│   │   ├── EmptyState.jsx          ← illustrated empty states
│   │   ├── SkeletonLoader.jsx      ← loading placeholders
│   │   └── Toast.jsx               ← notification toasts
│   │
│   └── auth/                       ← keep existing, restyle
│       ├── LoginForm.jsx
│       └── RegisterForm.jsx
│
├── theme/
│   ├── theme.js                    ← updated MUI theme
│   ├── colors.js                   ← new color tokens
│   ├── typography.js               ← font definitions
│   └── animations.js               ← shared animation configs
│
├── hooks/
│   ├── useTaskAging.js             ← compute age/urgency of tasks
│   ├── useReview.js                ← review flow state
│   ├── useKeyboardShortcuts.js     ← global + contextual shortcuts
│   └── useDateNavigation.js        ← date state + navigation logic
│
├── context/
│   ├── AuthContext.jsx             ← keep existing
│   ├── TaskContext.jsx             ← keep existing, extend
│   └── ThemeContext.jsx            ← keep existing
│
├── pages/
│   ├── TodayPage.jsx              ← route: /today (default)
│   ├── ReviewPage.jsx             ← route: /review
│   ├── PlanPage.jsx               ← route: /plan, /plan/weekly, /plan/monthly, /plan/backlog
│   ├── TemplatesPage.jsx          ← keep existing, restyle
│   ├── LoginPage.jsx              ← keep existing, restyle
│   └── RegisterPage.jsx           ← keep existing, restyle
│
└── utils/
    ├── taskAging.js               ← age calculation + color mapping
    ├── dateHelpers.js             ← date formatting utilities
    └── constants.js               ← app-wide constants
```

### Route Structure

| Route | View | Notes |
|-------|------|-------|
| `/` | Redirect → `/today` | |
| `/today` | Today Page | **Primary screen** |
| `/review` | Review Page | End-of-day / weekly review |
| `/plan` | Plan Page | Defaults to weekly spread |
| `/plan/weekly` | Weekly Spread | |
| `/plan/monthly` | Monthly Calendar | |
| `/plan/backlog` | Backlog List | |
| `/templates` | Templates | |
| `/login` | Login | |
| `/register` | Register | |

### Migration from Current Routes

| Old Route | New Route |
|-----------|-----------|
| `/tasks/daily` | `/today` |
| `/tasks/weekly` | `/plan/weekly` |
| `/tasks/monthly` | `/plan/monthly` |
| `/tasks/year` | `/plan/monthly` (year view removed or nested) |
| `/tasks/all` | `/plan/backlog` (or search via Cmd+K) |

---

## Key UX Patterns

### Quick Add (Cmd+K / Inline)

Two entry points:

1. **Inline Quick Add** — always visible at bottom of Today view. For fast "add to today" tasks.
2. **Command Palette** (Cmd+K) — full modal for richer entry. Natural language parsing, date/tag/priority shortcuts.

### Aging System (Visual)

Tasks communicate urgency through **color, not badges or numbers.**

| Age | Left Border | Background Tint | Label |
|-----|------------|-----------------|-------|
| Fresh (today) | `#5B9E6F` sage | none | — |
| 1-2 days | `#D4843E` amber | subtle warm | "yesterday" |
| 3-7 days | `#C4453C` muted red | warm | "3 days ago" |
| 7+ days | `#8B4D6A` plum | subtle | "12 days ago" |

### Keyboard-First

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open command palette |
| `Cmd+N` | New task (inline) |
| `j / k` | Navigate task list |
| `x` | Toggle complete |
| `e` | Edit task |
| `d` | Delete (with confirm) |
| `r` | Open review |
| `1 / 2 / 3` | Set priority |
| `g t` | Go to Today |
| `g r` | Go to Review |
| `g p` | Go to Plan |

---

## What This Is NOT

- **Not a Notion clone** — no databases, no blocks, no infinite nesting
- **Not a kanban board** — no columns, no swimlanes
- **Not Todoist** — no projects hierarchy, no natural language dates as core feature
- **Not Linear** — no issue tracking, no sprints

**It IS:**
- A daily planner you actually open every morning
- A migration engine that keeps nothing forgotten
- A calm surface for operational planning
- A ritual, not a tool

---

## Dependencies to Add

| Package | Purpose |
|---------|---------|
| `lucide-react` | Icon library (replaces MUI icons) |
| `framer-motion` | Animations and gestures |
| `@fontsource/fraunces` | Display font (or Google Fonts link) |
| `@fontsource/source-sans-3` | Body font (or Google Fonts link) |
| `@fontsource/ibm-plex-mono` | Mono font (or Google Fonts link) |

### Dependencies to Consider Removing (Later)

| Package | Reason |
|---------|--------|
| `@mui/icons-material` | Replaced by Lucide (large bundle) |
| `zustand` | Currently unused |

---

## Implementation Phases

### Phase A: Foundation (Week 1)
- New typography + color tokens
- Updated MUI theme
- New AppShell layout (sidebar, topbar, mobile tabs)
- Route restructure (Today, Review, Plan)

### Phase B: Today View (Week 2)
- TodayPage with sections (Overdue, Today, Completed)
- TaskRow component (replaces TaskCard)
- Inline quick add
- Aging indicator system

### Phase C: Review Flow (Week 3)
- ReviewPage with card-per-task layout
- Keep/Move/Backlog/Delete actions
- Progress indicator
- End-of-day + weekly modes

### Phase D: Plan Views (Week 4)
- Weekly spread (7-column)
- Monthly calendar with task dots
- Backlog list with age indicators

### Phase E: Polish (Week 5)
- Command palette (Cmd+K)
- Keyboard shortcuts
- Animations (Framer Motion)
- Skeleton loaders
- Empty states
- Dark mode refinement

---

## Success Criteria

| Metric | Target |
|--------|--------|
| **Opens per day** | User opens BujoGeek at least once daily |
| **Time to "what am I doing today?"** | < 2 seconds from app open |
| **Task creation** | < 3 seconds for a simple task |
| **Review completion** | User completes end-of-day review 3+ times/week |
| **Feel** | "It feels like my planner, not like software" |

---

## Related Documents

- `CONTEXT.md` — Project context and current state
- `THE_PLAN.md` — Strategic improvement roadmap (broader scope)
- `THE_STEPS.md` — Tactical implementation steps (broader scope)
- `THE_UI_STEPS.md` — Intern-friendly implementation steps for this redesign
- `GEEK_SUITE_DESIGN_LANGUAGE.md` — GeekSuite design system (will be updated post-redesign)
