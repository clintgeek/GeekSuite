/**
 * GeekDay theme: "Desk Diary".
 *
 * A bound day-to-a-page diary lying open on a desk. The desk is warm and
 * quiet; the page is the brightest thing on it, ruled like a diary page; the
 * date is set large in a serif the way a diary prints it. One colour does the
 * talking — the vermilion of a diary's ribbon marker — and it means "now":
 * today, overdue, the thing to act on. Everything else is ink.
 *
 * Type: Fraunces for the date and the clock (a soft, slightly old-style
 * serif); Public Sans for everything you read or tap.
 *
 * Contrast: every pair painted here is measured in
 * src/__tests__/theme/deskDiaryContrast.test.js, both modes.
 */
import { createGeekSuiteTheme } from '@geeksuite/ui';

export const DISPLAY_FONT = '"Fraunces", "Iowan Old Style", "Palatino Linotype", Georgia, serif';
export const BODY_FONT = '"Public Sans", system-ui, -apple-system, "Segoe UI", "Helvetica", "Arial", sans-serif';

/**
 * desk     the app background, around and behind the diary
 * page     the ink page and the agenda: the diary's paper
 * raised   menus, dialogs, fields
 * rule     the page's ruled lines (decorative; never under text as a fill)
 */
export const SURFACES = {
  light: {
    desk: '#F4EFE6',
    page: '#FFFCF5',
    raised: '#FFFFFF',
    text: '#1B2430',
    secondary: '#4A5563',
    muted: '#5C6675',
    divider: 'rgba(27, 36, 48, 0.14)',
    border: 'rgba(27, 36, 48, 0.30)',
    rule: 'rgba(34, 50, 74, 0.13)',
  },
  dark: {
    desk: '#17191D',
    page: '#1F2228',
    raised: '#282C34',
    text: '#EDE8DD',
    secondary: '#C2BDB1',
    muted: '#AEA99E',
    divider: 'rgba(237, 232, 221, 0.13)',
    border: 'rgba(237, 232, 221, 0.28)',
    rule: 'rgba(237, 232, 221, 0.10)',
  },
};

/** Ink navy: buttons, focus, the selected state. Lighter at night so it reads on the dark page. */
export const INK = {
  light: { main: '#22324A', dark: '#16233A', light: '#3C4F6B', contrastText: '#FFFFFF' },
  dark: { main: '#A9C1E6', dark: '#8BA8D4', light: '#C6D7F0', contrastText: '#10151D' },
};

/** The ribbon marker: today, overdue, "now". Text-safe in each mode on desk and page. */
export const RIBBON = {
  light: { main: '#B23A22', contrastText: '#FFFFFF' },
  dark: { main: '#F0937D', contrastText: '#1A0E0A' },
};

/** The docked clock face: dark in both modes, so a tablet on a stand does not light the room. */
export const DOCK = {
  ground: '#0E1014',
  text: '#EDE8DD',
  secondary: '#B9B4A8',
  ribbon: '#F0937D',
  divider: 'rgba(237, 232, 221, 0.16)',
};

export function createDayTheme(mode = 'light') {
  const themeMode = mode === 'dark' ? 'dark' : 'light';
  const s = SURFACES[themeMode];
  const ink = INK[themeMode];
  const ribbon = RIBBON[themeMode];

  return createGeekSuiteTheme({
    mode: themeMode,
    accent: ink,
    overrides: {
      palette: {
        primary: ink,
        secondary: ribbon,
        error: ribbon,
        background: { default: s.desk, paper: s.raised },
        text: { primary: s.text, secondary: s.secondary, muted: s.muted, disabled: s.muted },
        divider: s.divider,
        day: { ...s, ribbon: ribbon.main, ink: ink.main },
      },
      typography: {
        fontFamily: BODY_FONT,
        h1: { fontFamily: DISPLAY_FONT, fontWeight: 600, letterSpacing: '-0.02em' },
        h2: { fontFamily: DISPLAY_FONT, fontWeight: 600, letterSpacing: '-0.015em' },
        h3: { fontFamily: DISPLAY_FONT, fontWeight: 600 },
        button: { fontFamily: BODY_FONT, fontWeight: 600, textTransform: 'none' },
      },
      shape: { borderRadius: 10 },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            'html, body, #root': { height: '100%' },
            body: {
              backgroundColor: s.desk,
              color: s.text,
              // The page is one screen: the browser must not rubber-band or pull-to-refresh over the ink.
              overscrollBehavior: 'none',
            },
          },
        },
        MuiTooltip: { defaultProps: { enterTouchDelay: 600 } },
      },
    },
  });
}

export default createDayTheme;
