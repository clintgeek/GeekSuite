/**
 * StoryGeek Theme: "Arcane Codex"
 *
 * AI-powered storytelling tool. Rich textures, serif-heavy typography,
 * and high-contrast accents (Gold in dark, Burgundy in light).
 *
 * Composes createGeekSuiteTheme with StoryGeek-specific identity overrides.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';
import { alpha } from '@mui/material';

// --- Arcane Codex Color Tokens ---
const codex = {
  gold:       '#c9a84c',
  goldLight:  '#e0c872',
  goldDark:   '#9a7b2e',
  burgundy:   '#8b2635',
  burgundyLight: '#b03848',
  emerald:    '#2d6a4f',
  crimson:    '#9b2226',
  amber:      '#d4a036',
};

const darkPalette = {
  leather:    '#1a1614',
  wood:       '#2a2420',
  woodLight:  '#352e28',
  woodLighter:'#403830',
  parchment:  '#e8dcc8',
  parchDim:   '#b8a890',
  inkFaint:   '#786a5a',
};

const lightPalette = {
  parchment:   '#f4ece1',
  parchLight:  '#fff8ef',
  parchDark:   '#e8dcc8',
  ink:         '#2c1810',
  inkSecondary:'#5a4636',
  inkFaint:    '#8a7662',
  woodAccent:  '#3d2b1f',
};

function buildStoryOverrides(mode) {
  const isDark = mode === 'dark';
  const bg = isDark ? darkPalette : lightPalette;
  const gold = codex.gold;
  const goldAlpha = (a) => alpha(gold, a);

  const sansStack = '"Crimson Pro", "Georgia", serif';
  const serifDisplayStack = '"Cinzel", serif';
  const decorativeStack = '"Cinzel Decorative", "Cinzel", serif';
  const monoStack = '"JetBrains Mono", monospace';

  return {
    palette: {
      background: {
        default: isDark ? bg.leather : bg.parchment,
        paper:   isDark ? bg.wood : bg.parchLight,
      },
      text: {
        primary:   isDark ? bg.parchment : bg.ink,
        secondary: isDark ? bg.parchDim : bg.inkSecondary,
        disabled:  bg.inkFaint,
      },
      divider: goldAlpha(isDark ? 0.1 : 0.15),
      // App-specific slot
      codex,
    },

    typography: {
      fontFamily: sansStack,
      h1: {
        fontFamily: decorativeStack,
        fontWeight: 700,
        fontSize: '2.25rem',
        letterSpacing: '0.04em',
        lineHeight: 1.2,
      },
      h2: {
        fontFamily: serifDisplayStack,
        fontWeight: 600,
        fontSize: '1.625rem',
        letterSpacing: '0.03em',
        lineHeight: 1.3,
      },
      h3: {
        fontFamily: serifDisplayStack,
        fontWeight: 600,
        fontSize: '1.375rem',
        letterSpacing: '0.02em',
      },
      h4: {
        fontFamily: serifDisplayStack,
        fontWeight: 500,
        fontSize: '1.2rem',
        letterSpacing: '0.02em',
      },
      h5: {
        fontFamily: serifDisplayStack,
        fontWeight: 500,
        fontSize: '1.05rem',
        letterSpacing: '0.015em',
      },
      h6: {
        fontFamily: serifDisplayStack,
        fontWeight: 500,
        fontSize: '0.925rem',
        letterSpacing: '0.015em',
      },
      body1: { fontSize: '1rem', lineHeight: 1.7, letterSpacing: '0.01em' },
      body2: { fontSize: '0.875rem', lineHeight: 1.6 },
      caption: {
        fontFamily: monoStack,
        fontSize: '0.75rem',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      },
      overline: {
        fontFamily: serifDisplayStack,
        fontSize: '0.7rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        fontWeight: 600,
      },
      button: {
        fontFamily: serifDisplayStack,
        fontWeight: 600,
        fontSize: '0.85rem',
        letterSpacing: '0.06em',
        textTransform: 'none',
      },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: isDark
              ? `radial-gradient(ellipse at 20% 0%, ${alpha(codex.burgundy, 0.08)} 0%, transparent 50%),
                 radial-gradient(ellipse at 80% 100%, ${alpha(codex.gold, 0.04)} 0%, transparent 50%)`
              : `radial-gradient(ellipse at 20% 0%, ${alpha(codex.gold, 0.06)} 0%, transparent 50%),
                 radial-gradient(ellipse at 80% 100%, ${alpha(codex.burgundy, 0.03)} 0%, transparent 50%)`,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${goldAlpha(isDark ? 0.15 : 0.2)}`,
            backgroundColor: isDark ? alpha(bg.wood, 0.8) : alpha(bg.parchLight, 0.8),
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          contained: {
            background: isDark
              ? `linear-gradient(135deg, ${codex.gold} 0%, ${codex.goldDark} 100%)`
              : `linear-gradient(135deg, ${codex.burgundy} 0%, ${alpha(codex.burgundy, 0.85)} 100%)`,
            color: isDark ? bg.leather : '#fff',
            '&:hover': {
              background: isDark
                ? `linear-gradient(135deg, ${codex.goldLight} 0%, ${codex.gold} 100%)`
                : `linear-gradient(135deg, ${codex.burgundyLight} 0%, ${codex.burgundy} 100%)`,
            },
          },
          outlined: {
            borderColor: goldAlpha(0.35),
            color: isDark ? codex.gold : codex.burgundy,
            '&:hover': {
              borderColor: isDark ? codex.gold : codex.burgundy,
              backgroundColor: goldAlpha(0.06),
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            border: `1px solid ${goldAlpha(isDark ? 0.12 : 0.18)}`,
            backgroundImage: isDark
              ? `linear-gradient(160deg, ${bg.wood} 0%, ${bg.leather} 100%)`
              : 'none',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundImage: isDark
              ? `linear-gradient(180deg, ${bg.wood} 0%, ${bg.leather} 100%)`
              : `linear-gradient(180deg, ${bg.parchLight} 0%, ${bg.parchment} 100%)`,
            borderRight: `1px solid ${goldAlpha(0.15)}`,
          },
        },
      },
    },
  };
}

/**
 * createStoryTheme(mode)
 *
 * Composes shared GeekSuite rules with StoryGeek "Arcane Codex" identity.
 */
export function createStoryTheme(mode = 'light') {
  const isDark = mode === 'dark';

  // StoryGeek's primary color flips with the mode
  const storyAccent = isDark
    ? { main: codex.gold, light: codex.goldLight, dark: codex.goldDark, contrastText: darkPalette.leather }
    : { main: codex.burgundy, light: codex.burgundyLight, dark: '#6d1f2b', contrastText: '#fff' };

  return createGeekSuiteTheme({
    mode,
    accent: storyAccent,
    overrides: buildStoryOverrides(mode),
  });
}

export default createStoryTheme('light');
