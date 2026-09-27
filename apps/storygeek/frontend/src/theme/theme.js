/**
 * StoryGeek theme: "Candlelit Table".
 *
 * A tabletop RPG session at night. The table is deep ink and oxblood, lit by
 * one warm candle; the tale itself is written on parchment. Light mode is the
 * same table by day — pale oak, parchment sheets, oxblood ink — not the night
 * palette inverted.
 *
 * Typography: Cinzel (inscriptional Roman capitals) for titles, Cinzel
 * Decorative only for the illuminated drop cap and the wordmark, Alegreya for
 * narration and body copy (a literary text face built for long reading),
 * Alegreya Sans for UI chrome and small labels. No monospace: turn numbers
 * use Alegreya Sans with tabular figures.
 *
 * Every text colour below was measured against every surface it is painted on
 * (WCAG 2 ratio, see DOCS/CONTEXT.md "Visual identity"). Two traps: candle
 * amber is only a text colour in the dark; in daylight it becomes bronze ink.
 * And never wrap a text token in alpha() — the dilution is the bug.
 *
 * Composes createGeekSuiteTheme with StoryGeek identity overrides; nothing
 * here reaches into packages/ui.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';
import { alpha } from '@mui/material';

export const fonts = {
  display: '"Cinzel", "Times New Roman", serif',
  initial: '"Cinzel Decorative", "Cinzel", serif',
  text: '"Alegreya", "Iowan Old Style", Georgia, serif',
  ui: '"Alegreya Sans", "Segoe UI", system-ui, sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, monospace',
};

// ── Surfaces and inks, per mode ─────────────────────────────────────────
// `table` is the page background, `paper` the default card, `raised` a card
// on a card, `page` the sheet the narration is written on.
const NIGHT = {
  table: '#120d0c',
  paper: '#1d1514',
  raised: '#271c1a',
  page: '#211813',
  pageEdge: '#3a2a20',
  ink: '#efe3c8', // 13.0–15.2:1 on every night surface
  inkSoft: '#c9b99a', // 8.6–10.0:1
  inkFaint: '#ab9a7e', // 6.0–7.0:1
  accent: '#e8a94a', // candle amber, 8.0–9.4:1 — a text colour at night
  accentLabel: '#c7913e', // quieter amber for small-caps labels, >= 5.96:1
  voice: '#e07a6e', // the player's ink (oxblood lifted for night), >= 5.66:1
  oxblood: '#6e1a20',
  rule: '#4a3528',
  tone: {
    good: '#8fc49a', // >= 8.3:1
    warn: '#f0c060', // >= 9.8:1
    bad: '#ff8a78', // >= 7.2:1
    info: '#9db4e0', // >= 7.9:1
    neutral: '#c9b99a',
  },
};

const DAY = {
  table: '#e4d2b0', // pale oak
  paper: '#f7eedb', // parchment
  raised: '#efe2c6',
  page: '#f9f0dc',
  pageEdge: '#d9c29a',
  ink: '#2a1a10', // 11.3–14.8:1
  inkSoft: '#5a4330', // 6.2–8.1:1
  inkFaint: '#6b513a', // 4.9–6.5:1
  accent: '#7a1f24', // oxblood, 6.9–9.0:1
  accentLabel: '#7a4e0e', // bronze ink, 4.84:1 on oak, >= 5.6:1 on parchment
  voice: '#7a1f24',
  oxblood: '#7a1f24',
  rule: '#cdb58a',
  tone: {
    good: '#2f5e3a', // >= 5.08:1
    warn: '#6a4a00', // >= 5.46:1
    bad: '#8e1f22', // >= 5.97:1
    info: '#2e4a7a', // >= 5.95:1
    neutral: '#5a4330',
  },
};

// Wax colours for seals — decorative fills; any glyph on them is parchment
// (#f6ecd6: 5.1–11.5:1) or, on amber wax, near-black (#1d1208: 6.3:1+).
export const WAX = {
  player: '#8c2a2e',
  narrator: '#c98a2e',
  setup: '#2e3f66',
  recorded: '#6b6259',
};
export const WAX_GLYPH = { light: '#f6ecd6', dark: '#1d1208' };

export function candleTokens(mode) {
  return mode === 'dark' ? NIGHT : DAY;
}

function buildStoryOverrides(mode) {
  const isDark = mode === 'dark';
  const t = candleTokens(mode);
  const amber = NIGHT.accent;

  // The table itself: night is a candle glow falling on dark wood, with
  // oxblood pooled in the corners; day is pale oak with the faintest grain.
  const tableImage = isDark
    ? `radial-gradient(ellipse 70% 45% at 50% -5%, ${alpha(amber, 0.10)} 0%, transparent 70%),
       radial-gradient(ellipse at 0% 100%, ${alpha('#5a1519', 0.22)} 0%, transparent 55%),
       radial-gradient(ellipse at 100% 100%, ${alpha('#5a1519', 0.16)} 0%, transparent 50%)`
    : `radial-gradient(ellipse 80% 50% at 50% 0%, ${alpha('#fff8e6', 0.55)} 0%, transparent 70%),
       repeating-linear-gradient(92deg, ${alpha('#8a6a3a', 0.035)} 0px, ${alpha('#8a6a3a', 0.035)} 2px, transparent 2px, transparent 9px)`;

  return {
    palette: {
      background: { default: t.table, paper: t.paper },
      text: {
        primary: t.ink,
        secondary: t.inkSoft,
        muted: t.inkFaint,
        disabled: t.inkFaint,
      },
      divider: t.rule,
      success: { main: isDark ? '#4f8a5c' : '#2f5e3a' },
      warning: { main: isDark ? '#c98a2e' : '#8a5a12' },
      // Night error red clears 4.5:1 on every night surface (4.84–5.64);
      // #c0483e measured 3.34–3.89 (packages/ui themeContrast, 2026-09-27).
      error: { main: isDark ? '#e0645a' : '#8e1f22' },
      info: { main: isDark ? '#5f7cb8' : '#2e4a7a' },
      // App-specific slot. Components read palette.candle.* — solid, measured
      // inks and surfaces for this mode.
      candle: { ...t, mode, wax: WAX, waxGlyph: WAX_GLYPH, tableImage },
    },

    typography: {
      fontFamily: fonts.text,
      h1: { fontFamily: fonts.display, fontWeight: 700, fontSize: '2.25rem', letterSpacing: '0.03em', lineHeight: 1.15 },
      h2: { fontFamily: fonts.display, fontWeight: 700, fontSize: '1.75rem', letterSpacing: '0.025em', lineHeight: 1.2 },
      h3: { fontFamily: fonts.display, fontWeight: 600, fontSize: '1.375rem', letterSpacing: '0.02em', lineHeight: 1.25 },
      h4: { fontFamily: fonts.display, fontWeight: 600, fontSize: '1.2rem', letterSpacing: '0.02em', lineHeight: 1.25 },
      h5: { fontFamily: fonts.display, fontWeight: 600, fontSize: '1.05rem', letterSpacing: '0.015em' },
      h6: { fontFamily: fonts.display, fontWeight: 600, fontSize: '0.95rem', letterSpacing: '0.015em' },
      body1: { fontSize: '1.0625rem', lineHeight: 1.65 },
      body2: { fontSize: '0.9375rem', lineHeight: 1.55 },
      subtitle1: { fontFamily: fonts.ui },
      subtitle2: { fontFamily: fonts.ui },
      caption: { fontFamily: fonts.ui, fontSize: '0.8125rem', letterSpacing: '0.02em' },
      overline: {
        fontFamily: fonts.ui,
        fontSize: '0.75rem',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        fontWeight: 700,
        lineHeight: 1.6,
      },
      button: {
        fontFamily: fonts.ui,
        fontWeight: 700,
        fontSize: '0.9375rem',
        letterSpacing: '0.02em',
        textTransform: 'none',
      },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: t.table,
            backgroundImage: tableImage,
            backgroundAttachment: 'fixed',
            fontVariantNumeric: 'oldstyle-nums',
          },
          '::selection': { backgroundColor: alpha(isDark ? amber : '#7a1f24', 0.28) },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backdropFilter: 'blur(10px)',
            borderBottom: `1px solid ${t.rule}`,
            backgroundColor: alpha(t.table, 0.9),
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          containedPrimary: {
            // Candle amber by night (ink text, 8.9:1); oxblood by day
            // (parchment text, 8.7:1). A disabled contained button keeps
            // MUI's own disabled treatment — no gradient to fight.
            backgroundColor: isDark ? amber : '#7a1f24',
            color: isDark ? '#1d1208' : '#f9f0dc',
            boxShadow: isDark ? `0 0 0 1px ${alpha('#000', 0.3)}, 0 4px 14px ${alpha(amber, 0.18)}` : `0 1px 0 ${alpha('#3a0d10', 0.4)}`,
            '@media (hover: hover)': {
              '&:hover': { backgroundColor: isDark ? '#f0b85e' : '#8c2a2e' },
            },
          },
          outlinedPrimary: {
            borderColor: isDark ? alpha(amber, 0.5) : alpha('#7a1f24', 0.45),
            color: t.accent,
            '@media (hover: hover)': {
              '&:hover': { borderColor: t.accent, backgroundColor: alpha(t.accent, 0.08) },
            },
          },
          textPrimary: { color: t.accent },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            border: `1px solid ${t.rule}`,
            backgroundColor: t.paper,
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? alpha('#000', 0.18) : alpha('#fffaf0', 0.7),
          },
          notchedOutline: { borderColor: isDark ? '#5a4232' : '#b89c70' },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { backgroundColor: t.paper, border: `1px solid ${t.rule}` },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: t.paper },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { fontFamily: fonts.ui, fontSize: '0.8125rem' },
        },
      },
    },
  };
}

/**
 * createStoryTheme(mode) — shared GeekSuite rules + the Candlelit Table.
 */
export function createStoryTheme(mode = 'light') {
  const isDark = mode === 'dark';

  const storyAccent = isDark
    ? { main: NIGHT.accent, light: '#f0c070', dark: '#c98a2e', contrastText: '#1d1208' }
    : { main: DAY.accent, light: '#8c2a2e', dark: '#5a1519', contrastText: '#f9f0dc' };

  const theme = createGeekSuiteTheme({
    mode,
    accent: storyAccent,
    overrides: buildStoryOverrides(mode),
  });

  // Failsafe: theme.palette.glow must exist even if Vite serves a stale,
  // pre-bundled @geeksuite/ui.
  if (!theme.palette.glow) {
    theme.palette.glow = {
      ring: alpha(storyAccent.main, 0.2),
      soft: alpha(storyAccent.main, 0.06),
      medium: alpha(storyAccent.main, 0.1),
      border: alpha(storyAccent.main, 0.3),
    };
  }

  return theme;
}

export default createStoryTheme('light');

// The canon scroll is parchment in both modes: it is the archive speaking,
// not the narrator, and at night it is the one lit sheet on the dark table.
// Day inks measured on #efdfb8 (ink 12.7, soft 7.0, faint 5.6, bronze 5.4).
let scrollTheme = null;
export function getScrollTheme() {
  if (!scrollTheme) {
    scrollTheme = createStoryTheme('light');
    const paper = '#efdfb8';
    scrollTheme.palette.background.paper = paper;
    scrollTheme.palette.candle = { ...scrollTheme.palette.candle, paper, page: paper, raised: '#e8d4a6' };
  }
  return scrollTheme;
}
