// TodoGeek sidebar chrome — Red Pen.
//
// The sidebar is the same paper as the page, separated by a hairline, in both
// modes: no dark spine, no tint. The active row is ink with a red margin bar,
// the pen's mark (DOCS/SIMPLE_PLAN.md § Identity). It used to be an always-dark
// tobacco panel; that belonged to the journal TodoGeek no longer is.
//
// Every ink is a SOLID colour measured against the ground it sits on. The
// `chrome` export is the light set: packages/ui's themeContrast.test.js imports
// it by name and asserts each pair. `chromeFor('dark')` is the night set, held
// to the same pairs by this app's own `__tests__/theme/redPenContrast.test.js`.
import { pen } from './pen';

const build = (p, { active, accentBg }) => ({
  bg:           p.paper,
  bgHover:      p.fill,
  active,                    // selected row ground
  border:       p.rule,      // a rule, never text
  text:         p.ink,       // active row title
  textHover:    p.ink,       // hovered row title
  textMuted:    p.grey,      // inactive row title
  caption:      p.muted,     // row description
  textDisabled: p.muted,     // section label, inert toggle
  accent:       p.red,       // the active bar; the reminders-on toggle
  accentBg,
  danger:       p.red,
  dangerBg:     accentBg,
  logo:         p.ink,       // wordmark
  logoAccent:   p.red,       // the tick in the mark
  divider:      p.rule,
});

export const chrome = build(pen.light, { active: '#EDEDE8', accentBg: 'rgba(200, 32, 42, 0.05)' });
export const chromeDark = build(pen.dark, { active: '#222221', accentBg: 'rgba(232, 82, 80, 0)' });

export const chromeFor = (mode) => (mode === 'dark' ? chromeDark : chrome);

export default chrome;
