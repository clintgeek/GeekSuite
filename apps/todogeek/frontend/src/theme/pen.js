/**
 * Red Pen — TodoGeek's palette (DOCS/SIMPLE_PLAN.md § Identity: "Red Pen").
 *
 * Black ink on white paper and one red pen for crossing things off. Three
 * colours and a ramp of greys; nothing else. Every text ink here is a SOLID
 * colour, measured against every ground it can land on (WCAG 2 relative
 * luminance, the same formula as MUI's getContrastRatio):
 *
 *   light                                  night
 *   ink    #121212  18.1 paper              ink    #EDEDE8  15.7 paper
 *   grey   #5C5C58   6.3 paper, 6.0 fill   grey   #A3A39D   7.3 paper, 6.2 fill
 *   muted  #686864   5.2 paper, 5.0 fill   muted  #9C9C96   6.7 paper, 6.0 fill
 *   red    #C8202A   5.5 paper, 5.1 fill,  red    #E85250   5.0 paper, 4.5 fill,
 *                    5.7 surface                             4.7 surface
 *   on red #FFFFFF   5.7                    on red #141413   5.1
 *
 * The night red is the day red lightened only as far as AA on the night fill
 * needs (#C8202A measures 3.2:1 on #141413).
 *
 * `fill` is the one tint the app paints behind text: a hovered row, a chip, the
 * inline editor's ground. Every ink above clears 4.5:1 on it, 12px included.
 * `rule` is a hairline and never text.
 *
 * Plain data, so the contrast tests can import it without a theme.
 */
export const pen = {
  light: {
    paper: '#FBFBF8',   // background.default — the page
    surface: '#FFFFFF', // background.paper — menus, sheets, toasts
    fill: '#F3F3EF',    // hover / chip / editor ground
    rule: '#E3E3DE',    // hairlines, never text
    ink: '#121212',
    grey: '#5C5C58',    // secondary: times, "tomorrow", counts
    muted: '#686864',   // tertiary: tags, done words, captions
    faint: '#8E8E89',   // disabled only (a 2.5:1 perceptibility floor, never copy)
    box: '#6E6E69',     // the empty checkbox outline (3:1 graphic)
    red: '#C8202A',
    onRed: '#FFFFFF',
  },
  dark: {
    paper: '#141413',
    surface: '#1C1C1B',
    fill: '#1F1F1E',
    rule: '#2C2C2A',
    ink: '#EDEDE8',
    grey: '#A3A39D',
    muted: '#9C9C96',
    faint: '#6F6F6A',
    box: '#8A8A85',
    red: '#E85250',
    onRed: '#141413',
  },
};

/** The ink set for a theme mode ('light' | 'dark'). */
export const penFor = (mode) => (mode === 'dark' ? pen.dark : pen.light);

/** Read the ink set off a built MUI theme (`theme.palette.pen`). */
export const penOf = (theme) => theme?.palette?.pen || penFor(theme?.palette?.mode);

export const PEN_FONT = '"Inter Tight", system-ui, -apple-system, "Segoe UI", sans-serif';

export default pen;
