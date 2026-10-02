/**
 * ThingGeek theme: "Storage Yard" (2026-10-01, replacing "Moving Day", which
 * replaced "Label Maker").
 *
 * The household's stuff, kept like a self-storage and truck-rental yard:
 * every place a unit behind a roll-up door, everything labelled, accounted
 * for and insured. The feel is the EXPERIENCE of the yard — dusty rental
 * trucks parked in a row, the rental counter's dashboard, roll-up doors on
 * dim storage units under one bulb — and never anybody's brand: no company
 * names, logos or lettering anywhere. It is storage and rental, NOT moving
 * day: no packing workflow, no box markings, no "load the truck".
 *
 * Palette: ORANGE + CARDBOARD + BLACK.
 *   - Black is the livery: the top bar, the tab bar and the sidebar are a
 *     rental truck's black flank with orange stripes (CHROME, both modes —
 *     rendered under a nested chrome theme, components/Chrome.jsx).
 *   - Cardboard (kraft) is the page and the storage bins it holds; a faint
 *     dust and scuff texture rides on it (dustImage), measured under text.
 *   - Yard orange (LIVERY.orange) is the hero: stripes, the Add button,
 *     roll-up doors, warning fills — always with BLACK ink on it. The deeper
 *     burnt orange (LIVERY.burnt) is the only orange that carries white
 *     text (a unit tag's colour strip).
 *   - White is printed matter only: unit tags, the inventory sheet, dialogs
 *     and fields (a form you fill in), the paper labels.
 *   - Night (dark): the dim corridor — charcoal, a darker kraft, the same
 *     orange, and the warm light of the bulb over an open unit (UNIT.glow).
 *
 * Type: Zilla Slab 700 for headings (its italic for fleet lettering: murals
 * and the bar title lean), Public Sans for everything you read, Allerta
 * Stencil for yard stencils only (unit numbers, captions like WHERE —
 * always aria-hidden or doubled by real words), mono for identifiers.
 * Sentence case everywhere but the stencil.
 *
 * Contrast: every pair this app paints is measured in
 * __tests__/theme/storageYardContrast.test.js, both modes, textures included.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';

export const DISPLAY_FONT = '"Zilla Slab", "Rockwell", "Roboto Slab", Georgia, serif';
export const BODY_FONT = '"Public Sans", system-ui, -apple-system, "Segoe UI", "Helvetica", "Arial", sans-serif';
/** Yard stencils only: unit numbers, WHERE / UNIT captions. */
export const STENCIL_FONT = '"Allerta Stencil", "Stencil", "Impact", sans-serif';
export const MONO_FONT = '"Roboto Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

/**
 * desk     the page: kraft by day, the dim corridor by night
 * card     a box face on the desk (sections, lists, cards): lighter kraft / darker kraft
 * paper    printed matter: dialogs, menus, fields, the inventory sheet
 * raised   a pressed-in well (chips, plates, the row thumb)
 */
export const SURFACES = {
  light: {
    desk: '#D2B48A',
    card: '#E6D2AF',
    paper: '#FBF7EF',
    raised: '#DCC59F',
    text: '#16120D',
    secondary: '#44352A',
    muted: '#4A3B2E',
    divider: 'rgba(22, 18, 13, 0.16)',
    border: 'rgba(22, 18, 13, 0.34)',
  },
  dark: {
    desk: '#121110',
    card: '#2A231C',
    paper: '#1F1B17',
    raised: '#362D24',
    text: '#F2E8D8',
    secondary: '#CDBFA8',
    muted: '#B6A78F',
    divider: 'rgba(242, 232, 216, 0.12)',
    border: 'rgba(242, 232, 216, 0.26)',
  },
};

/** The truck's black flank: top bar, tab bar, sidebar — the same in both modes. */
export const CHROME = {
  bar: '#15120F',
  raised: '#241F1A',
  text: '#F4E8D4',
  secondary: '#CDBCA2',
  divider: 'rgba(244, 232, 212, 0.14)',
  border: 'rgba(244, 232, 212, 0.28)',
};

/**
 * Yard orange.
 *   orange  the livery: stripes, the Add button, doors, marker fills (black ink on it)
 *   deep    its pressed/hover shade (still black ink)
 *   burnt   the one orange that carries WHITE text (a unit tag's colour strip)
 *   ink     the black lettering on orange
 */
export const LIVERY = {
  orange: '#F26B1D',
  deep: '#DD5C12',
  burnt: '#A9420A',
  ink: '#140E08',
  white: '#FFFFFF',
};

/** A unit tag: printed white stock (dimmed a touch at night so it doesn't glare). */
export const LABEL = {
  light: { stock: '#FFFDF8', ink: '#16120D', soft: '#4A3B2E', edge: 'rgba(22, 18, 13, 0.30)' },
  dark: { stock: '#EFE6D6', ink: '#16120D', soft: '#4A3B2E', edge: 'rgba(0, 0, 0, 0.55)' },
};

/** Cardboard for the storage-bin plate (its face, side, the hand-hold's shadow). */
export const BOX = {
  light: { face: '#C99A62', side: '#B2834D', flap: '#D7AC76', seam: '#8E6536', hole: '#3B2715', print: '#16120D' },
  dark: { face: '#8A6440', side: '#74532F', flap: '#9A7149', seam: '#4D3720', hole: '#120C07', print: '#120C07' },
};

/**
 * A storage unit: a corrugated roll-up door (orange, like every yard's), and
 * the dim room behind it lit by one bulb. Contents are listed on `interior`.
 */
export const UNIT = {
  light: { door: '#E2651F', groove: '#A9480F', ridge: '#F48A45', frame: '#2A241E', interior: '#17130F', glow: 'rgba(255, 205, 128, 0.20)', text: '#F2E8D8', secondary: '#CDBFA8', divider: 'rgba(242, 232, 216, 0.14)' },
  dark: { door: '#C4561A', groove: '#86380B', ridge: '#D9702F', frame: '#0B0A09', interior: '#0E0C0A', glow: 'rgba(255, 205, 128, 0.16)', text: '#F2E8D8', secondary: '#C9BBA4', divider: 'rgba(242, 232, 216, 0.12)' },
};

/** The bulb over an open unit: a warm accent for dark mode's highlights. */
export const BULB = '#FFD28A';

/**
 * The Attic (DOCS/THINGGEEK_PLAN.md "The Attic"): the household's locked,
 * climate-controlled unit for family documents. Not a roll-up door — a
 * brushed STEEL swing door (panels, seams, rivets, three hinges, a hasp)
 * with the yard's orange PADLOCK on it. Unlocked, the door stands open on
 * the lit interior (UNIT.interior under the BULB). `text`/`secondary` are
 * the stencils and words that sit ON the steel; measured in the contrast test.
 */
export const STEEL = {
  light: { door: '#50575E', panel: '#5B6269', seam: '#2B2F33', rivet: '#A2A9B0', frame: '#1C1F22', text: '#F5F7F8', secondary: '#EBEEF0', sheen: 'rgba(255, 255, 255, 0.10)' },
  dark: { door: '#3B4045', panel: '#444A50', seam: '#1D2023', rivet: '#8F969D', frame: '#0B0C0D', text: '#EEF1F3', secondary: '#D3D8DC', sheen: 'rgba(255, 255, 255, 0.06)' },
};
/** The padlock: yard-orange body, a steel shackle, a black keyhole. Decorative (a glyph: ≥ 3:1 on the door). */
export const PADLOCK = { body: LIVERY.orange, shackle: '#C9CED3', keyhole: LIVERY.ink };

/** Due-date status tones, small text on box faces and paper. */
export const STATUS_TONES = {
  light: { overdue: '#7A140C', soon: '#6E3F00', upcoming: '#1D4874', later: '#44352A' },
  dark: { overdue: '#FF9C8F', soon: '#F5C35A', upcoming: '#93C6EE', later: '#CDBFA8' },
};

/** Marker lights (the attention dot, the dashboard's warning lights): fills with a black ring. */
export const MARKER = { overdue: '#E0312B', soon: '#F5A623', ring: '#16120D' };

/**
 * Dust and scuffs: a faint speckle and a few long streaks over kraft (and
 * the orange livery), as one tiled SVG noise. `speck` is the worst case a
 * letter can land on (its colour at full tile alpha) — the contrast test
 * measures text on the desk under it.
 */
export const DUST = {
  light: { speck: 'rgba(60, 38, 14, 0.10)', streak: 'rgba(255, 245, 225, 0.10)' },
  dark: { speck: 'rgba(255, 228, 190, 0.05)', streak: 'rgba(0, 0, 0, 0.18)' },
};

const rgbaParts = (c) => {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim());
  return { r: Number(r) / 255, g: Number(g) / 255, b: Number(b) / 255, a: Number(a) };
};

/** A tiled noise texture (data URI) for `mode`: speckle + a few scuff streaks. Decorative. */
export function dustImage(mode = 'light') {
  const d = DUST[mode] ?? DUST.light;
  const s = rgbaParts(d.speck);
  const k = rgbaParts(d.streak);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>` +
    `<filter id='s'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='7'/>` +
    `<feColorMatrix values='0 0 0 0 ${s.r.toFixed(3)} 0 0 0 0 ${s.g.toFixed(3)} 0 0 0 0 ${s.b.toFixed(3)} 0 0 0 -3 1.9'/></filter>` +
    `<filter id='k'><feTurbulence type='fractalNoise' baseFrequency='0.012 0.35' numOctaves='1' seed='3'/>` +
    `<feColorMatrix values='0 0 0 0 ${k.r.toFixed(3)} 0 0 0 0 ${k.g.toFixed(3)} 0 0 0 0 ${k.b.toFixed(3)} 0 0 0 -4 2.4'/></filter>` +
    `<rect width='180' height='180' filter='url(#s)' opacity='${s.a}'/>` +
    `<rect width='180' height='180' filter='url(#k)' opacity='${k.a}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * The livery band: three horizontal orange stripes (thick, thin, thinner) —
 * the stripe down a truck's flank. A background layer for the bars' edges.
 * `edge` = 'bottom' (the top bar) or 'top' (the tab bar).
 */
export function liveryBand(edge = 'bottom') {
  const dir = edge === 'top' ? '180deg' : '0deg';
  const o = LIVERY.orange;
  const b = LIVERY.burnt;
  return `linear-gradient(${dir}, ${o} 0 4px, transparent 4px 6px, ${b} 6px 8px, transparent 8px 10px, ${o} 10px 11px, transparent 11px)`;
}
export const LIVERY_BAND_PX = 11;

/**
 * Diagonal speed stripes (CSS): bold orange bands leaning forward, the
 * truck's flank. For heroes, empty states and the bars' trailing corner.
 */
export function speedStripes(angle = 116) {
  const o = LIVERY.orange;
  const b = LIVERY.burnt;
  return `repeating-linear-gradient(${angle}deg, transparent 0 18px, ${o} 18px 32px, transparent 32px 38px, ${b} 38px 44px, transparent 44px 64px)`;
}

/** Deterministic small hash, for unit numbers, murals and tag tilts. */
export function hashString(s = '') {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Ink for MUI's primary: black by day; the livery orange (black text on it) by night. */
export const PRIMARY = {
  light: { main: '#16120D', light: '#3A2E23', dark: '#000000', contrastText: '#F4E8D4' },
  dark: { main: '#FF8236', light: '#FF9A5C', dark: '#F26B1D', contrastText: '#140E08' },
};

/** The Add button (and every hero action): orange, black lettering, a black edge. */
export const HERO = { main: LIVERY.orange, light: '#F5833F', dark: LIVERY.deep, contrastText: LIVERY.ink };

function buildOverrides(mode, chrome) {
  const isDark = mode === 'dark';
  const s = chrome
    ? { desk: CHROME.bar, card: CHROME.raised, paper: CHROME.raised, raised: CHROME.raised, text: CHROME.text, secondary: CHROME.secondary, muted: CHROME.secondary, divider: CHROME.divider, border: CHROME.border }
    : SURFACES[mode];
  const ink = chrome ? PRIMARY.dark : PRIMARY[mode];

  return {
    palette: {
      // Only the surfaces a page paints. The black chrome is NOT one of them:
      // the shared theme walks the focused-label ink across every declared
      // background, and a black one in light mode would bleach it to white.
      background: { default: s.desk, paper: s.paper, card: s.card, raised: s.raised, desk: s.desk },
      text: { primary: s.text, secondary: s.secondary, muted: s.muted },
      divider: s.divider,
      border: s.border,
      // The heavy rule across the top of a bin face or a form: black by day, the livery orange at night.
      rule: { main: chrome || isDark ? LIVERY.orange : SURFACES.light.text },
      hero: HERO,
      livery: LIVERY,
      label: LABEL[mode],
      box: BOX[mode],
      unit: UNIT[mode],
      steel: STEEL[mode],
      marker: MARKER,
      status: STATUS_TONES[chrome ? 'dark' : mode],
      chromeTokens: CHROME,
      // The collection's RangeFacet paints its in-range bars with `phosphor`.
      phosphor: { main: isDark ? '#FF8236' : '#A9420A', glow: isDark ? 'rgba(255, 130, 54, 0.10)' : 'rgba(169, 66, 10, 0.08)' },
    },
    typography: {
      fontFamily: BODY_FONT,
      h1: { fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '0' },
      h2: { fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '0' },
      h3: { fontFamily: DISPLAY_FONT, fontWeight: 700, letterSpacing: '0' },
      h4: { fontFamily: DISPLAY_FONT, fontWeight: 700 },
      h5: { fontFamily: DISPLAY_FONT, fontWeight: 700 },
      h6: { fontFamily: DISPLAY_FONT, fontWeight: 700 },
      button: { fontFamily: BODY_FONT, fontWeight: 700, textTransform: 'none', letterSpacing: '0.01em' },
      overline: { fontSize: '0.8125rem', letterSpacing: '0.01em', fontWeight: 600, lineHeight: 1.5, textTransform: 'none' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: s.desk },
          '::selection': { background: 'rgba(242, 107, 29, 0.35)' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            backgroundColor: s.card,
            border: `1px solid ${s.border}`,
            boxShadow: isDark ? '0 2px 0 rgba(0,0,0,0.5), 0 6px 14px rgba(0,0,0,0.35)' : '0 2px 0 rgba(60,38,14,0.22), 0 4px 10px rgba(60,38,14,0.14)',
          },
        },
      },
      // Fields are printed forms: white stock on kraft, never see-through.
      MuiOutlinedInput: {
        styleOverrides: { root: { backgroundColor: s.paper } },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 4 },
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

/**
 * `chrome: true` builds the black livery theme the bars render under (a
 * nested ThemeProvider, components/Chrome.jsx), in either mode.
 */
export function createThingTheme(mode = 'light', { chrome = false } = {}) {
  const m = mode === 'dark' ? 'dark' : 'light';
  const themeMode = chrome ? 'dark' : m;
  const accent = chrome ? PRIMARY.dark : PRIMARY[m];
  return createGeekSuiteTheme({ mode: themeMode, accent, overrides: buildOverrides(m, chrome) });
}

export default createThingTheme;
