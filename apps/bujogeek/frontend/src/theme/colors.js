// BuJoGeek Color System — "Analog Soul, Digital Spine"
// Warm, planner-inspired palette anchored by GeekSuite blue
// Version 2 — premium refinement pass

export const colors = {
  // Primary — GeekSuite Blue (retained as anchor)
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

  // Ink tones (warm paper-like, not cold gray)
  // Shifted warm — subtle sepia undertone throughout
  ink: {
    900: '#1C1A18',  // primary text — near-black with warmth
    800: '#2E2B28',  // secondary text
    700: '#46433F',  // tertiary
    600: '#5C5955',
    500: '#706D68',
    400: '#918E88',  // muted
    300: '#B5B2AC',
    200: '#D5D2CC',  // borders
    100: '#EDEAE4',  // subtle bg
    50:  '#F6F4F0',  // page bg — warm off-white
  },

  // Parchment (warm background tones)
  parchment: {
    default: '#FAF8F5',  // main bg — warm, like laid paper
    paper:   '#FFFFFE',  // cards, elevated surfaces
    warm:    '#F4EFE8',  // section backgrounds, subtle warmth
    cream:   '#F0EBE2',  // deepest warm surface
  },

  // Dark mode surface layers — "dimly lit study with lamplight"
  // Warm tobacco/umber cast, not cold blue-purple
  dark: {
    0:   '#161412',  // deepest — below the page
    50:  '#1C1916',  // page background
    100: '#221F1B',  // default background
    150: '#272320',  // subtle elevation
    200: '#2E2A26',  // paper (cards)
    300: '#38332E',  // raised surface
    400: '#433E38',  // overlay
    500: '#524C45',  // border/divider
    600: '#6B6560',  // muted text
    700: '#8C8680',  // secondary text
    800: '#C4BDB5',  // primary text (warm white)
    900: '#EDE8E2',  // near-white text
  },

  // Aging system — tasks communicate urgency through color
  aging: {
    fresh:   '#5B9E6F',  // sage green — new/today
    warning: '#C97D35',  // warm amber — 1-3 days old (deepened for contrast)
    overdue: '#B83C34',  // muted red — overdue (desaturated, not alarming)
    stale:   '#7A4462',  // plum — old backlog
  },

  // Priority
  priority: {
    high:     '#B83C34',
    highBg:   '#FBECEb',
    medium:   '#C97D35',
    mediumBg: '#FCF1E8',
    low:      '#6098CC',
    lowBg:    '#EBF3FA',
  },

  // Status / semantic
  status: {
    success:   '#5B9E6F',
    successBg: '#EDF7F0',
    warning:   '#C97D35',
    warningBg: '#FCF1E8',
    error:     '#B83C34',
    errorBg:   '#FBECEb',
    info:      '#6098CC',
    infoBg:    '#EBF3FA',
  },

  // Task status
  task: {
    completed:   '#5B9E6F',
    pending:     '#918E88',
    overdue:     '#B83C34',
    carriedOver: '#C97D35',
  },

  // Signifier colors
  signifier: {
    task:     '#918E88',  // *
    event:    '#7A6EB0',  // @
    note:     '#918E88',  // -
    question: '#C97D35',  // ?
    priority: '#B83C34',  // !
  },

  // Accent warmth — a fine dust of gold for premium moments
  // Used sparingly: active states, focus rings, hero numbers
  gold: {
    muted:  '#B89A5A',  // warm brass
    subtle: '#C9AE72',  // aged gold
    bright: '#D4BA7E',  // lamplight
    bg:     '#F5EDD8',  // warm glow surface
    dark:   '#8C7240',  // dark mode gold
  },
};

// Light mode surface colors
export const lightColors = {
  background: {
    default: colors.parchment.default,
    paper:   colors.parchment.paper,
    warm:    colors.parchment.warm,
    cream:   colors.parchment.cream,
  },
  text: {
    primary:   colors.ink[900],
    secondary: colors.ink[600],
    disabled:  colors.ink[400],
    muted:     colors.ink[300],
  },
  divider: colors.ink[200],
  border:  colors.ink[200],
};

// Dark mode surface colors — "dimly lit study with lamplight"
export const darkColors = {
  background: {
    default: colors.dark[100],
    paper:   colors.dark[200],
    warm:    colors.dark[300],
    cream:   colors.dark[400],
  },
  text: {
    primary:   colors.dark[900],
    secondary: colors.dark[700],
    disabled:  colors.dark[600],
    muted:     colors.dark[500],
  },
  divider: colors.dark[500],
  border:  colors.dark[400],
};

export default colors;
