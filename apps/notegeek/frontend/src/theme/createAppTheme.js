/**
 * NoteGeek Theme: "Graphite"
 *
 * Pencil on pale grey-green engineering paper. Graphite ink (warm dark grey,
 * never black), one highlighter-yellow accent used only as a fill behind ink,
 * and a faint grid on the desk. At night: slate paper, light-graphite ink,
 * the highlighter still a fill with dark ink on it. See
 * apps/notegeek/DOCS/CONTEXT.md §7 and theme/graphite.js (the palette, with
 * every pair measured in __tests__/theme/graphiteContrast.test.js).
 *
 * What it is not: TodoGeek's paper + black + red, BookGeek's navy cloth and
 * serif, GameGeek's neon stickers, StoryGeek's parchment, FitnessGeek's
 * cream and produce, BaseGeek's steel panel.
 *
 * MUI's `primary` is the graphite pencil, not the yellow: the suite reads
 * `primary.main` as link text, focus rings and active icons, and yellow on
 * paper is unreadable. The highlighter is wired in explicitly where it
 * belongs — contained primary buttons, selected list rows, ::selection.
 */
import { alpha } from '@mui/material/styles';
import { createGeekSuiteTheme } from '@geeksuite/ui';
import { graphite, SANS, MONO } from './graphite';

function buildNoteOverrides(mode) {
  const g = graphite[mode === 'dark' ? 'dark' : 'light'];
  const isLight = mode !== 'dark';

  const surfaces = { default: g.desk, paper: g.paper, elevated: g.sheet };

  // Type identity is an icon now, not a colour: every type draws in the
  // same soft graphite. The map survives because mind-map edges, code-preview
  // rules and thumbnails still ask for "the colour of this type".
  const noteTypes = {
    text: g.lead,
    markdown: g.lead,
    code: g.lead,
    mindmap: g.lead,
    handwritten: g.lead,
  };
  // Text-bearing type colour (the code preview's keyword tint etc.): plain
  // secondary ink, so it clears 4.5:1 everywhere secondary text does.
  const noteTypeInk = {
    text: g.ink,
    markdown: g.ink2,
    code: g.ink2,
    mindmap: g.ink2,
    handwritten: g.ink2,
  };

  const hlHover = isLight ? '#EDD43A' : '#D4BB3C';

  return {
    palette: {
      background: { default: g.desk, paper: g.paper },
      text: { primary: g.ink, secondary: g.ink2, muted: g.muted, disabled: g.disabled },
      error: { main: g.error, contrastText: isLight ? '#FFFFFF' : g.desk },
      divider: g.rule,
      // Custom NoteGeek tokens — read through ../theme/tokens.js helpers,
      // never directly, so a plain MUI theme cannot crash the UI.
      surfaces,
      border: g.border,
      noteTypes,
      noteTypeInk,
      graphite: g,
      stamp: { ink: g.ink2, error: g.error, muted: g.ink2 },
      dotGrid: g.grid,
    },

    typography: {
      fontFamily: SANS,
      fontFamilyMono: MONO,
      h1: { fontFamily: SANS, fontWeight: 650, fontSize: '2rem', letterSpacing: '-0.02em', lineHeight: 1.15 },
      h2: { fontFamily: SANS, fontWeight: 650, fontSize: '1.5rem', letterSpacing: '-0.015em', lineHeight: 1.2 },
      h3: { fontFamily: SANS, fontWeight: 600, fontSize: '1.25rem', letterSpacing: '-0.01em', lineHeight: 1.3 },
      h4: { fontFamily: SANS, fontWeight: 600, fontSize: '1.0625rem', letterSpacing: '-0.005em', lineHeight: 1.35 },
      h5: { fontFamily: SANS, fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.4 },
      // Section labels: sentence case, sans, secondary ink. The Lab Notebook
      // set these in letterspaced uppercase mono; Graphite lets the notes be
      // the loudest thing on the page.
      h6: {
        fontFamily: SANS,
        fontWeight: 600,
        fontSize: '0.8125rem',
        letterSpacing: '0',
        textTransform: 'none',
        lineHeight: 1.3,
      },
      // Captions are the metadata voice: small mono, lowercase as written.
      caption: {
        fontFamily: MONO,
        fontWeight: 400,
        fontSize: '0.75rem',
        letterSpacing: '0',
        wordSpacing: 'normal',
        color: g.ink2,
      },
      overline: {
        fontFamily: SANS,
        fontWeight: 600,
        fontSize: '0.75rem',
        letterSpacing: '0.02em',
        textTransform: 'none',
      },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // The page's tokens as CSS variables, for the plain stylesheet the
          // rich-text surface uses (src/index.css).
          ':root': {
            '--ng-ink': g.ink,
            '--ng-ink2': g.ink2,
            '--ng-hl': g.hl,
            '--ng-hl-soft': g.hlSoft,
            '--ng-on-hl': g.onHl,
            '--ng-rule': g.rule,
            '--ng-border': g.border,
            '--ng-desk': g.desk,
            '--ng-sheet': g.sheet,
            '--ng-mono': MONO,
          },
          // Spline Sans sets a tight word space; at 13–16px on a phone
          // "below and" read as "belowand". A hair more, everywhere the sans
          // is used (form controls reset word-spacing, so they are named).
          'body, input, textarea, button': { wordSpacing: '0.06em' },
          // …but never in code: mono columns must line up.
          'pre, code, kbd, samp, [data-mono]': { wordSpacing: 'normal' },
          'input, textarea, [contenteditable]': {
            caretColor: `${g.ink} !important`,
          },
          // The highlighter, where it does the most good: over whatever the
          // writer selects. Ink on it, in both modes.
          '::selection': { backgroundColor: g.hl, color: g.onHl },
          'mark, .ng-hit': {
            backgroundColor: g.hl,
            color: g.onHl,
            borderRadius: '2px',
            padding: '0 1px',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none', border: `1px solid ${g.rule}` },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: g.paper,
            borderBottom: `1px solid ${g.rule}`,
            backgroundImage: 'none',
            boxShadow: 'none',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          // The primary action is a stroke of highlighter with ink on it.
          containedPrimary: {
            backgroundColor: g.hl,
            color: g.onHl,
            fontWeight: 650,
            '&:hover': { backgroundColor: hlHover },
            '&:active': { backgroundColor: hlHover },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&:hover': { backgroundColor: alpha(g.ink, isLight ? 0.05 : 0.07) },
            // The active nav row: highlighter under ink.
            '&.Mui-selected': {
              backgroundColor: g.hl,
              color: g.onHl,
              '& .MuiListItemIcon-root': { color: g.onHl },
              '&:hover': { backgroundColor: hlHover },
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            fontFamily: SANS,
            fontWeight: 500,
            fontSize: '0.8125rem',
            height: 26,
            border: `1px solid ${g.border}`,
            backgroundColor: 'transparent',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { fontFamily: SANS },
        },
      },
    },
  };
}

/**
 * createNoteTheme(mode)
 *
 * Shared GeekSuite rules + NoteGeek "Graphite".
 */
export function createNoteTheme(mode = 'light') {
  const g = graphite[mode === 'dark' ? 'dark' : 'light'];
  const theme = createGeekSuiteTheme({
    mode,
    accent: g.primary,
    overrides: buildNoteOverrides(mode),
  });

  // Failsafe: theme.palette.glow must exist even if Vite serves a stale,
  // pre-bundled @geeksuite/ui.
  if (!theme.palette.glow) {
    const accent = theme.palette.primary.main;
    theme.palette.glow = {
      ring: alpha(accent, 0.2),
      soft: alpha(accent, 0.06),
      medium: alpha(accent, 0.1),
      border: alpha(accent, 0.3),
    };
  }

  return theme;
}

// Legacy default export for any direct imports
export default createNoteTheme('light');
