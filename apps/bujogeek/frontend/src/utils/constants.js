import { geekLayout } from '@geeksuite/ui';

// Layout — derived from shared tokens so they can never drift
export const SIDEBAR_WIDTH    = geekLayout.sidebarWidth;   // 220
export const TOPBAR_HEIGHT    = geekLayout.topBarHeight;   // 60
export const MOBILE_TAB_HEIGHT = 64; // mobile-specific, no shared equivalent yet

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
