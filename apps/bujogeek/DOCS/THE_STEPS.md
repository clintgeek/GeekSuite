# BuJoGeek - Implementation Steps

## How to Use This Document

Each step is atomic and can be completed in one session. Steps are ordered by dependency and priority. Check off as you complete them.

**Legend:**
- 🔴 Critical - Must do
- 🟠 High - Should do
- 🟡 Medium - Nice to have
- 🟢 Low - Future consideration

---

## Phase 1: UI/UX Overhaul

### 1.1 Typography & Fonts 🔴

- [ ] **Step 1.1.1: Add Inter Font**
  ```bash
  # In client/index.html, add:
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  ```

- [ ] **Step 1.1.2: Update Theme Typography**
  ```javascript
  // In client/src/theme/theme.js
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    // Update all variants with Inter
    // Use JetBrains Mono for code/signifiers
  }
  ```

- [ ] **Step 1.1.3: Update Signifier Display**
  - Change signifier font to JetBrains Mono
  - Increase signifier size slightly
  - Add subtle background to signifiers

### 1.2 Color System Refresh 🔴

- [ ] **Step 1.2.1: Define New Color Tokens**
  ```javascript
  // Create client/src/theme/colors.js
  export const colors = {
    // Primary (keep GeekSuite blue)
    primary: {
      50: '#E8F2FA',
      100: '#C5DEF2',
      200: '#9FC9E9',
      300: '#79B4E0',
      400: '#5CA3D9',
      500: '#6098CC', // Main
      600: '#4B7AA3',
      700: '#3A5F7D',
      800: '#294557',
      900: '#182B31',
    },
    // Warm neutrals (not pure gray)
    neutral: {
      50: '#FAFAF9',
      100: '#F5F5F4',
      200: '#E7E5E4',
      300: '#D6D3D1',
      400: '#A8A29E',
      500: '#78716C',
      600: '#57534E',
      700: '#44403C',
      800: '#292524',
      900: '#1C1917',
    },
    // Priority colors
    priority: {
      high: '#EF4444',
      medium: '#F59E0B',
      low: '#3B82F6',
    },
    // Status colors
    status: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    }
  };
  ```

- [ ] **Step 1.2.2: Update Theme with New Colors**
  - Replace hardcoded colors with tokens
  - Update component overrides
  - Test all color combinations for contrast

- [ ] **Step 1.2.3: Add Dark Mode Colors**
  ```javascript
  // Add dark mode palette
  export const darkColors = {
    background: {
      default: '#1C1917',
      paper: '#292524',
      elevated: '#44403C',
    },
    text: {
      primary: '#FAFAF9',
      secondary: '#A8A29E',
    }
  };
  ```

### 1.3 Dark Mode Implementation 🟠

- [ ] **Step 1.3.1: Create Theme Context**
  ```javascript
  // Create client/src/context/ThemeContext.jsx
  // - Store theme preference (light/dark/system)
  // - Persist to localStorage
  // - Detect system preference
  ```

- [ ] **Step 1.3.2: Create Theme Toggle Component**
  - Sun/Moon icon button
  - Place in header
  - Smooth transition animation

- [ ] **Step 1.3.3: Update All Components for Dark Mode**
  - Audit every component for hardcoded colors
  - Replace with theme tokens
  - Test in both modes

### 1.4 Layout Restructure 🔴

- [ ] **Step 1.4.1: Create New AppLayout Component**
  ```
  Desktop (≥900px):
  - Collapsible sidebar (240px)
  - Compact header (48px)
  - No bottom nav

  Mobile (<600px):
  - No sidebar
  - Compact header (48px)
  - Bottom nav (56px)
  ```

- [ ] **Step 1.4.2: Create Sidebar Component**
  ```javascript
  // client/src/components/layout/Sidebar.jsx
  // Contents:
  // - View navigation (Daily, Weekly, Monthly, Year, All)
  // - Tags section (collapsible)
  // - Quick stats
  // - Settings link
  ```

- [ ] **Step 1.4.3: Update Header Component**
  - Reduce height to 48px
  - Add theme toggle
  - Add user menu dropdown
  - Mobile: hamburger menu

- [ ] **Step 1.4.4: Update Bottom Nav**
  - Only show on mobile
  - Reduce height to 56px
  - Add FAB for quick add
  - Haptic feedback on tap

### 1.5 Task Card Redesign 🔴

- [ ] **Step 1.5.1: Create New TaskCard Component**
  ```javascript
  // client/src/components/tasks/TaskCard.jsx
  // Features:
  // - Custom checkbox with animation
  // - Signifier badge
  // - Priority indicator (left border + icon)
  // - Due date chip
  // - Tags (collapsible if many)
  // - Hover actions (edit, delete, schedule)
  // - Swipe actions on mobile
  ```

- [ ] **Step 1.5.2: Add Checkbox Animation**
  ```css
  /* Satisfying check animation */
  @keyframes checkmark {
    0% { stroke-dashoffset: 24; }
    100% { stroke-dashoffset: 0; }
  }
  ```

- [ ] **Step 1.5.3: Add Swipe Actions (Mobile)**
  - Swipe right: Complete
  - Swipe left: Delete (with confirm)
  - Use react-swipeable or similar

- [ ] **Step 1.5.4: Add Context Menu (Desktop)**
  - Right-click menu
  - Edit, Delete, Schedule, Priority, Tags
  - Keyboard shortcut hints

### 1.6 Quick Entry Redesign 🔴

- [ ] **Step 1.6.1: Create Command Palette Component**
  ```javascript
  // client/src/components/CommandPalette.jsx
  // - Full-width modal (like VS Code)
  // - Search/input at top
  // - Suggestions below
  // - Keyboard navigation
  ```

- [ ] **Step 1.6.2: Add Inline Autocomplete**
  - Tags: Show after typing #
  - Dates: Show after typing /
  - Templates: Show after typing @template
  - Priority: Show after typing !

- [ ] **Step 1.6.3: Add Recent Items**
  - Recent tags
  - Recent templates
  - Similar tasks

### 1.7 Date Navigation Redesign 🟠

- [ ] **Step 1.7.1: Create New DateNavigation Component**
  - Compact design
  - Mini calendar dropdown
  - Today button always visible
  - Keyboard shortcuts (j/k)

- [ ] **Step 1.7.2: Add Swipe Gestures**
  - Swipe left/right to change date
  - Visual feedback during swipe

- [ ] **Step 1.7.3: Add Week Context**
  - Show week number
  - Show day names for weekly view

---

## Phase 2: Core Feature Enhancement

### 2.1 Inline Editing 🔴

- [ ] **Step 2.1.1: Add Inline Edit Mode to TaskCard**
  - Click task content to edit
  - Show input field in place
  - Tab to next field
  - Escape to cancel
  - Auto-save on blur

- [ ] **Step 2.1.2: Add Field-Specific Editing**
  - Click due date to show date picker
  - Click priority to show selector
  - Click tags to add/remove

### 2.2 Bulk Operations 🟠

- [ ] **Step 2.2.1: Add Selection Mode**
  - Checkbox column appears
  - Select all / none
  - Selection count indicator

- [ ] **Step 2.2.2: Add Bulk Action Bar**
  - Appears when items selected
  - Actions: Complete, Delete, Tag, Schedule
  - Confirmation for destructive actions

### 2.3 Subtasks 🟠

- [ ] **Step 2.3.1: Add Subtask Display**
  - Nested under parent task
  - Indent with visual connector
  - Progress indicator (2/5 complete)
  - Collapse/expand toggle

- [ ] **Step 2.3.2: Add Subtask Creation**
  - "Add subtask" button on task
  - Quick add inline
  - Tab to create next subtask

- [ ] **Step 2.3.3: Add Subtask Reordering**
  - Drag to reorder within parent
  - Drag to convert to standalone

### 2.4 Recurring Tasks 🟡

- [ ] **Step 2.4.1: Add Recurrence UI**
  - Recurrence selector in task editor
  - Options: Daily, Weekly, Monthly, Custom
  - End date or count

- [ ] **Step 2.4.2: Add Recurrence Display**
  - Recurring icon on task
  - Next occurrence indicator

- [ ] **Step 2.4.3: Add Instance Management**
  - Complete this instance
  - Skip this instance
  - Edit series vs instance

### 2.5 View Enhancements 🟠

- [ ] **Step 2.5.1: Enhance Daily View**
  - Time-based sections (Morning, Afternoon, Evening)
  - Unscheduled section
  - Completed section (collapsible)
  - Day summary stats

- [ ] **Step 2.5.2: Enhance Weekly View**
  - 7-column grid on desktop
  - Horizontal scroll on mobile
  - Drag tasks between days
  - Week summary stats

- [ ] **Step 2.5.3: Enhance Monthly View**
  - Calendar grid with task indicators
  - Click day to filter tasks
  - Month summary stats

- [ ] **Step 2.5.4: Create Backlog View**
  - Separate from main views
  - Age indicators
  - Review workflow
  - Bulk actions

---

## Phase 3: Advanced Features

### 3.1 Offline Support (PWA) 🟠

- [ ] **Step 3.1.1: Configure Service Worker**
  - Update vite.config.js for PWA
  - Configure caching strategies
  - Add offline fallback page

- [ ] **Step 3.1.2: Add IndexedDB Storage**
  - Store tasks locally
  - Queue offline changes
  - Sync when online

- [ ] **Step 3.1.3: Add Sync Indicator**
  - Show sync status in header
  - Offline indicator
  - Pending changes count

- [ ] **Step 3.1.4: Add Conflict Resolution**
  - Detect conflicts
  - Show resolution UI
  - Keep both / use local / use server

### 3.2 Export/Import 🟡

- [ ] **Step 3.2.1: Add Export Functionality**
  - Markdown export (BuJo format)
  - JSON export (full backup)
  - CSV export (spreadsheet)

- [ ] **Step 3.2.2: Add Import Functionality**
  - JSON import
  - Plain text import
  - Duplicate detection

### 3.3 Statistics 🟡

- [ ] **Step 3.3.1: Create Stats Dashboard**
  - Tasks completed (daily/weekly/monthly)
  - Completion rate
  - Productivity patterns
  - Tag usage

- [ ] **Step 3.3.2: Add Streak Tracking**
  - Daily completion streak
  - Visual streak indicator
  - Streak milestones

### 3.4 Keyboard Shortcuts 🔴

- [ ] **Step 3.4.1: Implement Global Shortcuts**
  ```
  Cmd+K     Quick entry
  Cmd+/     Show shortcuts
  g d       Go to daily
  g w       Go to weekly
  g m       Go to monthly
  g b       Go to backlog
  ```

- [ ] **Step 3.4.2: Implement List Shortcuts**
  ```
  j/k       Navigate up/down
  x         Toggle complete
  e         Edit task
  d         Delete task
  p 1/2/3   Set priority
  t         Add tag
  s         Schedule
  ```

- [ ] **Step 3.4.3: Add Shortcut Help Modal**
  - Show all shortcuts
  - Searchable
  - Category grouping

---

## Phase 4: Polish & Performance

### 4.1 Performance 🟠

- [ ] **Step 4.1.1: Add React.memo to Components**
  - TaskCard
  - TaskList
  - DateNavigation

- [ ] **Step 4.1.2: Add Virtual Scrolling**
  - Use react-window or similar
  - For lists > 50 items

- [ ] **Step 4.1.3: Optimize Bundle Size**
  - Analyze with webpack-bundle-analyzer
  - Tree-shake unused MUI components
  - Lazy load views

### 4.2 Animations 🟡

- [ ] **Step 4.2.1: Add Page Transitions**
  - Fade between views
  - Slide for navigation

- [ ] **Step 4.2.2: Add List Animations**
  - Stagger on load
  - Smooth reorder
  - Delete animation

- [ ] **Step 4.2.3: Add Micro-interactions**
  - Button hover effects
  - Focus rings
  - Loading states

### 4.3 Loading States 🔴

- [ ] **Step 4.3.1: Add Skeleton Components**
  - TaskCard skeleton
  - TaskList skeleton
  - Page skeleton

- [ ] **Step 4.3.2: Add Loading Indicators**
  - Spinner for actions
  - Progress for bulk operations
  - Optimistic updates

### 4.4 Error Handling 🔴

- [ ] **Step 4.4.1: Add Error Boundaries**
  - Wrap main sections
  - Fallback UI
  - Error reporting

- [ ] **Step 4.4.2: Add Toast Notifications**
  - Success messages
  - Error messages
  - Undo actions

- [ ] **Step 4.4.3: Add Retry Mechanisms**
  - Auto-retry failed requests
  - Manual retry button
  - Exponential backoff

### 4.5 Accessibility 🟠

- [ ] **Step 4.5.1: Add ARIA Labels**
  - All interactive elements
  - Live regions for updates
  - Form labels

- [ ] **Step 4.5.2: Ensure Keyboard Navigation**
  - Tab order
  - Focus management
  - Skip links

- [ ] **Step 4.5.3: Test with Screen Reader**
  - VoiceOver (Mac)
  - NVDA (Windows)
  - Fix issues found

---

## Phase 5: Code Quality

### 5.1 Cleanup 🔴

- [ ] **Step 5.1.1: Remove Duplicate Files**
  - Delete `userModel.js` (keep `User.js`)
  - Delete `templateModel.js` (keep `Template.js`)
  - Update imports

- [ ] **Step 5.1.2: Remove Console Logs**
  - Search for console.log
  - Replace with proper logging or remove

- [ ] **Step 5.1.3: Remove Unused Code**
  - Zustand (not used)
  - Unused imports
  - Dead code

### 5.2 Refactoring 🟠

- [ ] **Step 5.2.1: Extract Constants**
  - Magic numbers to constants
  - Repeated strings to constants
  - Create constants file

- [ ] **Step 5.2.2: Consolidate Sorting Logic**
  - Create shared sort utilities
  - Remove duplicate sort functions

- [ ] **Step 5.2.3: Improve State Management**
  - Evaluate Context vs Zustand
  - Consolidate state logic
  - Add proper memoization

### 5.3 Testing 🟡

- [ ] **Step 5.3.1: Set Up Jest + RTL**
  - Configure Jest
  - Add React Testing Library
  - Create test utilities

- [ ] **Step 5.3.2: Add Component Tests**
  - TaskCard
  - TaskList
  - QuickEntry

- [ ] **Step 5.3.3: Add Integration Tests**
  - Task CRUD flow
  - Authentication flow

---

## Quick Wins (Do Anytime)

These can be done independently at any point:

- [ ] Add favicon and app icons
- [ ] Add meta tags for SEO
- [ ] Add loading spinner to login
- [ ] Fix "MARKER </>" text in header (should just be "</>")
- [ ] Add empty state illustrations
- [ ] Add "No tasks" message styling
- [ ] Fix mobile touch targets (min 44px)
- [ ] Add pull-to-refresh on mobile
- [ ] Add "Today" indicator in date nav
- [ ] Add task count badges in nav

---

## Completion Checklist

### Phase 1 Complete When:
- [ ] New fonts loaded and applied
- [ ] New color system in place
- [ ] Dark mode working
- [ ] New layout on desktop and mobile
- [ ] Task cards redesigned
- [ ] Quick entry redesigned
- [ ] Date navigation redesigned

### Phase 2 Complete When:
- [ ] Inline editing working
- [ ] Bulk operations working
- [ ] Subtasks displaying and editable
- [ ] All views enhanced

### Phase 3 Complete When:
- [ ] App works offline
- [ ] Export/import working
- [ ] Stats dashboard available
- [ ] All keyboard shortcuts working

### Phase 4 Complete When:
- [ ] Lighthouse performance > 90
- [ ] All animations smooth (60fps)
- [ ] Loading states everywhere
- [ ] Error handling complete
- [ ] Accessibility audit passed

### Phase 5 Complete When:
- [ ] No duplicate files
- [ ] No console logs
- [ ] Test coverage > 50%
- [ ] No TypeScript errors (if migrated)

---

## Notes

- Always test on mobile after changes
- Keep GeekSuite consistency in mind
- Don't break existing functionality
- Commit frequently with clear messages
- Update CONTEXT.md as things change
