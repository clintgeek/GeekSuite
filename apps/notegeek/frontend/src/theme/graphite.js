/**
 * Graphite — NoteGeek's palette, as data.
 *
 * Pencil on pale grey-green engineering paper. The ink is graphite, a warm
 * dark grey, never pure black. There is ONE accent, a highlighter yellow, and
 * it is only ever a FILL behind ink: the text selection, search-hit marks, the
 * active nav row and filter, and the primary action. It is never text on
 * paper (it measures ~1.2:1 there). At night the paper is slate, the ink is
 * light graphite, and the highlighter is still a fill, with dark ink on it.
 *
 * Every text/ground pair below is measured in
 * src/__tests__/theme/graphiteContrast.test.js, in both modes. Add a token →
 * add its pairs there.
 *
 *   desk     the page ground (background.default), gridded from `md` up
 *   paper    chrome: top bar, sidebar, tab bar, menus (background.paper)
 *   sheet    the writing sheet and the capture box (surfaces.elevated)
 *   ink      body text and titles              (text.primary)
 *   ink2     metadata, previews, labels        (text.secondary)
 *   muted    third tier (placeholder-ish copy) (text.muted)
 *   disabled inert controls only               (text.disabled, 2.5:1 floor)
 *   hl       the highlighter fill; `onHl` is the ink set on it
 *   hlSoft   a lighter pass of the highlighter (hover, selection wash); ink only
 *   error    the one loud colour: a failed save, offline with unsaved edits
 *   errorFill  the ground of the loud save status
 *   rule     hairlines between rows (divider)
 *   border   control outlines (≥3:1 is NOT claimed; borders are decoration,
 *            every bordered control also has a label)
 *   lead     a softer graphite for graphics: type icons, mind-map edges
 *   grid     the engineering-paper grid lines (decoration, never under copy
 *            that needs the contrast)
 */
export const graphite = {
  light: {
    desk: '#E9EEE7',
    paper: '#F1F4EF',
    sheet: '#F8FAF6',
    ink: '#2F2E2B',
    ink2: '#55544F',
    muted: '#5E5D57',
    disabled: '#87867F',
    hl: '#F5DF4D',
    hlSoft: '#F8EDA0',
    onHl: '#2F2E2B',
    error: '#A8261D',
    errorFill: '#F6E1DD',
    rule: '#D3DAD0',
    border: '#B9C3B6',
    lead: '#5B625D',
    grid: 'rgba(76, 122, 94, 0.11)',
    primary: { main: '#3A3936', light: '#5A5955', dark: '#242321', contrastText: '#F8FAF6' },
  },
  dark: {
    desk: '#15181A',
    paper: '#1B1F22',
    sheet: '#212629',
    ink: '#E6E3DC',
    ink2: '#ACAEA8',
    muted: '#A2A59F',
    disabled: '#7C807B',
    hl: '#E2C94A',
    hlSoft: '#4A4424',
    onHl: '#1A1C1D',
    error: '#F0A197',
    errorFill: '#3A2523',
    rule: '#2E3438',
    border: '#454D52',
    lead: '#9DA4A0',
    grid: 'rgba(170, 205, 185, 0.055)',
    primary: { main: '#D6D3CB', light: '#E6E3DC', dark: '#B5B2AA', contrastText: '#15181A' },
  },
};

/** The palette for a theme (or a mode string), light by default. */
export function graphiteOf(themeOrMode) {
  const mode = typeof themeOrMode === 'string' ? themeOrMode : themeOrMode?.palette?.mode;
  return graphite[mode === 'dark' ? 'dark' : 'light'];
}

// Two faces, both self-hosted (src/main.jsx). Spline Sans carries titles,
// headings and body; Spline Sans Mono is for small metadata only (dates,
// counts, code) and is never uppercased.
export const SANS = '"Spline Sans Variable", "Spline Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const MONO = '"Spline Sans Mono Variable", "Spline Sans Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';
