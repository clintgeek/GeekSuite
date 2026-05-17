/**
 * NoteGeek Theme: "Ink Studio"
 *
 * Writer's tool, not a control panel. Composes createGeekSuiteTheme
 * with NoteGeek-specific identity overrides.
 *
 * Identity:
 * - Oxblood accent (#8B2C2A)
 * - Cream paper surfaces (#FBF7EE)
 * - Geist (sans) / JetBrains Mono (mono) typography
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';

const noteAccent = {
  light: '#B5524F',
  main:  '#8B2C2A',
  dark:  '#5E1A19',
  contrastText: '#FFFCF5',
};

function buildNoteOverrides(mode) {
  const isLight = mode === 'light';

  // Cream-paper / ink-desk-lamp palette.
  const surfaces = isLight
    ? { default: '#FBF7EE', paper: '#FFFCF5', elevated: '#FFFFFF' }
    : { default: '#16140F', paper: '#1F1C16', elevated: '#26221A' };

  const text = isLight
    ? { primary: '#1F1C16', secondary: '#6B6258', disabled: '#A8A09A' }
    : { primary: '#EDE6D6', secondary: '#998F80', disabled: '#5C544A' };

  const divider = isLight ? '#E5DDC8' : '#2D2A24';
  const border  = isLight ? '#D8D0BD' : '#3A352D';

  const sansStack = '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const monoStack = '"JetBrains Mono", "Geist Mono", ui-monospace, "SFMono-Regular", monospace';

  return {
    palette: {
      background: {
        default: surfaces.default,
        paper:   surfaces.paper,
      },
      text: {
        primary:   text.primary,
        secondary: text.secondary,
        disabled:  text.disabled,
      },
      divider,
      // Custom NoteGeek tokens
      surfaces,
      border,
    },

    typography: {
      fontFamily: sansStack,
      fontFamilyMono: monoStack,

      // Headers keep Geist but use NoteGeek-specific weights/spacing
      h1: { fontFamily: sansStack, fontWeight: 700, fontSize: '2rem',     letterSpacing: '-0.025em', lineHeight: 1.15 },
      h2: { fontFamily: sansStack, fontWeight: 700, fontSize: '1.5rem',   letterSpacing: '-0.02em',  lineHeight: 1.2 },
      h3: { fontFamily: sansStack, fontWeight: 600, fontSize: '1.25rem',  letterSpacing: '-0.015em', lineHeight: 1.3 },
      h4: { fontFamily: sansStack, fontWeight: 600, fontSize: '1.0625rem',letterSpacing: '-0.01em',  lineHeight: 1.35 },
      h5: { fontFamily: sansStack, fontWeight: 600, fontSize: '0.9375rem',lineHeight: 1.4 },
      h6: {
        fontFamily: monoStack,
        fontWeight: 600,
        fontSize: '0.6875rem',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        lineHeight: 1,
      },

      // Captions and Overlines are Mono — NoteGeek's metadata identity
      caption: {
        fontFamily: monoStack,
        fontWeight: 500,
        fontSize: '0.75rem',
        color: text.secondary,
      },
      overline: {
        fontFamily: monoStack,
        fontWeight: 600,
        fontSize: '0.6875rem',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
      },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          'input, textarea, [contenteditable]': {
            caretColor: `${noteAccent.main} !important`,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${border}`,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: surfaces.paper,
            borderBottom: `1px solid ${divider}`,
            backgroundImage: 'none',
          },
        },
      },
      // NoteGeek specific chips — ink stamp style
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            fontFamily: monoStack,
            fontWeight: 500,
            fontSize: '0.6875rem',
            height: 22,
            border: `1px solid ${border}`,
            backgroundColor: 'transparent',
          },
        },
      },
    },
  };
}

/**
 * createNoteTheme(mode)
 *
 * Composes shared GeekSuite rules with NoteGeek "Ink Studio" identity.
 */
export function createNoteTheme(mode = 'light') {
  return createGeekSuiteTheme({
    mode,
    accent:    noteAccent,
    overrides: buildNoteOverrides(mode),
  });
}

// Legacy default export for any direct imports
export default createNoteTheme('light');
