/**
 * ThingGeek theme: "Ledger".
 *
 * The household's record of what it owns, so it looks like one: warm ledger
 * paper and iron-gall ink by day, the same ledger under a desk lamp by night,
 * with one steady accent — registry green, the colour of a bound account book
 * and of an asset tag's stamp — and brass for the small hardware (the tag's
 * eyelet, rules, the range histogram). Manrope carries headings and the
 * wordmark; body copy stays on the suite face; identifiers are set in mono so
 * a serial reads character by character.
 *
 * Distinct from its neighbours on purpose: GameGeek is slate + amber,
 * BookGeek ink + sky, FitnessGeek stone + teal. Registry green sits well
 * clear of FitnessGeek's blue-green teal.
 *
 * Contrast notes:
 *   - Light mode's green (#1D6546) clears 4.5:1 as text on every light
 *     surface and carries a white label as a fill.
 *   - Dark mode's green (#7CC9A0) is text-bright on every dark surface and
 *     carries a near-black label as a fill.
 *   - Brass is a GRAPHIC in both modes (eyelets, rules, histogram bars),
 *     never text.
 *   - Status tones (overdue / soon / upcoming) are text-safe on the paper and
 *     card; call sites still pass them through readableOn for tints.
 *   - Every pair lives in __tests__/utils/themeContrast.test.js.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';

export const DISPLAY_FONT = '"Manrope", "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif';
export const BODY_FONT = '"Roboto", system-ui, -apple-system, "Segoe UI", "Helvetica", "Arial", sans-serif';
export const MONO_FONT = '"Roboto Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

const registryLight = { main: '#1D6546', light: '#2E8A62', dark: '#154D35', contrastText: '#FFFFFF' };
const registryDark = { main: '#7CC9A0', light: '#9AD8B6', dark: '#5DB286', contrastText: '#0E1A13' };

export const SURFACES = {
  light: {
    page: '#F2EEE5',
    paper: '#FFFDF9',
    card: '#FFFDF9',
    raised: '#F7F3EB',
    text: '#1D1B17',
    secondary: '#4A453C',
    muted: '#5A5449',
    divider: 'rgba(29, 27, 23, 0.10)',
    border: 'rgba(29, 27, 23, 0.18)',
  },
  dark: {
    page: '#13120F',
    paper: '#1B1A16',
    card: '#201F1A',
    raised: '#29271F',
    text: '#EFEADF',
    secondary: '#C2BBAD',
    muted: '#ABA496',
    divider: 'rgba(239, 234, 223, 0.10)',
    border: 'rgba(239, 234, 223, 0.18)',
  },
};

/** Brass: hardware, rules, histogram bars. A graphic — never text. */
export const BRASS = { light: '#A87B2B', dark: '#D2A857' };

/**
 * Due-date status tones, used as small text and dots. Solid, text-safe on
 * the paper/card/raised surfaces of their mode (asserted in the ratchet).
 */
export const STATUS_TONES = {
  light: { overdue: '#B42318', soon: '#8F5200', upcoming: '#1F5F8B', later: '#4A453C' },
  dark: { overdue: '#F4978E', soon: '#F2B45A', upcoming: '#8CC3EC', later: '#C2BBAD' },
};

function buildOverrides(mode) {
  const isDark = mode === 'dark';
  const s = SURFACES[mode];
  const accent = isDark ? registryDark.main : registryLight.main;

  return {
    palette: {
      background: { default: s.page, paper: s.paper, card: s.card, raised: s.raised },
      text: { primary: s.text, secondary: s.secondary, muted: s.muted },
      divider: s.divider,
      border: s.border,
      brass: BRASS[mode],
      status: STATUS_TONES[mode],
      // The collection's RangeFacet paints its in-range bars with `phosphor`.
      phosphor: {
        main: BRASS[mode],
        glow: isDark ? 'rgba(124, 201, 160, 0.10)' : 'rgba(29, 101, 70, 0.07)',
      },
      // The "type plate" behind a thing with no photo: a quiet tint of the accent.
      plate: {
        ground: isDark ? '#1F2A23' : '#E7EFE8',
        rule: isDark ? 'rgba(124, 201, 160, 0.10)' : 'rgba(29, 101, 70, 0.08)',
        icon: isDark ? '#7CC9A0' : '#2E6B50',
      },
    },
    typography: {
      fontFamily: BODY_FONT,
      h1: { fontFamily: DISPLAY_FONT, fontWeight: 800, letterSpacing: '-0.02em' },
      h2: { fontFamily: DISPLAY_FONT, fontWeight: 800, letterSpacing: '-0.015em' },
      h3: { fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '-0.01em' },
      h4: { fontFamily: DISPLAY_FONT, fontWeight: 700 },
      h5: { fontFamily: DISPLAY_FONT, fontWeight: 700 },
      h6: { fontFamily: DISPLAY_FONT, fontWeight: 700 },
      overline: { fontSize: '0.75rem', letterSpacing: '0.1em', fontWeight: 700, lineHeight: 1.6 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '::selection': { background: isDark ? 'rgba(124, 201, 160, 0.30)' : 'rgba(29, 101, 70, 0.20)' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: s.card,
            border: `1px solid ${s.divider}`,
            boxShadow: isDark
              ? '0 1px 0 rgba(255,255,255,0.03) inset, 0 6px 18px rgba(0,0,0,0.30)'
              : '0 1px 2px rgba(29,27,23,0.05), 0 4px 14px rgba(29,27,23,0.05)',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            // Selected rows keep text on the text tokens; the tint and the
            // inset rule carry "selected" (the sidebar's itemSx adds the rule).
            '&.Mui-selected': { color: s.text },
          },
        },
      },
      MuiLink: {
        styleOverrides: { root: { color: accent, textUnderlineOffset: '0.18em' } },
      },
    },
  };
}

export function createThingTheme(mode = 'light') {
  const accent = mode === 'dark' ? registryDark : registryLight;
  return createGeekSuiteTheme({ mode, accent, overrides: buildOverrides(mode) });
}

export default createThingTheme;
