import { alpha, darken } from '@mui/material/styles';
import { createGeekSuiteTheme } from '@geeksuite/ui';

/**
 * BaseGeek Theme: "The Signal Box"
 *
 * baseGeek is the interlocking every request in the suite passes through —
 * auth, the gateway, the AI router. So the console is the box it lives in: a
 * blackened-steel instrument panel with cream enamel plates, brass lever
 * plates, dymo-tape labels and lamps that are lit by real readings. Night turn
 * (dark) is the panel under its own lamps; day turn (light) is the same panel
 * painted in pale signal-box steel, the way the old illuminated diagrams were.
 *
 * Neighbours it must not look like: GameGeek's neon stickers, BookGeek's navy
 * cloth, NoteGeek's warm paper and rubber stamps, ThingGeek's green ledger. So:
 * cool steel grounds (no paper warmth), brass instead of an accent colour, and
 * type from the cockpit rather than the desk —
 *
 * - **B612** (sans + mono): the typeface Airbus commissioned for cockpit
 *   displays, drawn to be read at a glance under bad light. Body, tables,
 *   readouts.
 * - **Big Shoulders Stencil Display**: plate lettering. Titles only, never
 *   body copy.
 *
 * Contrast: every palette pair asserted by
 * packages/ui/src/__tests__/themeContrast.test.js clears WCAG AA in BOTH
 * modes, and `chipContrast.test.js` holds the filled status chips to 4.5:1.
 * Measured ratios sit beside the values — retune with those suites, not by eye.
 */

export const FONT_SANS = '"B612", "Segoe UI", system-ui, sans-serif';
export const FONT_MONO = '"B612 Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';
export const FONT_PLATE = '"Big Shoulders Stencil Display", "B612", "Arial Narrow", sans-serif';

// Blackened steel — the night-turn ramp. Exposed as `stone` for continuity
// with the pre-Signal-Box components that read it; prefer `surfaces`.
const stone = {
  950: '#08090a',
  900: '#0e1012',
  850: '#171a1e',
  800: '#1f2328',
  700: '#2b3037',
  600: '#3a414a',
  500: '#4a525c',
  400: '#5d6670',
  300: '#737b85',
  200: '#9ca3ac',
  100: '#d7dade',
  50: '#f1f2f3',
};

// Signal-box steel, painted — the day-turn ramp. Cool, not paper-warm.
const paperScale = {
  50: '#ffffff',
  100: '#f3f5f6',
  200: '#e8ecee',
  300: '#dde2e6',
  400: '#cdd3d8',
};

// Brass. Night: polished (8.22:1 on the panel, 8.87:1 under its dark ink).
// Day: tarnished deep brass (6.07:1 on the panel, 6.64:1 under white).
const accentDark = { main: '#d9ab4e', light: '#e8c47a', dark: '#b0863a', contrastText: '#14110a' };
const accentLight = { main: '#7a560c', light: '#a07a2c', dark: '#5a3f08', contrastText: '#ffffff' };

// Status hues. Night values are lamp-bright; day values are deepened so each
// clears 4.5:1 on the day panel as text, not just 3:1 as a glyph.
const semanticDark = {
  error: { main: '#ff8a7a', light: '#ffb3a8', dark: '#c6483a', contrastText: '#14110a' }, // 7.62:1
  warning: { main: '#f2b84b', light: '#f7d38c', dark: '#b8862a', contrastText: '#14110a' }, // 9.75:1
  success: { main: '#5fcf85', light: '#94e0ad', dark: '#2f8f52', contrastText: '#14110a' }, // 8.94:1
  info: { main: '#8fb8f2', light: '#b9d3f7', dark: '#4f7fc0', contrastText: '#14110a' }, // 8.57:1
};

const semanticLight = {
  error: { main: '#b0261d', light: '#d0564c', dark: '#7f1a14', contrastText: '#ffffff' }, // 6.11:1
  warning: { main: '#8a5300', light: '#b8862a', dark: '#5e3900', contrastText: '#ffffff' }, // 5.79:1
  success: { main: '#1b6a39', light: '#3f8f5c', dark: '#114a27', contrastText: '#ffffff' }, // 6.06:1
  info: { main: '#1c58a3', light: '#4f7fc0', dark: '#123d73', contrastText: '#ffffff' }, // 6.46:1
};

/**
 * The instrument tokens — everything that is not a surface or a text tier.
 *
 * Lamps are *graphics*: they owe 3:1 against the panel, and they never carry
 * meaning alone (every lamp has a shape per state and a word beside it — see
 * signalbox/Lamp.jsx). The fixed-fill tokens (tape, plate, enamel) are the
 * same in both modes, because a label is an object, not a surface; their inks
 * are measured against their own fill.
 */
function boxTokens(isLight) {
  return {
    lamp: isLight
      ? { ok: '#17803f', warn: '#a86400', fault: '#c42b1c', off: '#aab2ba', glow: 0.0 }
      : { ok: '#53d37c', warn: '#ffbf3f', fault: '#ff5b4d', off: '#4a525c', glow: 0.55 },
    // Lamp bezel: the ring that gives an unlit lamp its 3:1 edge.
    bezel: isLight ? '#3b434c' : '#737b85',
    // Dymo tape: white embossed on black (15.77:1) or on red (7.47:1).
    tape: { black: '#15181c', red: '#a3231a', ink: '#f4f1e8' },
    // Brass lever plate: engraved ink on the flat of the plate (7.59:1).
    plate: {
      face: '#caa14a',
      edge: '#8e6a22',
      shine: '#e9c97e',
      ink: '#1a1406',
    },
    // Cream enamel: the station nameboards (ink 14.08:1, red 7.49:1).
    enamel: { face: '#efe8d4', ink: '#1b1b1b', red: '#8c1c13', rim: '#1b1b1b' },
    // Gauge faces: always a light dial with dark ticks, like the real thing.
    dial: {
      face: isLight ? '#fbfaf6' : '#e9e4d6',
      ink: '#15181c',
      tick: '#3b434c',
      needle: '#b3261e',
      hub: '#15181c',
      zoneOk: '#2f8f52',
      zoneWarn: '#c98a14',
      zoneFault: '#b3261e',
    },
    // Track on the diagram, and the lit "route set" colour.
    track: isLight ? '#15181c' : '#9ca3ac',
    trackLit: isLight ? '#7a560c' : '#d9ab4e',
    screw: isLight ? '#9aa2aa' : '#3a414a',
    screwSlot: isLight ? '#5d6670' : '#15181c',
    // The chart recorder's paper and pen.
    chart: {
      paper: isLight ? '#fbfaf6' : '#e9e4d6',
      grid: isLight ? 'rgba(27, 106, 57, 0.18)' : 'rgba(27, 106, 57, 0.22)',
      pen: '#a3231a',
      ink: '#15181c',
    },
  };
}

const accentFor = (mode) => (mode === 'light' ? accentLight : accentDark);

/**
 * Per-app brand hues (the `color` fields in the app directories) are tuned for
 * a dark ground and land near 2:1 on a light one. Darken them for anything
 * that carries meaning — glyphs, chip labels — while tinted FILLS keep the raw
 * hue in both modes. Every suite brand hue clears 4.9:1 on its own 9% tint and
 * 5.2:1 on white at this coefficient.
 */
export function brandInk(theme, hex) {
  return theme.palette.mode === 'light' ? darken(hex, 0.4) : hex;
}

/** Four panel screws, as background layers, for a panel of any size. */
function screws(box) {
  const screw = (x, y) => `radial-gradient(circle at ${x} ${y}, ${box.screwSlot} 0 1px, ${box.screw} 1.5px 3.5px, transparent 4px)`;
  return [
    screw('10px', '10px'),
    screw('calc(100% - 10px)', '10px'),
    screw('10px', 'calc(100% - 10px)'),
    screw('calc(100% - 10px)', 'calc(100% - 10px)'),
  ].join(', ');
}

/**
 * Build the BaseGeek theme for a mode.
 * @param {'light'|'dark'} mode
 */
export function createBaseGeekTheme(mode = 'dark') {
  const isLight = mode === 'light';
  const accentPalette = accentFor(mode);
  const semantic = isLight ? semanticLight : semanticDark;
  const brass = accentPalette.main;
  const box = boxTokens(isLight);

  const surfaces = isLight
    ? { deep: paperScale[400], base: paperScale[300], surface: paperScale[100], elevated: paperScale[200] }
    : { deep: stone[950], base: stone[900], surface: stone[850], elevated: stone[800] };

  // Night: 14.01 / 8.55 / 6.86 on the panel. Day: 16.73 / 9.17 / 7.24.
  const text = isLight
    ? { primary: '#12151a', secondary: '#3b434c', muted: '#4a525c', disabled: '#737b85' }
    : { primary: '#ece6d6', secondary: '#b0b6be', muted: '#9ca3ac', disabled: '#737b85' };

  const line = isLight
    ? {
      divider: 'rgba(18, 21, 26, 0.10)',
      panel: '#b9c0c6',
      strong: '#8e979f',
      input: '#737b85',
      inputHover: '#3b434c',
      hover: 'rgba(18, 21, 26, 0.05)',
    }
    : {
      divider: 'rgba(236, 230, 214, 0.08)',
      panel: stone[700],
      strong: stone[600],
      input: stone[500],
      inputHover: stone[300],
      hover: 'rgba(236, 230, 214, 0.05)',
    };

  const glow = {
    ring: alpha(brass, 0.28),
    soft: alpha(brass, isLight ? 0.08 : 0.07),
    medium: alpha(brass, isLight ? 0.14 : 0.12),
    border: alpha(brass, 0.40),
  };

  const tooltip = isLight
    ? { bg: stone[800], fg: '#eef1f3', border: stone[600] } // 13.93:1
    : { bg: stone[700], fg: text.primary, border: stone[500] }; // 10.66:1

  const shadowTint = isLight ? '18, 21, 26' : '0, 0, 0';
  const s = (y, blur, a) => `0 ${y}px ${blur}px rgba(${shadowTint}, ${a})`;
  const shadowScale = isLight
    ? ['none', s(1, 2, 0.08), s(2, 4, 0.10), s(4, 8, 0.12), s(8, 16, 0.14), s(12, 24, 0.16), s(16, 32, 0.18)]
    : ['none', s(1, 2, 0.4), s(2, 4, 0.45), s(4, 8, 0.5), s(8, 16, 0.55), s(12, 24, 0.6), s(16, 32, 0.65)];

  // The bevel every raised panel wears: a lit top edge, a shadowed bottom.
  const bevel = isLight
    ? 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(18,21,26,0.08), 0 1px 2px rgba(18,21,26,0.10)'
    : 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.45)';

  // Brushed steel: hairline grain at a few percent, so no text tier moves.
  const brushed = isLight
    ? 'repeating-linear-gradient(90deg, rgba(18,21,26,0.018) 0 1px, transparent 1px 3px)'
    : 'repeating-linear-gradient(90deg, rgba(255,255,255,0.014) 0 1px, transparent 1px 3px)';

  return createGeekSuiteTheme({
    mode,
    accent: accentPalette,
    overrides: {
      palette: {
        secondary: isLight
          ? { main: '#1b6a39', light: '#3f8f5c', dark: '#114a27', contrastText: '#ffffff' }
          : { main: '#5fcf85', light: '#94e0ad', dark: '#2f8f52', contrastText: '#14110a' },
        background: {
          default: surfaces.base,
          paper: surfaces.surface,
        },
        text,
        divider: line.divider,
        error: semantic.error,
        warning: semantic.warning,
        success: semantic.success,
        info: semantic.info,
        stone,
        paperScale,
        surfaces,
        line,
        box,
        accent: {
          amber: brass,
          amberSoft: isLight ? '#5a3f08' : '#e8c47a',
          amberGlow: glow.medium,
          sage: semantic.success.main,
          sageSoft: alpha(semantic.success.main, 0.12),
          coral: semantic.error.main,
          coralSoft: alpha(semantic.error.main, 0.12),
          indigo: semantic.info.main,
          indigoSoft: alpha(semantic.info.main, 0.10),
          // The brass plate, as a fill. Fixed in both modes: a plate is an
          // object on the panel, not a surface of it.
          // Flat face through the middle, where the engraving sits (7.59:1);
          // the shine and the edge are only the plate's top and bottom lip.
          gradient: `linear-gradient(180deg, ${box.plate.shine} 0%, ${box.plate.face} 28%, ${box.plate.face} 78%, ${box.plate.edge} 100%)`,
          onBrightFill: box.plate.ink,
        },
        glow,
      },

      typography: {
        fontFamily: FONT_SANS,
        fontFamilyMono: FONT_MONO,
        fontFamilyPlate: FONT_PLATE,
        fontWeightMedium: 700,
        h1: { fontFamily: FONT_PLATE, fontWeight: 800, letterSpacing: '0.01em', lineHeight: 1.05, textTransform: 'uppercase' },
        h2: { fontFamily: FONT_PLATE, fontWeight: 800, letterSpacing: '0.01em', lineHeight: 1.1, textTransform: 'uppercase' },
        h3: { fontFamily: FONT_PLATE, fontWeight: 800, letterSpacing: '0.02em', lineHeight: 1.1, textTransform: 'uppercase' },
        h4: { fontFamily: FONT_PLATE, fontWeight: 800, letterSpacing: '0.03em', lineHeight: 1.15, textTransform: 'uppercase' },
        h5: { fontFamily: FONT_PLATE, fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1.2, textTransform: 'uppercase' },
        h6: { fontFamily: FONT_PLATE, fontWeight: 800, fontSize: '1.2rem', letterSpacing: '0.05em', lineHeight: 1.2, textTransform: 'uppercase' },
        subtitle1: { fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.5 },
        subtitle2: {
          fontFamily: FONT_MONO,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontSize: '0.75rem',
        },
        body1: { lineHeight: 1.6, fontSize: '0.9rem' },
        body2: { lineHeight: 1.55, fontSize: '0.8125rem' },
        button: { fontWeight: 700, textTransform: 'none', fontSize: '0.8125rem', letterSpacing: '0.01em' },
        caption: { fontWeight: 400, fontSize: '0.75rem', color: text.muted },
        overline: {
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          fontSize: '0.75rem',
          fontFamily: FONT_MONO,
          lineHeight: 1.6,
        },
      },

      shape: { borderRadius: 6 },

      shadows: [...shadowScale, ...Array(25 - shadowScale.length).fill(shadowScale[shadowScale.length - 1])],

      components: {
        MuiCssBaseline: {
          styleOverrides: {
            '*, *::before, *::after': {
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
            },
            body: {
              backgroundColor: surfaces.base,
              backgroundImage: brushed,
            },
            '::selection': {
              backgroundColor: alpha(brass, 0.30),
              color: 'inherit',
            },
            'input, textarea, [contenteditable]': {
              caretColor: `${brass} !important`,
            },
            // Numbers in this console are readings; they line up.
            'td, th, .MuiTableCell-root': {
              fontVariantNumeric: 'tabular-nums',
            },
          },
        },
        MuiButton: {
          styleOverrides: {
            root: {
              borderRadius: 4,
              padding: '8px 16px',
              transition: 'transform 80ms ease, box-shadow 120ms ease, background-color 150ms ease, border-color 150ms ease',
              fontSize: '0.8125rem',
              minHeight: 44,
              minWidth: 44,
              '&:active': { transform: 'translateY(1px)' },
              '&:focus-visible': { boxShadow: `0 0 0 3px ${glow.ring}` },
            },
            // A brass push-button: bevelled, pressed in on :active.
            contained: {
              boxShadow: `inset 0 1px 0 ${alpha('#ffffff', 0.35)}, inset 0 -2px 0 ${alpha('#000000', 0.25)}, 0 1px 2px ${alpha('#000000', 0.35)}`,
              '&:hover': { boxShadow: `inset 0 1px 0 ${alpha('#ffffff', 0.35)}, inset 0 -2px 0 ${alpha('#000000', 0.25)}, 0 1px 2px ${alpha('#000000', 0.35)}` },
              '&:active': { boxShadow: `inset 0 2px 3px ${alpha('#000000', 0.35)}` },
            },
            outlined: {
              borderColor: line.strong,
              backgroundColor: alpha(isLight ? '#ffffff' : '#000000', isLight ? 0.5 : 0.18),
              '@media (hover: hover)': {
                '&:hover': {
                  borderColor: brass,
                  backgroundColor: glow.soft,
                },
              },
            },
          },
        },
        MuiIconButton: {
          styleOverrides: {
            root: {
              '&:focus-visible': { boxShadow: `0 0 0 3px ${glow.ring}` },
            },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: {
              backgroundImage: 'none',
              border: `1px solid ${line.panel}`,
            },
            elevation0: { boxShadow: 'none' },
          },
        },
        MuiCard: {
          styleOverrides: {
            // A top-level card is a panel bolted to the rack: bevel, grain,
            // four screws. An `outlined` card is a card *inside* a panel, and
            // gets none of it — screws inside screws is a junk drawer.
            root: {
              borderRadius: 6,
              border: `1px solid ${line.panel}`,
              transition: 'border-color 150ms ease',
              '&:not(.MuiPaper-outlined)': {
                boxShadow: bevel,
                backgroundImage: `${screws(box)}, ${brushed}`,
              },
              '&.MuiPaper-outlined': {
                backgroundImage: 'none',
                backgroundColor: surfaces.elevated,
              },
            },
          },
        },
        MuiCardContent: {
          styleOverrides: {
            root: {
              padding: 20,
              '&:last-child': { paddingBottom: 20 },
            },
          },
        },
        MuiDialog: {
          styleOverrides: {
            paper: {
              borderRadius: 6,
              border: `1px solid ${line.strong}`,
              borderTop: `4px solid ${brass}`,
              backgroundColor: isLight ? paperScale[50] : stone[800],
              boxShadow: shadowScale[6],
            },
          },
        },
        MuiTooltip: {
          styleOverrides: {
            tooltip: {
              borderRadius: 3,
              fontWeight: 400,
              fontFamily: FONT_MONO,
              fontSize: '0.75rem',
              padding: '6px 10px',
              backgroundColor: tooltip.bg,
              color: tooltip.fg,
              border: `1px solid ${tooltip.border}`,
            },
            arrow: { color: tooltip.bg },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: {
              borderRadius: 3,
              fontWeight: 700,
              fontFamily: FONT_MONO,
              fontSize: '0.75rem',
              letterSpacing: '0.02em',
              height: 24,
            },
            outlined: {
              borderColor: line.strong,
            },
          },
        },
        MuiListItemButton: {
          styleOverrides: {
            root: {
              borderRadius: 4,
              margin: '2px 8px',
              padding: '8px 12px',
              transition: 'background-color 120ms ease',
              '&.Mui-selected': {
                backgroundColor: glow.soft,
                boxShadow: `inset 3px 0 0 ${brass}`,
                '&:hover': { backgroundColor: glow.medium },
              },
              '&:hover': { backgroundColor: line.hover },
            },
          },
        },
        MuiDrawer: {
          styleOverrides: {
            paper: {
              backgroundColor: surfaces.base,
              borderRight: `1px solid ${line.panel}`,
            },
          },
        },
        MuiAppBar: {
          styleOverrides: {
            root: {
              backgroundColor: surfaces.base,
              borderBottom: `1px solid ${line.panel}`,
              backgroundImage: 'none',
            },
          },
        },
        MuiTextField: {
          styleOverrides: {
            root: {
              // Recessed fields: the input sits *into* the panel.
              '& .MuiOutlinedInput-root': {
                borderRadius: 4,
                backgroundColor: isLight ? '#ffffff' : stone[950],
                boxShadow: isLight ? 'inset 0 1px 2px rgba(18,21,26,0.10)' : 'inset 0 1px 3px rgba(0,0,0,0.6)',
                transition: 'box-shadow 150ms ease',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: line.input },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: line.inputHover },
                '&.Mui-focused': { boxShadow: `0 0 0 3px ${glow.ring}` },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: brass, borderWidth: 2 },
              },
            },
          },
        },
        MuiSelect: {
          styleOverrides: {
            select: {
              // 44px tap targets, no exceptions (DOCS/MOBILE_UI_PLAN.md §2).
              '&.MuiInputBase-inputSizeSmall': {
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                boxSizing: 'border-box',
              },
            },
          },
        },
        MuiAlert: {
          styleOverrides: {
            root: {
              borderRadius: 4,
              fontWeight: 400,
              border: '1px solid',
              borderLeftWidth: 4,
            },
            standardError: {
              backgroundColor: alpha(semantic.error.main, isLight ? 0.07 : 0.10),
              borderColor: alpha(semantic.error.main, 0.45),
              borderLeftColor: semantic.error.main,
            },
            standardSuccess: {
              backgroundColor: alpha(semantic.success.main, isLight ? 0.07 : 0.10),
              borderColor: alpha(semantic.success.main, 0.45),
              borderLeftColor: semantic.success.main,
            },
            standardInfo: {
              backgroundColor: alpha(semantic.info.main, isLight ? 0.07 : 0.08),
              borderColor: alpha(semantic.info.main, 0.45),
              borderLeftColor: semantic.info.main,
            },
            standardWarning: {
              backgroundColor: alpha(semantic.warning.main, isLight ? 0.07 : 0.08),
              borderColor: alpha(semantic.warning.main, 0.45),
              borderLeftColor: semantic.warning.main,
            },
          },
        },
        MuiTabs: {
          styleOverrides: {
            // The indicator is a lit lamp strip under the selected tab.
            indicator: {
              backgroundColor: brass,
              height: 3,
              borderRadius: 2,
              boxShadow: isLight ? 'none' : `0 0 8px ${alpha(brass, 0.6)}`,
            },
          },
        },
        MuiTab: {
          styleOverrides: {
            root: {
              textTransform: 'uppercase',
              fontFamily: FONT_MONO,
              fontWeight: 700,
              letterSpacing: '0.08em',
              fontSize: '0.8125rem',
              minHeight: 48,
              '&.Mui-selected': { color: isLight ? text.primary : brass },
            },
          },
        },
        MuiDivider: {
          styleOverrides: {
            root: { borderColor: line.divider },
          },
        },
        MuiTableCell: {
          styleOverrides: {
            head: {
              fontFamily: FONT_MONO,
              fontWeight: 700,
              fontSize: '0.75rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: text.secondary,
              borderBottom: `2px solid ${line.strong}`,
            },
            root: { borderColor: line.divider },
          },
        },
        MuiBadge: {
          styleOverrides: {
            badge: { fontFamily: FONT_MONO, fontWeight: 700 },
          },
        },
        /**
         * The toggle is a panel switch: a recessed slot, a knurled bat that
         * throws left or right, and the word ON or OFF engraved in the slot —
         * so the state is never colour alone. 44px tall, 64px wide.
         */
        MuiSwitch: {
          styleOverrides: {
            root: {
              width: 68,
              height: 44,
              padding: 8,
            },
            switchBase: {
              padding: 10,
              top: 0,
              left: 0,
              transition: 'transform 160ms cubic-bezier(.3,1.4,.5,1)',
              '&.Mui-checked': {
                transform: 'translateX(24px)',
                color: box.plate.face,
                '& + .MuiSwitch-track': {
                  backgroundColor: isLight ? '#1b6a39' : '#1f5c37',
                  opacity: 1,
                  '&::before': { opacity: 1 },
                  '&::after': { opacity: 0 },
                },
              },
              '&.Mui-disabled + .MuiSwitch-track': { opacity: 0.45 },
              '&.Mui-focusVisible .MuiSwitch-thumb': { boxShadow: `0 0 0 4px ${glow.ring}` },
            },
            thumb: {
              width: 24,
              height: 24,
              borderRadius: 4,
              backgroundColor: box.plate.face,
              backgroundImage: `repeating-linear-gradient(90deg, ${alpha('#000000', 0.18)} 0 1px, transparent 1px 3px), linear-gradient(180deg, ${box.plate.shine}, ${box.plate.edge})`,
              boxShadow: `0 1px 2px ${alpha('#000000', 0.5)}`,
            },
            track: {
              borderRadius: 4,
              opacity: 1,
              backgroundColor: isLight ? '#5d6670' : stone[700],
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.55)',
              position: 'relative',
              // White on the slot fills: 5.83:1 (OFF, day) · 13.29:1 (OFF,
              // night) · 6.63:1 (ON, day) · 7.94:1 (ON, night).
              '&::before, &::after': {
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                fontFamily: FONT_MONO,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: '#ffffff',
                transition: 'opacity 120ms ease',
              },
              '&::before': { content: '"ON"', left: 7, opacity: 0 },
              '&::after': { content: '"OFF"', right: 5, opacity: 1 },
            },
          },
        },
      },
    },
  });
}

// Stray default imports get the night turn, which is BaseGeek's default mode.
export default createBaseGeekTheme('dark');
