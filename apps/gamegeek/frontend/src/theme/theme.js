/**
 * GameGeek theme: "Arcade Sticker" (DOCS/GameGeekPlan.md §5.1).
 *
 * Neo-brutalist arcade: thick ink outlines, HARD offset shadows (no blur),
 * cards that lift and tilt, shelves as rotated stickers, and a chunky
 * display face (Bungee) on the wordmark and h1–h3. It is BookGeek's opposite
 * in structure, not just in colour — BookGeek is hairlines, soft shadows and
 * a serif; this is 2px ink and stickers.
 *
 * "Wild but readable" — the contrast rules this palette is built on:
 *   - The loud colours (magenta, cyan, lime, violet, orange…) are FILLS with
 *     INK text on them in both modes. Every one clears 6:1 against the ink
 *     (#0C0A12), so a 12px label on a filled sticker/chip passes against the
 *     fill itself — the 12px filled-chip landmine is solved by the pairing,
 *     not by readableOn (which only knows about the surface under the chip).
 *   - Dark mode's magenta (#FF3DA8) is text-safe on every dark surface
 *     (5.34:1 on the card, 4.83:1 on the raised surface, its lowest) and is
 *     primary.main.
 *   - Light mode cannot use any neon as text (magenta is ~3:1 on cream, lime
 *     and cyan ~1.1:1). Its primary.main steps down to a deep magenta
 *     (#B8005F, ≥5.7:1 on every cream surface, white label as a fill). The
 *     loud colours survive in light mode as fills, outlines and graphics.
 *   - Anything painted as text from a domain colour still goes through
 *     readableOn at the call site, against the surface it lands on.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';

/** Bungee has one weight (400); never ask it for bold — the synthetic one smears. */
export const DISPLAY_FONT = '"Bungee", "Space Grotesk", "Roboto", system-ui, sans-serif';
export const DISPLAY_WEIGHT = 400;
export const HEADING_FONT = '"Space Grotesk", "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif';
export const BODY_FONT = '"Roboto", system-ui, -apple-system, "Segoe UI", "Helvetica", "Arial", sans-serif';
export const MONO_FONT = '"Roboto Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';

/** The arcade colours. Mode-independent: a sticker is the same sticker on any table. */
export const ARCADE = {
  ink: '#0C0A12',
  paperInk: '#F6F1FF',
  magenta: '#FF3DA8',
  cyan: '#22E4FF',
  lime: '#D7FF3D',
  violet: '#B89CFF',
  orange: '#FF8A3D',
  coral: '#FF6B5A',
  mint: '#3DFFA0',
  yellow: '#FFE03D',
};

/** The shadow a card casts, keyed by title so a grid reads as a set of colours. */
export const POP_COLOURS = [ARCADE.magenta, ARCADE.cyan, ARCADE.lime, ARCADE.violet, ARCADE.orange];

const magentaDark = { main: '#FF3DA8', light: '#FF6FC0', dark: '#E0208C', contrastText: ARCADE.ink };
const magentaLight = { main: '#B8005F', light: '#D6006F', dark: '#8F004A', contrastText: '#FFFFFF' };

export const SURFACES = {
  dark: {
    page: '#0C0A12',
    paper: '#17131F',
    card: '#1D1829',
    raised: '#262036',
    text: '#F6F1FF',
    secondary: '#C9C0DD',
    muted: '#A89FC2',
    divider: 'rgba(201, 192, 221, 0.18)',
    // Outlines: the structural line every card, pill and checkbox is drawn in.
    line: '#8E83B3',
    // What a hard shadow is cast in when it is not a colour.
    shadow: '#000000',
  },
  light: {
    page: '#FFF1D0',
    paper: '#FFFBF0',
    card: '#FFFDF7',
    raised: '#FFF4DC',
    text: '#14111A',
    secondary: '#3F3849',
    muted: '#5A5266',
    divider: 'rgba(20, 17, 26, 0.16)',
    line: '#14111A',
    shadow: '#14111A',
  },
};

/**
 * Shelf identity colours — sticker FILLS, with ink text on every one of them
 * (the lowest, magenta, is 6.07:1). The same in both modes. Anything that
 * paints one as text still goes through readableOn at the call site.
 */
const SHELF_FILLS = {
  playing: ARCADE.lime,
  backlog: ARCADE.cyan,
  finished: ARCADE.mint,
  'on-hold': ARCADE.violet,
  abandoned: ARCADE.coral,
  wishlist: ARCADE.magenta,
  unshelved: '#CFC8DE',
  custom: ARCADE.yellow,
};

/** A hard offset shadow: no blur, ever. */
export const hardShadow = (x, colour) => `${x}px ${x}px 0 0 ${colour}`;

function buildOverrides(mode) {
  const isDark = mode === 'dark';
  const s = SURFACES[mode];
  const ink = ARCADE.ink;
  const pressable = {
    transition: 'transform 90ms ease-out, box-shadow 90ms ease-out, background-color 120ms',
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  };

  return {
    palette: {
      background: { default: s.page, paper: s.paper, card: s.card, raised: s.raised },
      text: { primary: s.text, secondary: s.secondary, muted: s.muted },
      divider: s.divider,
      // The shared collection UI outlines its pills, checkboxes and chips in
      // `border`. Pointing it at the arcade line gives every one of them the
      // ink outline without touching the package.
      border: s.line,
      shelf: SHELF_FILLS,
      arcade: { ...ARCADE, line: s.line, shadow: s.shadow },
      // Graphics only (the progress bar, the plate rule). Not text.
      phosphor: {
        main: isDark ? ARCADE.lime : ARCADE.magenta,
        glow: isDark ? 'rgba(255, 61, 168, 0.14)' : 'rgba(255, 61, 168, 0.12)',
      },
      // Stars are graphics: lime reads on near-black; on cream the lime would
      // vanish, so light mode's stars are the loud magenta.
      star: isDark ? ARCADE.lime : '#E0007A',
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: BODY_FONT,
      h1: { fontFamily: DISPLAY_FONT, fontWeight: DISPLAY_WEIGHT, letterSpacing: '0.01em', lineHeight: 1.1 },
      h2: { fontFamily: DISPLAY_FONT, fontWeight: DISPLAY_WEIGHT, letterSpacing: '0.01em', lineHeight: 1.15 },
      h3: { fontFamily: DISPLAY_FONT, fontWeight: DISPLAY_WEIGHT, letterSpacing: '0.01em', lineHeight: 1.2 },
      h4: { fontFamily: HEADING_FONT, fontWeight: 700 },
      h5: { fontFamily: HEADING_FONT, fontWeight: 700 },
      h6: { fontFamily: HEADING_FONT, fontWeight: 700 },
      overline: { fontSize: '0.75rem', letterSpacing: '0.08em', fontWeight: 700, lineHeight: 1.6 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            fontFeatureSettings: '"tnum" 0',
            // A faint arcade-carpet dot grid on the page ground.
            backgroundImage: `radial-gradient(${isDark ? 'rgba(201,192,221,0.07)' : 'rgba(20,17,26,0.07)'} 1px, transparent 1.5px)`,
            backgroundSize: '22px 22px',
          },
          '::selection': { background: ARCADE.lime, color: ink },

          /* ── The shared @geeksuite/collection UI, skinned from here ──────
           * These selectors only exist in GameGeek's stylesheet (this is
           * GameGeek's CssBaseline), so BookGeek and ThingGeek never see
           * them. They key off the package's own data attributes. */

          // Filter checkboxes / radios: 2px ink boxes; checked is a lime
          // sticker with an ink tick and a hard shadow.
          '[data-facet-option] > div[aria-hidden="true"]': {
            borderWidth: '2px !important',
            borderRadius: '4px',
          },
          '[data-facet-option][data-empty="true"] > div[aria-hidden="true"]': { borderColor: `${s.divider} !important` },
          '[data-facet-option] > input:checked + div[aria-hidden="true"]': {
            backgroundColor: ARCADE.lime,
            borderColor: `${isDark ? ARCADE.lime : ink} !important`,
            color: ink,
            boxShadow: hardShadow(2, isDark ? ARCADE.magenta : ink),
            '& > div': { backgroundColor: ink },
          },
          '[data-facet-option] > input[type="radio"] + div[aria-hidden="true"]': { borderRadius: '50%' },

          // Section headings: arcade caps.
          '[data-facet] > h3 button > span:first-of-type': { textTransform: 'uppercase', letterSpacing: '0.04em' },
          // The active-count pill (the heading's second span; never the
          // ButtonBase's TouchRipple, which is also a span).
          '[data-facet] > h3 button > span:not(:first-of-type):not(.MuiTouchRipple-root)': {
            color: `${ink} !important`,
            backgroundColor: `${ARCADE.lime} !important`,
            boxShadow: `inset 0 0 0 1.5px ${ink} !important`,
            borderRadius: '4px !important',
          },

          // Active filter chips: cyan stickers with ink text, tilted a hair.
          '[data-testid="active-chips"] > li > button > span:not(.MuiTouchRipple-root)': {
            backgroundColor: `${ARCADE.cyan} !important`,
            borderColor: `${ink} !important`,
            borderWidth: '2px !important',
            borderRadius: '6px !important',
            boxShadow: hardShadow(2, isDark ? ARCADE.paperInk : ink),
            '& > span, & > svg': { color: `${ink} !important` },
          },
          '[data-testid="active-chips"] > li:nth-of-type(odd) > button > span:not(.MuiTouchRipple-root)': { transform: 'rotate(-1.5deg)' },
          '[data-testid="active-chips"] > li:nth-of-type(even) > button > span:not(.MuiTouchRipple-root)': { transform: 'rotate(1.2deg)' },

          // The shell's GeekFab paints an MUI elevation shadow in its own sx;
          // two selectors outrank it. Hard shadow, collapsing on press.
          '.MuiFab-root[data-geek-fab]': {
            border: `2px solid ${ink}`,
            boxShadow: hardShadow(4, isDark ? ARCADE.paperInk : ink),
            '&:active': { boxShadow: hardShadow(1, isDark ? ARCADE.paperInk : ink) },
          },

          // The filter panel's sticky header sits on the page ground.
          '[data-testid="filter-panel"]': { borderRightWidth: '2px !important', borderColor: `${s.line} !important` },
          '[data-testid="filter-panel"] > div:first-of-type': { borderBottomWidth: '2px !important', borderColor: `${s.line} !important` },
          '[data-testid="filter-panel"] h2': { textTransform: 'uppercase' },

        },
      },
      MuiAppBar: {
        styleOverrides: { root: { borderBottom: `2px solid ${s.line}` } },
      },
      MuiDrawer: {
        styleOverrides: {
          paperAnchorLeft: { borderRight: `2px solid ${s.line}` },
          paperAnchorBottom: { borderTop: `2px solid ${s.line}` },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            backgroundColor: s.card,
            border: `2px solid ${s.line}`,
            boxShadow: hardShadow(4, s.shadow),
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 8, fontWeight: 700 },
          // The arcade button: loud fill, ink label, ink outline, a hard
          // shadow that collapses as the button goes down.
          contained: {
            ...pressable,
            border: `2px solid ${ink}`,
            boxShadow: hardShadow(3, isDark ? ARCADE.paperInk : ink),
            '&:hover': { boxShadow: hardShadow(3, isDark ? ARCADE.paperInk : ink) },
            '@media (hover: hover) and (prefers-reduced-motion: no-preference)': {
              '&:hover': { transform: 'translate(-1px, -1px)', boxShadow: hardShadow(4, isDark ? ARCADE.paperInk : ink) },
            },
            '&:active': { transform: 'translate(3px, 3px)', boxShadow: hardShadow(0, ink) },
            '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
            '&.Mui-disabled': { borderColor: s.divider, boxShadow: 'none' },
          },
          containedPrimary: {
            backgroundColor: ARCADE.magenta,
            color: ink,
            '&:hover, &:active': { backgroundColor: '#FF5CB6' },
          },
          outlined: {
            ...pressable,
            borderWidth: 2,
            borderColor: s.line,
            '&:hover': { borderWidth: 2 },
            '&:active': { transform: 'translate(1px, 1px)' },
            '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
          },
        },
      },
      MuiFab: {
        styleOverrides: {
          root: {
            border: `2px solid ${ink}`,
            boxShadow: hardShadow(4, isDark ? ARCADE.paperInk : ink),
            '&:active': { boxShadow: hardShadow(1, isDark ? ARCADE.paperInk : ink) },
          },
          primary: { backgroundColor: ARCADE.magenta, color: ink, '&:hover': { backgroundColor: '#FF5CB6' } },
        },
      },
      MuiToggleButton: {
        styleOverrides: { root: { borderWidth: 2 } },
      },
      MuiChip: {
        styleOverrides: { root: { borderRadius: 6, fontWeight: 700 }, outlined: { borderWidth: 2, borderColor: s.line } },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { border: `2px solid ${s.line}`, boxShadow: hardShadow(6, isDark ? ARCADE.magenta : ink), borderRadius: 12 },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: { border: `2px solid ${s.line} !important`, boxShadow: `${hardShadow(4, isDark ? ARCADE.cyan : ink)} !important`, borderRadius: 10 },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: { '&.Mui-selected': { backgroundColor: isDark ? 'rgba(215,255,61,0.12)' : 'rgba(255,61,168,0.12)' } },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: ink, color: ARCADE.paperInk, border: `2px solid ${isDark ? ARCADE.cyan : ink}`, borderRadius: 6, fontWeight: 700 },
          arrow: { color: isDark ? ARCADE.cyan : ink },
        },
      },
      MuiLinearProgress: {
        styleOverrides: { bar: { backgroundColor: isDark ? ARCADE.lime : ARCADE.magenta } },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            // Selection is painted by the call site (the sidebar's lime
            // sticker); keep the suite's accent-on-tint ink out of it.
            '&.Mui-selected': { color: s.text },
          },
        },
      },
    },
  };
}

export function createGameTheme(mode = 'dark') {
  const accent = mode === 'dark' ? magentaDark : magentaLight;
  return createGeekSuiteTheme({ mode, accent, overrides: buildOverrides(mode) });
}

export default createGameTheme;
