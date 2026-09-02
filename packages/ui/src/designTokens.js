export const geekTypography = {
  fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  monoFontFamily: '"Roboto Mono", monospace',
  scale: {
    h1: { fontSize: '2rem', lineHeight: 1.2, fontWeight: 600 },
    h2: { fontSize: '1.5rem', lineHeight: 1.25, fontWeight: 600 },
    h3: { fontSize: '1.25rem', lineHeight: 1.3, fontWeight: 600 },
    body: { fontSize: '0.875rem', lineHeight: 1.55, fontWeight: 400 },
    caption: { fontSize: '0.75rem', lineHeight: 1.4, fontWeight: 400 },
  },
  weights: {
    body: 400,
    interactive: 500,
    heading: 600,
  },
};

export const geekSpacing = {
  unit: 4,
  scale: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    6: 24,
    8: 32,
  },
};

export const geekPalette = {
  primary: {
    main: '#4B7AA3',  // was #6098CC; darkened so white labels clear 4.5:1 (2026-09-02)
    light: '#7BB3F0',
    dark: '#2E5C8A',
    contrastText: '#FFFFFF',
  },
  neutral: {
    background: '#F5F5F5',
    paper: '#FFFFFF',
    textPrimary: '#212121',
    textSecondary: '#6B6B6B',
    textDisabled: '#9E9E9E',
    border: 'rgba(0, 0, 0, 0.12)',
  },
  // Semantic colors are used as *foreground* (icons, outlined chips, error
  // text) far more often than as fills, so each mode gets a value that clears
  // 4.5:1 against that mode's paper. Light: deep tones on cream/white.
  // Dark: lifted tones on near-black. MUI augments light/dark/contrastText.
  semantic: {
    success: '#2E7D32',
    warning: '#A35F00',
    error: '#B00020',
    info: '#0277BD',
  },
  semanticDark: {
    success: '#66BB6A',
    warning: '#FFB74D',
    error: '#F27C74',
    info: '#4FC3F7',
  },
};

export const geekShape = {
  radius: {
    chip: 4,
    control: 8,
    panel: 8,
  },
};

export const geekLayout = {
  topBarHeight: 60,
  sidebarWidth: 220,
  minClickTarget: 44,
  // Mobile bottom tab bar (data-entry apps only). Content must be inset by
  // this much so the last row is not hidden behind the bar.
  bottomNavHeight: 56,
  // The one navigation breakpoint for the whole suite: below this the sidebar
  // becomes a temporary drawer and the top bar grows a hamburger. Passed to
  // `theme.breakpoints.down()`, so it must be a real MUI breakpoint key.
  navBreakpoint: 'md',
};

export const geekMotion = {
  duration: {
    fast: 120,
    base: 150,
    route: 180,
  },
  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

export const geekInteraction = {
  focus: {
    outlineWidth: 2,
    outlineOffset: 2,
  },
  hoverOpacity: 0.04,
  activeOpacity: 0.12,
  disabledOpacity: 0.38,
};

export const geekZIndex = {
  focusChrome: 1200,
};

export const geekDesignTokens = {
  typography: geekTypography,
  spacing: geekSpacing,
  palette: geekPalette,
  shape: geekShape,
  layout: geekLayout,
  motion: geekMotion,
  interaction: geekInteraction,
  zIndex: geekZIndex,
};

