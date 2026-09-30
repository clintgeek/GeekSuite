/**
 * ThingGeek theme: "Label Maker".
 *
 * The household's inventory, dressed like the shelves it lives on: kraft
 * cardboard for the desk and the chrome (storage boxes, shipping cartons),
 * off-white card stock for the sheets you read, and — the signature — Dymo
 * embossed tape (components/DymoTape.jsx) for the names of places, page
 * titles and section headings, on coloured refills that mean something
 * (TAPE_TONES). A corrugated edge on the bars and packing tape on the odd
 * card finish the carton. By night it is the same workbench under a lamp: a
 * charcoal-brown shelf.
 *
 * One accent, SAFETY ORANGE, for "needs attention" and the screen's one
 * primary action. It is only ever a FILL with dark ink on it — never orange
 * text on kraft. Everything else is ink: MUI's `primary` is the tape-black
 * ink (card stock in the dark), so links, focus, selected chips and the
 * everyday contained button are ink, and nothing orange leaks into text.
 *
 * Fonts: Barlow Condensed for tape and headings (a condensed, label-ish
 * grotesque), Barlow for body copy, mono for identifiers so a serial reads
 * character by character. Headings are sentence case; only tape is
 * uppercase and letterspaced (the DOM keeps sentence case).
 *
 * Contrast: every pair this app paints is measured in
 * __tests__/theme/labelMakerContrast.test.js, both modes.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';

export const DISPLAY_FONT = '"Barlow Condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif';
export const BODY_FONT = '"Barlow", system-ui, -apple-system, "Segoe UI", "Helvetica", "Arial", sans-serif';
export const TAPE_FONT = DISPLAY_FONT;
export const MONO_FONT = '"Roboto Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

/** Kraft fibre on the desk: two faint crossed hatchings (AppMain paints it). */
export const fibreImage = (f) => `repeating-linear-gradient(115deg, ${f} 0 1px, transparent 1px 7px), repeating-linear-gradient(25deg, ${f} 0 1px, transparent 1px 11px)`;

/**
 * desk     the page behind everything (kraft by day, the dark shelf by night)
 * chrome   top bar, tab bar, sidebar: a deeper kraft, the carton's side
 * paper    card stock: sheets, dialogs, menus, the library list
 * card     a card stock card on the desk
 * raised   a pressed-in well on card stock (chips, badges, inputs)
 */
export const SURFACES = {
  light: {
    desk: '#D9BD94',
    chrome: '#C9A574',
    paper: '#FBF7EE',
    card: '#FDFAF3',
    raised: '#F1E7D3',
    text: '#22190F',
    secondary: '#4B3B28',
    muted: '#54432F',
    divider: 'rgba(34, 25, 15, 0.14)',
    border: 'rgba(34, 25, 15, 0.26)',
    fibre: 'rgba(90, 60, 25, 0.04)',
  },
  dark: {
    desk: '#1C1611',
    chrome: '#261E17',
    paper: '#2A231B',
    card: '#2F271E',
    raised: '#3A3026',
    text: '#F3E9D8',
    secondary: '#D2C3AA',
    muted: '#B9A88D',
    divider: 'rgba(243, 233, 216, 0.12)',
    border: 'rgba(243, 233, 216, 0.24)',
    fibre: 'rgba(0, 0, 0, 0.12)',
  },
};

/** Ink: MUI's primary. Tape black by day, card stock by night. Never orange. */
export const INK = {
  light: { main: '#2A1F14', light: '#4B3B28', dark: '#140E08', contrastText: '#FBF7EE' },
  dark: { main: '#EBDDC4', light: '#F6ECDB', dark: '#D2C3AA', contrastText: '#1C1611' },
};

/** Safety orange: a FILL, with dark ink on it. Attention and the primary action. */
export const SAFETY = {
  light: { main: '#F26A1B', light: '#F5853F', dark: '#D95A10', contrastText: '#1B1006' },
  dark: { main: '#FF7A29', light: '#FF9350', dark: '#E8681A', contrastText: '#1B1006' },
};

/**
 * Dymo tape. The same black plastic in both modes (it's a physical thing);
 * in the dark it gets a faint edge so it lifts off the shelf.
 *   ground  the tape's body (the darkest band of its sheen)
 *   top     the lightest band of the sheen (worst case for the letters)
 *   ink     the raised letters
 */
export const TAPE = {
  ground: '#121110',
  top: '#34312D',
  ink: '#F4F1EA',
  edgeLight: 'rgba(0, 0, 0, 0.35)',
  edgeDark: 'rgba(255, 255, 255, 0.16)',
};

/**
 * Refill cartridges. Each tone is one roll of tape, the same in both modes:
 *   black   locations (and the default): House, Garage, Shelf 2
 *   blue    containers: the van, the safe, the tackle box
 *   red     attention: Overdue
 *   green   done: a checked step, "All clear"
 *   orange  the one primary action, as tape (safety orange; DARK letters —
 *           orange is a fill, never an ink)
 * `top` is the lightest band of the sheen and `mid`/`ground`/`low` the rest;
 * the letters are measured against `top` (the worst case) in
 * __tests__/theme/labelMakerContrast.test.js.
 */
export const TAPE_TONES = {
  black: { top: TAPE.top, mid: '#1F1D1B', ground: TAPE.ground, low: '#24211E', ink: TAPE.ink },
  blue: { top: '#2F5E9A', mid: '#1B477F', ground: '#123A6C', low: '#1A4476', ink: TAPE.ink },
  red: { top: '#A62A20', mid: '#8E1C15', ground: '#7A150F', low: '#861A13', ink: TAPE.ink },
  green: { top: '#2F6A39', mid: '#22552B', ground: '#1A4722', low: '#1F4F28', ink: TAPE.ink },
  orange: { top: '#F7904C', mid: '#F2741F', ground: '#E8661A', low: '#EE6E1D', ink: '#1B1006' },
};

/** Tape tone for a place, by its kind: containers are on blue refill, everything else black. */
export const toneForKind = (kind) => (kind === 'container' ? 'blue' : 'black');

/**
 * Corrugated cardboard, seen edge-on where a carton was cut: a row of
 * flutes between two liners. Painted along the bottom of the top bar and the
 * top of the tab bar (a background image, so it never takes a tap or covers
 * a word). `flute` is the kraft, `hollow` the shadow inside each arch.
 */
export const CORRUGATION = {
  light: { flute: '#B38C57', hollow: '#8E6A3C', liner: '#A57E4B' },
  dark: { flute: '#3B3026', hollow: '#120E0A', liner: '#2F261D' },
};
export function corrugatedEdge(mode = 'light') {
  const c = CORRUGATION[mode] ?? CORRUGATION.light;
  // 8×6 tile: liner, one flute arch, liner. Symmetric enough to serve both edges.
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='8' height='6' viewBox='0 0 8 6'>` +
    `<rect width='8' height='6' fill='${c.hollow}'/>` +
    `<path d='M0 5 C1.5 5 1.5 1 4 1 C6.5 1 6.5 5 8 5' fill='none' stroke='${c.flute}' stroke-width='1.3'/>` +
    `<rect y='0' width='8' height='0.9' fill='${c.liner}'/><rect y='5.1' width='8' height='0.9' fill='${c.liner}'/>` +
    `</svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return url;
}

/** Clear packing tape: a translucent tan strip with a faint sheen (components/PackingTape.jsx). */
export const PACKING = {
  light: { body: 'rgba(222, 196, 146, 0.62)', sheen: 'rgba(255, 255, 255, 0.35)', edge: 'rgba(120, 90, 45, 0.28)' },
  dark: { body: 'rgba(214, 186, 132, 0.30)', sheen: 'rgba(255, 255, 255, 0.10)', edge: 'rgba(0, 0, 0, 0.40)' },
};

/**
 * Due-date status tones, used as small text and dots on card stock (paper,
 * card, raised). DueLine still passes them through readableOn.
 */
export const STATUS_TONES = {
  light: { overdue: '#A8241A', soon: '#7F4A00', upcoming: '#1F557D', later: '#4B3B28' },
  dark: { overdue: '#F4978E', soon: '#F2B45A', upcoming: '#8CC3EC', later: '#D2C3AA' },
};

/** The ground behind a thing with no photo: a kraft tint with the type's glyph. */
export const PLATE = {
  light: { ground: '#EADAB9', rule: 'rgba(90, 60, 25, 0.10)', icon: '#5A4630' },
  dark: { ground: '#3A3026', rule: 'rgba(243, 233, 216, 0.06)', icon: '#CDB894' },
};

function buildOverrides(mode) {
  const isDark = mode === 'dark';
  const s = SURFACES[mode];
  const ink = INK[mode];

  return {
    palette: {
      background: { default: s.desk, paper: s.paper, card: s.card, raised: s.raised, chrome: s.chrome, desk: s.desk },
      text: { primary: s.text, secondary: s.secondary, muted: s.muted },
      divider: s.divider,
      border: s.border,
      safety: SAFETY[mode],
      tape: TAPE,
      tapeTones: TAPE_TONES,
      packing: PACKING[mode],
      status: STATUS_TONES[mode],
      // The collection's RangeFacet paints its in-range bars with `phosphor`.
      phosphor: { main: isDark ? '#CDB894' : '#7A5B34', glow: isDark ? 'rgba(235, 221, 196, 0.08)' : 'rgba(42, 31, 20, 0.06)' },
      plate: PLATE[mode],
      fibre: s.fibre,
      // Kept for any old reader: the "hardware" colour is now kraft-dark.
      brass: isDark ? '#CDB894' : '#7A5B34',
    },
    typography: {
      fontFamily: BODY_FONT,
      h1: { fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '0' },
      h2: { fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '0' },
      h3: { fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '0.005em' },
      h4: { fontFamily: DISPLAY_FONT, fontWeight: 700 },
      h5: { fontFamily: DISPLAY_FONT, fontWeight: 700 },
      h6: { fontFamily: DISPLAY_FONT, fontWeight: 700 },
      button: { fontFamily: BODY_FONT, fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em' },
      // Sentence case everywhere: uppercase belongs to the tape alone.
      overline: { fontSize: '0.8125rem', letterSpacing: '0.01em', fontWeight: 600, lineHeight: 1.5, textTransform: 'none' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: s.desk },
          '::selection': { background: isDark ? 'rgba(255, 122, 41, 0.35)' : 'rgba(242, 106, 27, 0.30)' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            backgroundColor: s.card,
            border: `1px solid ${s.divider}`,
            boxShadow: isDark ? '0 1px 0 rgba(255,255,255,0.03) inset, 0 4px 12px rgba(0,0,0,0.35)' : '0 1px 0 rgba(255,255,255,0.6) inset, 0 2px 6px rgba(60,40,15,0.12)',
          },
        },
      },
      // Fields are card stock on the kraft desk, never see-through.
      MuiOutlinedInput: {
        styleOverrides: { root: { backgroundColor: s.paper } },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 6 },
          containedPrimary: { boxShadow: 'none' },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: { '&.Mui-selected': { color: s.text } },
        },
      },
      MuiLink: {
        styleOverrides: { root: { color: ink.main, textUnderlineOffset: '0.18em' } },
      },
    },
  };
}

export function createThingTheme(mode = 'light') {
  return createGeekSuiteTheme({ mode, accent: INK[mode === 'dark' ? 'dark' : 'light'], overrides: buildOverrides(mode) });
}

export default createThingTheme;
