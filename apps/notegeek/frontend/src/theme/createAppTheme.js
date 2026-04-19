import { createTheme } from '@mui/material/styles';

/**
 * NoteGeek Theme: "Ink Studio"
 *
 * Writer's tool, not a control panel. Cream paper, ink-black type,
 * a single oxblood accent for the few things that actually matter.
 * Mono caption text reinforces "studio" identity — every timestamp,
 * tag, and type indicator reads as deliberate metadata.
 *
 * Sister to basegeek (same Geist typeface — suite continuity) but
 * applied to a content-editor paradigm rather than mission control.
 *
 * See apps/notegeek/DOCS/REDESIGN_2026-04.md for the full direction.
 */
export function createAppTheme(mode) {
  const isLight = mode === 'light';

  // Cream-paper / ink-desk-lamp palette. Both modes are warm — no
  // pure black, no stone gray, no blue cast anywhere.
  const surfaces = isLight
    ? { default: '#FBF7EE', paper: '#FFFCF5', elevated: '#FFFFFF' }
    : { default: '#16140F', paper: '#1F1C16', elevated: '#26221A' };

  const text = isLight
    ? { primary: '#1F1C16', secondary: '#6B6258', disabled: '#A8A09A' }
    : { primary: '#EDE6D6', secondary: '#998F80', disabled: '#5C544A' };

  const divider = isLight ? '#E5DDC8' : '#2D2A24';
  const border = isLight ? '#D8D0BD' : '#3A352D';

  // Oxblood — sharp, confident, owned by no other geek app.
  const accent = isLight
    ? { main: '#8B2C2A', light: '#B5524F', dark: '#5E1A19' }
    : { main: '#C97570', light: '#E0A29D', dark: '#8B2C2A' };

  // Focus rings, hover backgrounds — kept low-opacity so they read
  // as "warm tone" rather than "the UI yelling at you."
  const glow = isLight
    ? {
        ring:   'rgba(139, 44, 42, 0.18)',
        soft:   'rgba(139, 44, 42, 0.05)',
        medium: 'rgba(139, 44, 42, 0.10)',
        border: 'rgba(139, 44, 42, 0.28)',
      }
    : {
        ring:   'rgba(201, 117, 112, 0.22)',
        soft:   'rgba(201, 117, 112, 0.06)',
        medium: 'rgba(201, 117, 112, 0.12)',
        border: 'rgba(201, 117, 112, 0.30)',
      };

  // Semantic colors — muted, editorial, never alarmist. Errors share
  // the primary oxblood so destructive actions read as confident,
  // not panicked.
  const semantic = isLight
    ? { success: '#5B7A4A', warning: '#A8782F', error: '#8B2C2A', info: '#3D6B7A' }
    : { success: '#7DA869', warning: '#D4A05A', error: '#C97570', info: '#7AA4B0' };

  const sansStack =
    '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const monoStack =
    '"JetBrains Mono", "Geist Mono", ui-monospace, "SFMono-Regular", monospace';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: accent.main,
        light: accent.light,
        dark: accent.dark,
        contrastText: surfaces.paper,
      },
      // Secondary stays warm-neutral — there's intentionally no second
      // accent color competing with oxblood.
      secondary: {
        main: text.secondary,
        light: text.disabled,
        dark: text.primary,
        contrastText: surfaces.paper,
      },
      background: {
        default: surfaces.default,
        paper: surfaces.paper,
      },
      text: {
        primary: text.primary,
        secondary: text.secondary,
        disabled: text.disabled,
      },
      divider,
      error:   { main: semantic.error,   light: accent.light,  dark: accent.dark },
      warning: { main: semantic.warning, light: '#D4A05A',     dark: '#7A5520' },
      success: { main: semantic.success, light: '#7DA869',     dark: '#3D5230' },
      info:    { main: semantic.info,    light: '#7AA4B0',     dark: '#264755' },

      // Branded slot — components that want the wordmark color.
      brand: {
        note: text.primary,
        accent: accent.main,
      },

      // Note type accents — earthy, used as the dot/swatch beside
      // a note row or in the type pill in NoteMetaBar.
      noteTypes: {
        text:        text.primary,
        markdown:    semantic.info,
        code:        semantic.success,
        mindmap:     semantic.warning,
        handwritten: accent.main,
      },

      // Surfaces token — content components reach for `elevated`
      // when they want the editor-paper feel (slightly brighter
      // than `paper`).
      surfaces,
      border,
      glow,
    },

    typography: {
      fontFamily: sansStack,
      fontFamilyMono: monoStack,

      h1: { fontFamily: sansStack, fontWeight: 700, fontSize: '2rem',     letterSpacing: '-0.025em', lineHeight: 1.15 },
      h2: { fontFamily: sansStack, fontWeight: 700, fontSize: '1.5rem',   letterSpacing: '-0.02em',  lineHeight: 1.2 },
      h3: { fontFamily: sansStack, fontWeight: 600, fontSize: '1.25rem',  letterSpacing: '-0.015em', lineHeight: 1.3 },
      h4: { fontFamily: sansStack, fontWeight: 600, fontSize: '1.0625rem',letterSpacing: '-0.01em',  lineHeight: 1.35 },
      h5: { fontFamily: sansStack, fontWeight: 600, fontSize: '0.9375rem',lineHeight: 1.4 },
      // h6 is the "section overline" — mono caps. Reach for it whenever
      // a sidebar / panel section needs a quiet header.
      h6: {
        fontFamily: monoStack,
        fontWeight: 600,
        fontSize: '0.6875rem',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        lineHeight: 1,
      },
      subtitle1: { fontFamily: sansStack, fontWeight: 500, fontSize: '0.9375rem', lineHeight: 1.5 },
      subtitle2: {
        fontFamily: monoStack,
        fontWeight: 600,
        fontSize: '0.6875rem',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      },
      body1:  { fontFamily: sansStack, fontWeight: 400, fontSize: '0.9375rem', lineHeight: 1.65 },
      body2:  { fontFamily: sansStack, fontWeight: 400, fontSize: '0.8125rem', lineHeight: 1.6 },
      button: {
        fontFamily: sansStack,
        fontWeight: 600,
        fontSize: '0.8125rem',
        textTransform: 'none',
        letterSpacing: '0.005em',
      },
      // Caption is mono on purpose — every timestamp, byte count, tag
      // chip, breadcrumb, etc. should read as "metadata" rather than
      // "prose." This is the most distinctive typographic move in the
      // design language; lean into it.
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

    shape: { borderRadius: 8 },

    // Warm, low-elevation shadow scale. Keep them subtle — the design
    // leans on hairline borders for definition rather than shadow depth.
    shadows: [
      'none',
      isLight ? '0 1px 2px rgba(31, 28, 22, 0.06)' : '0 1px 2px rgba(0, 0, 0, 0.30)',
      isLight ? '0 2px 4px rgba(31, 28, 22, 0.08)' : '0 2px 4px rgba(0, 0, 0, 0.35)',
      isLight ? '0 4px 8px rgba(31, 28, 22, 0.10)' : '0 4px 8px rgba(0, 0, 0, 0.40)',
      isLight ? '0 8px 16px rgba(31, 28, 22, 0.12)': '0 8px 16px rgba(0, 0, 0, 0.45)',
      isLight ? '0 12px 24px rgba(31, 28, 22, 0.14)':'0 12px 24px rgba(0, 0, 0, 0.50)',
      ...Array(19).fill(isLight
        ? '0 12px 24px rgba(31, 28, 22, 0.14)'
        : '0 12px 24px rgba(0, 0, 0, 0.50)'),
    ],

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '*, *::before, *::after': {
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          },
          '::selection': {
            backgroundColor: glow.medium,
            color: 'inherit',
          },
          'input, textarea, [contenteditable]': {
            caretColor: `${accent.main} !important`,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            padding: '6px 14px',
            transition: 'all 120ms ease',
            fontSize: '0.8125rem',
            minHeight: 34,
          },
          sizeSmall: { padding: '4px 10px', fontSize: '0.75rem', minHeight: 28 },
          contained: {
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
          },
          outlined: {
            borderWidth: 1,
            borderColor: border,
            '&:hover': {
              borderWidth: 1,
              borderColor: accent.main,
              backgroundColor: glow.soft,
            },
            '&:focus-visible': {
              boxShadow: `0 0 0 3px ${glow.ring}`,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${border}`,
          },
          elevation0: { boxShadow: 'none' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            border: `1px solid ${border}`,
            backgroundImage: 'none',
            transition: 'border-color 120ms ease, box-shadow 150ms ease',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 10,
            border: `1px solid ${border}`,
            backgroundColor: surfaces.paper,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 4,
            fontFamily: monoStack,
            fontWeight: 500,
            fontSize: '0.6875rem',
            letterSpacing: '0.04em',
            padding: '5px 10px',
            backgroundColor: text.primary,
            color: surfaces.paper,
          },
          arrow: { color: text.primary },
        },
      },
      // Chips read as ink stamps — sharp 4px corners, mono font (matches
      // the caption convention), hairline border. Used heavily for tags.
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
          label: { paddingLeft: 8, paddingRight: 8 },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            margin: '1px 6px',
            padding: '6px 10px',
            transition: 'all 100ms ease',
            '&.Mui-selected': {
              backgroundColor: glow.soft,
              borderLeft: `2px solid ${accent.main}`,
              paddingLeft: 8,
              '&:hover': { backgroundColor: glow.medium },
            },
            '&:hover': {
              backgroundColor: isLight
                ? 'rgba(31, 28, 22, 0.04)'
                : 'rgba(237, 230, 214, 0.04)',
            },
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: surfaces.paper,
            borderRight: `1px solid ${divider}`,
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
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 6,
              transition: 'all 120ms ease',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: border },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: text.disabled },
              '&.Mui-focused': { boxShadow: `0 0 0 3px ${glow.ring}` },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: accent.main,
                borderWidth: 1.5,
              },
            },
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            fontWeight: 500,
            border: '1px solid',
          },
          standardError: {
            backgroundColor: glow.soft,
            borderColor: glow.border,
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { backgroundColor: accent.main, height: 2 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.875rem',
            '&.Mui-selected': { color: accent.main },
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: { borderColor: divider },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          switchBase: {
            '&.Mui-checked': {
              color: accent.main,
              '& + .MuiSwitch-track': {
                backgroundColor: accent.main,
                opacity: 0.4,
              },
            },
          },
        },
      },
    },
  });
}
