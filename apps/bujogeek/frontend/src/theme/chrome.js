// BuJoGeek sidebar chrome: dark tobacco, warm and grounded. It is the same in
// light and dark app modes, so the sidebar is always a dark anchor.
//
// Every ink here is a SOLID colour. The pre-2026-09-25 palette painted text
// with rgba(255,245,220,α), which is not a colour but a colour plus whatever
// shows through it (GEEK_SUITE_DESIGN_LANGUAGE.md, "Colour on a surface").
// Inactive nav titles at α=0.38 measured 3.34:1. The values below are those
// same inks composited over `bg`, with the dimmest tiers lifted until they
// clear 4.5:1. The brightness order is unchanged: active > hover > inactive
// title > description > caption.
//
// The theme's `text.*` tokens follow the app mode, so they are the wrong ink on
// this ground. Light mode's `text.secondary` measured 2.32:1 as the row
// descriptions. Text on the chrome takes its ink from here.
//
// This file is plain data, so packages/ui's themeContrast.test.js imports it
// and asserts each ink against the grounds it sits on.
import { colors } from './colors';

export const chrome = {
  bg:           '#252018',  // deeper tobacco — more luxurious than before
  bgHover:      '#2E2820',
  active:       '#1E1B14',  // sunken active state
  border:       'rgba(255, 245, 220, 0.07)',   // a rule, never text
  text:         '#DED5BF',  // active row title        11.1:1 on bg (was α 0.85)
  textHover:    '#C2B9A5',  // hovered row title        6.8:1 on bgHover (was α 0.72)
  textMuted:    '#B3AA97',  // inactive row title       7.0:1 on bg (was α 0.38, 3.34:1)
  caption:      '#9D9584',  // row description          4.9:1 on bgHover, the dimmest ground it meets
  textDisabled: '#928B7A',  // section label, inert toggle  4.8:1 on bg (was α 0.5)
  accent:       colors.primary[400],
  accentBg:     'rgba(96, 152, 204, 0.1)',
  danger:       'rgba(184, 60, 52, 0.75)',
  dangerBg:     'rgba(184, 60, 52, 0.08)',
  logo:         '#CFC6B1',  // wordmark "bujo"          9.5:1 on bg (was α 0.78)
  logoAccent:   colors.primary[400],
  divider:      'rgba(255, 245, 220, 0.06)',   // a rule, never text
};

export default chrome;
