/**
 * The sign-in screen's look, copied from StartGeek (apps/startgeek/src/index.css
 * :root) so the SSO door matches the start page. See AuthFrame.jsx.
 */
import { createTheme } from '@mui/material/styles';

// StartGeek's console palette (apps/startgeek/src/index.css :root).
export const START = {
  ground: '#0a0d12',
  hair: 'rgba(255, 255, 255, 0.10)',
  hairStrong: 'rgba(255, 255, 255, 0.18)',
  ink: '#e9edf2',
  ink2: '#cfdfef',
  ink3: '#8ca3ba',
  accent: '#e6b35a',
  critical: '#f07178',
  sky: '#7fb4e6',
  sans: "'Geist', system-ui, sans-serif",
  mono: "'Geist Mono', ui-monospace, monospace",
};

export const authTheme = createTheme({
  spacing: 4, // suite-wide 4px unit, so the pages' sx values keep their size
  shape: { borderRadius: 10 },
  palette: {
    mode: 'dark',
    primary: { main: START.accent, contrastText: START.ground },
    error: { main: START.critical },
    info: { main: START.sky },
    text: { primary: START.ink, secondary: START.ink2 },
    divider: START.hair,
    background: { default: START.ground, paper: 'transparent' },
  },
  typography: { fontFamily: START.sans, button: { textTransform: 'none' } },
  components: {
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: START.hairStrong },
        },
      },
    },
    // 44px tap targets (MOBILE_UI_PLAN; the harness checks the <input> and
    // <button> boxes themselves). The pages ask for size="small" fields, so
    // the small input gets the extra padding and its resting label moves down
    // to stay centred.
    MuiInputBase: {
      styleOverrides: { inputSizeSmall: { paddingTop: 12, paddingBottom: 12, minHeight: 44, boxSizing: 'border-box' } },
    },
    MuiInputLabel: {
      styleOverrides: {
        sizeSmall: { '&:not(.MuiInputLabel-shrink)': { transform: 'translate(14px, 12px) scale(1)' } },
      },
    },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 44 } } },
    MuiAlert: {
      styleOverrides: {
        root: { backgroundColor: 'rgba(255, 255, 255, 0.05)', border: `1px solid ${START.hair}` },
      },
    },
  },
});
