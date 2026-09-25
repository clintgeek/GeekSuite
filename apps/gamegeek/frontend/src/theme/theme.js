/**
 * GameGeek theme: "Save Point" (DOCS/GameGeekPlan.md §5.1).
 *
 * Deep slate surfaces with an amber-phosphor accent — the warmth of a CRT's
 * afterglow, not neon gamer RGB. Space Grotesk carries the headings and the
 * wordmark; body copy stays on the suite face.
 *
 * Contrast notes, because amber is a trap:
 *   - Dark mode's phosphor (#FFB547) is bright enough to be text on every dark
 *     surface. It carries a near-black label when it is a fill.
 *   - Light mode cannot use that amber as text at all (≈1.9:1 on white). Its
 *     accent steps down to a burnt amber (#9A4708) that clears 4.5:1 on both
 *     the page and the paper, and carries a white label as a fill. The bright
 *     amber survives in light mode only as a graphic (stars, the plate rule).
 *   - Anything painted as text from a domain colour (shelf tones) still goes
 *     through readableOn at the call site, against the surface it lands on.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';

export const DISPLAY_FONT = '"Space Grotesk", "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif';
export const BODY_FONT = '"Roboto", system-ui, -apple-system, "Segoe UI", "Helvetica", "Arial", sans-serif';
export const MONO_FONT = '"Roboto Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';

const phosphorDark = { main: '#FFB547', light: '#FFC876', dark: '#E89A2A', contrastText: '#1A1206' };
const phosphorLight = { main: '#9A4708', light: '#B45309', dark: '#7C3A06', contrastText: '#FFFFFF' };

export const SURFACES = {
  dark: {
    page: '#0E1116',
    paper: '#161B22',
    card: '#1A2029',
    raised: '#212833',
    text: '#ECE6DA',
    secondary: '#B3BAC5',
    muted: '#98A1AE',
    divider: 'rgba(148, 163, 184, 0.16)',
    border: 'rgba(148, 163, 184, 0.22)',
  },
  light: {
    page: '#ECEEF2',
    paper: '#FFFFFF',
    card: '#FFFFFF',
    raised: '#F5F6F8',
    text: '#151A22',
    secondary: '#434D5E',
    muted: '#566172',
    divider: 'rgba(21, 26, 34, 0.10)',
    border: 'rgba(21, 26, 34, 0.16)',
  },
};

/** Shelf identity tones. Used as small text and dots; readableOn at call sites. */
const SHELF_TONES = {
  dark: {
    playing: '#FFB547',
    backlog: '#A9BCD0',
    finished: '#7EE0B5',
    'on-hold': '#C9B8FF',
    abandoned: '#F9A8B4',
    wishlist: '#8AD4F5',
    unshelved: '#B3BAC5',
    custom: '#CBD5E1',
  },
  light: {
    playing: '#9A4708',
    backlog: '#3D5471',
    finished: '#08724F',
    'on-hold': '#6433C9',
    abandoned: '#B4153F',
    wishlist: '#0B5F8F',
    unshelved: '#434D5E',
    custom: '#475569',
  },
};

function buildOverrides(mode) {
  const isDark = mode === 'dark';
  const s = SURFACES[mode];

  return {
    palette: {
      background: { default: s.page, paper: s.paper, card: s.card, raised: s.raised },
      text: { primary: s.text, secondary: s.secondary, muted: s.muted },
      divider: s.divider,
      shelf: SHELF_TONES[mode],
      // The bright amber as a GRAPHIC (stars, plate rule, progress). Not text.
      phosphor: {
        main: isDark ? '#FFB547' : '#C9650A',
        glow: isDark ? 'rgba(255, 181, 71, 0.16)' : 'rgba(201, 101, 10, 0.12)',
      },
      star: isDark ? '#FFB547' : '#C9650A',
      border: s.border,
    },
    typography: {
      fontFamily: BODY_FONT,
      h1: { fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '-0.02em' },
      h2: { fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '-0.015em' },
      h3: { fontFamily: DISPLAY_FONT, fontWeight: 600, letterSpacing: '-0.01em' },
      h4: { fontFamily: DISPLAY_FONT, fontWeight: 600 },
      h5: { fontFamily: DISPLAY_FONT, fontWeight: 600 },
      h6: { fontFamily: DISPLAY_FONT, fontWeight: 600 },
      overline: { fontSize: '0.75rem', letterSpacing: '0.08em', fontWeight: 600, lineHeight: 1.6 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { fontFeatureSettings: '"tnum" 0' },
          '::selection': { background: isDark ? 'rgba(255, 181, 71, 0.32)' : 'rgba(154, 71, 8, 0.22)' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: s.card,
            border: `1px solid ${s.divider}`,
            boxShadow: isDark ? '0 1px 0 rgba(255,255,255,0.03) inset, 0 6px 18px rgba(0,0,0,0.35)' : '0 1px 2px rgba(21,26,34,0.06), 0 4px 14px rgba(21,26,34,0.05)',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            // The suite default paints a selected row's text primary.main on a
            // primary tint. The amber accent reads, but we keep text on text
            // tokens and mark selection with the tint + the inset rule instead.
            '&.Mui-selected': { color: s.text },
          },
        },
      },
    },
  };
}

export function createGameTheme(mode = 'dark') {
  const accent = mode === 'dark' ? phosphorDark : phosphorLight;
  return createGeekSuiteTheme({ mode, accent, overrides: buildOverrides(mode) });
}

export default createGameTheme;
