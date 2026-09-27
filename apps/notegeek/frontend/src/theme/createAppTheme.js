/**
 * NoteGeek Theme: "Lab Notebook"
 *
 * An engineer's notebook: warm paper on a dot-grid desk, typewritten
 * metadata, and the brick accent used the way a rubber stamp is — sparingly,
 * outlined, and only on things that have a status (the save stamp, the five
 * note-type stamps). Calm, precise, tactile. It must not borrow from its
 * siblings: no cloth or serif (BookGeek), no neon or hard offset shadows
 * (GameGeek). See apps/notegeek/DOCS/CONTEXT.md, "Visual identity".
 *
 * Identity:
 * - Brick accent (#8B2C2A light / #C97570 dark)
 * - Warm paper sheet (#FFFDF8) on a cream dot-grid desk (#FBF7EE)
 * - Geist (sans) / JetBrains Mono (mono), both self-hosted
 */
import { alpha } from '@mui/material/styles';
import { createGeekSuiteTheme } from '@geeksuite/ui';

const noteAccent = {
  light: '#B5524F',
  main:  '#8B2C2A',
  dark:  '#5E1A19',
  contrastText: '#FFFCF5',
};

// Oxblood is 2.0:1 as a foreground on the warm-black ground, so dark mode
// lifts the accent (matches noteTypes.handwritten below).
const noteAccentDark = {
  light: '#E09A95',
  main:  '#C97570',
  dark:  '#8B2C2A',
  contrastText: '#1F1C16',
};

const accentFor = (mode) => (mode === 'light' ? noteAccent : noteAccentDark);

function buildNoteOverrides(mode) {
  const isLight = mode === 'light';
  const accent = accentFor(mode);

  // Cream-paper / ink-desk-lamp palette.
  // `elevated` is the writing sheet. Warm white rather than #FFFFFF: pure
  // white on cream read as a form field, not as a page.
  const surfaces = isLight
    ? { default: '#FBF7EE', paper: '#FFFCF5', elevated: '#FFFDF8' }
    : { default: '#16140F', paper: '#1F1C16', elevated: '#26221A' };

  const text = isLight
    ? { primary: '#1F1C16', secondary: '#6B6258', muted: '#7A7064', disabled: '#857C72' }
    : { primary: '#EDE6D6', secondary: '#998F80', muted: '#A89C8C', disabled: '#7A7062' };

  const divider = isLight ? '#E5DDC8' : '#2D2A24';
  const border  = isLight ? '#D8D0BD' : '#3A352D';

  // Per-note-type identity colours — earthy and editorial, never playful.
  // Hues are spread across the wheel (blue → green → amber → red) so the
  // 7px identity dots stay distinguishable at a glance. Dark mode lifts
  // each hue so it stays legible on the warm-black ground.
  const noteTypes = isLight
    ? {
        text:        '#1F1C16',  // ink black
        markdown:    '#2D6A9F',  // slate blue
        code:        '#4A7A2E',  // forest green
        mindmap:     '#B8841F',  // warm amber
        handwritten: '#8B2C2A',  // oxblood
      }
    : {
        text:        '#EDE6D6',
        markdown:    '#6BA5D6',
        code:        '#7DAE50',
        mindmap:     '#D9A542',
        handwritten: '#C97570',
      };

  // Text-bearing versions of the type colours: the same hue, pushed until
  // 12px mono on the stamp's own tinted fill (`stampFill` in tokens.js,
  // 8% light / 12% dark) clears 4.5:1 on every surface it sits on — sheet,
  // desk and paper. Measured (worst surface): light text 13.5, markdown 5.69,
  // code 5.35, mindmap 5.18, sketch 6.93; dark text 9.11, markdown 5.66,
  // code 5.74, mindmap 6.23, sketch 5.31. The plain `noteTypes` hues above
  // stay for dots, edges and strokes, where there is no text to read —
  // light mindmap amber is only 3.25:1 as text.
  const noteTypeInk = isLight
    ? {
        text:        '#1F1C16',
        markdown:    '#275E8E',
        code:        '#3E6A25',
        mindmap:     '#805A0E',
        handwritten: '#8B2C2A',
      }
    : {
        text:        '#EDE6D6',
        markdown:    '#7DB2DF',
        code:        '#8CBC5E',
        mindmap:     '#E0B055',
        handwritten: '#DE948E',
      };

  // The rubber stamp. Brick ink for "Saved", a readable error red for
  // "Not saved". Same 4.5:1-on-own-fill rule: light brick 6.93, error 6.03;
  // dark brick 5.31, error 5.87 (worst surface).
  const stamp = isLight
    ? { ink: '#8B2C2A', error: '#A3261F', muted: '#6B6258' }
    : { ink: '#DE948E', error: '#F2998F', muted: '#A89C8C' };

  // Dot grid on the desk: one 1px dot every 16px (four suite units). Faint
  // enough that nothing is ever set on top of it that needs the contrast.
  const dotGrid = isLight ? 'rgba(31, 28, 22, 0.13)' : 'rgba(237, 230, 214, 0.075)';

  const sansStack = '"Geist Variable", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
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
        muted:     text.muted,
        disabled:  text.disabled,
      },
      divider,
      // Custom NoteGeek tokens — read these via ../theme/tokens.js helpers,
      // never directly, so a plain MUI theme can't crash the UI.
      surfaces,
      border,
      noteTypes,
      noteTypeInk,
      stamp,
      dotGrid,
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
        // 12px text floor (MOBILE_UI_PLAN §2) — the uppercase mono label
        // identity holds fine at 12px, it just can't go below it.
        fontSize: '0.75rem',
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
            caretColor: `${accent.main} !important`,
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
            // 12px text floor (MOBILE_UI_PLAN §2). Visual height stays 22 —
            // only the label text was under the floor.
            fontSize: '0.75rem',
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
 * Composes shared GeekSuite rules with NoteGeek "Lab Notebook" identity.
 */
export function createNoteTheme(mode = 'light') {
  const accent = accentFor(mode);
  const theme = createGeekSuiteTheme({
    mode,
    accent,
    overrides: buildNoteOverrides(mode),
  });

  // Failsafe: Ensure theme.palette.glow is always defined even if
  // Vite is serving an outdated, pre-bundled cache of @geeksuite/ui.
  if (!theme.palette.glow) {
    theme.palette.glow = {
      ring: alpha(accent.main, 0.20),
      soft: alpha(accent.main, 0.06),
      medium: alpha(accent.main, 0.10),
      border: alpha(accent.main, 0.30),
    };
  }

  return theme;
}

// Legacy default export for any direct imports
export default createNoteTheme('light');
