// BuJoGeek Color System — "Analog Soul, Digital Spine"
// Warm, planner-inspired palette anchored by GeekSuite blue

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

  // Ink tones (replaces neutral grays — warmer, paper-like)
  ink: {
    900: '#1A1A2E',  // primary text, deep ink
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

  // Parchment (warm background tones)
  parchment: {
    default: '#FAF9F7',  // main bg (warm off-white, like paper)
    paper:   '#FFFFFF',  // cards, elevated surfaces
    warm:    '#F5F0EB',  // section backgrounds, subtle warmth
  },

  // Aging system — tasks communicate urgency through color
  aging: {
    fresh:   '#5B9E6F',  // sage green — new/today
    warning: '#D4843E',  // warm amber — 1-3 days old
    overdue: '#C4453C',  // muted red — overdue
    stale:   '#8B4D6A',  // plum — old backlog
  },

  // Priority
  priority: {
    high:     '#C4453C',
    highBg:   '#FBEDED',
    medium:   '#D4843E',
    mediumBg: '#FDF3EB',
    low:      '#6098CC',
    lowBg:    '#EBF3FA',
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

  // Task status
  task: {
    completed:   '#5B9E6F',
    pending:     '#8E8EA0',
    overdue:     '#C4453C',
    carriedOver: '#D4843E',
  },

  // Signifier colors
  signifier: {
    task:     '#8E8EA0',  // *
    event:    '#7A6EB0',  // @
    note:     '#8E8EA0',  // -
    question: '#D4843E',  // ?
    priority: '#C4453C',  // !
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

// Dark mode surface colors — "dimly lit study"
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

export default colors;
