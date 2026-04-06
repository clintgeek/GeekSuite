import { createTheme } from '@mui/material/styles';

// ─────────────────────────────────────────────────────────────
// DashGeek — Editorial Private Terminal theme
// Colors and fonts mirror index.css variables.
// ─────────────────────────────────────────────────────────────

export const tokens = {
  ink: '#0a0a0c',
  inkRaised: '#111114',
  bone: '#efe9dc',
  boneWarm: '#f5efe2',
  boneDim: 'rgba(239, 233, 220, 0.72)',
  boneFaint: 'rgba(239, 233, 220, 0.38)',
  boneGhost: 'rgba(239, 233, 220, 0.12)',
  rule: 'rgba(239, 233, 220, 0.10)',
  ruleStrong: 'rgba(239, 233, 220, 0.18)',
  brass: '#c89b5d',
  brassBright: '#e0b274',
  brassDeep: '#8f6a38',
  oxblood: '#a64152',
  patina: '#8aa896',
  fontDisplay: '"Fraunces", "Times New Roman", serif',
  fontItalic: '"Instrument Serif", "Fraunces", serif',
  fontMono: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
};

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: tokens.brass, contrastText: tokens.ink },
    secondary: { main: tokens.bone },
    error: { main: tokens.oxblood },
    success: { main: tokens.patina },
    warning: { main: tokens.brassBright },
    background: {
      default: tokens.ink,
      paper: tokens.ink,
    },
    text: {
      primary: tokens.bone,
      secondary: tokens.boneDim,
      disabled: tokens.boneFaint,
    },
    divider: tokens.rule,
  },
  typography: {
    fontFamily: tokens.fontDisplay,
    h1: { fontFamily: tokens.fontDisplay, fontWeight: 400, letterSpacing: '-0.03em' },
    h2: { fontFamily: tokens.fontDisplay, fontWeight: 400, letterSpacing: '-0.03em' },
    h3: { fontFamily: tokens.fontDisplay, fontWeight: 400, letterSpacing: '-0.025em' },
    h4: { fontFamily: tokens.fontDisplay, fontWeight: 400, letterSpacing: '-0.02em' },
    h5: { fontFamily: tokens.fontDisplay, fontWeight: 500, letterSpacing: '-0.015em' },
    h6: { fontFamily: tokens.fontDisplay, fontWeight: 500, letterSpacing: '-0.01em' },
    body1: { fontFamily: tokens.fontDisplay, fontWeight: 400 },
    body2: { fontFamily: tokens.fontDisplay, fontWeight: 400, color: tokens.boneDim },
    caption: {
      fontFamily: tokens.fontMono,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      fontSize: '0.65rem',
      color: tokens.boneFaint,
    },
    button: { fontFamily: tokens.fontMono, textTransform: 'uppercase', letterSpacing: '0.1em' },
  },
  shape: { borderRadius: 2 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: 'transparent' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none', backgroundColor: 'transparent' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'transparent',
          boxShadow: 'none',
          borderRadius: 0,
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: { backgroundColor: tokens.boneGhost },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          fontWeight: 500,
          padding: '0.6rem 1.4rem',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.boneGhost,
          height: 2,
          borderRadius: 0,
        },
        bar: { backgroundColor: tokens.brass, borderRadius: 0 },
      },
    },
  },
});

export default theme;
