/**
 * Where bujogeek's domain inks get their legibility.
 *
 * The aging palette (`colors.aging.*`), the priority reds and the signifier
 * violet are identity, not decoration: a task that is four days late is a
 * particular shade of red, and that shade is the point. But those hues were
 * authored as *borders* — 2.5px of solid colour against the page — and then
 * reused as 12px monospace text, where they measure 2.4–4.1:1 against a 4.5
 * floor (the 2026-09-05 a11y burn-down; 20 of bujogeek's 28 findings).
 *
 * `toneForMode` was the first answer and it guessed: a fixed 35% lift in dark,
 * a fixed 30% darken in light, with no idea what surface the text landed on.
 * `readableOn` measures instead — it composites the ink over the ground, walks
 * it away in 2.5% steps until it clears AA, and hands back the original hue
 * untouched when it already does. The hue survives; only the value moves.
 *
 * The one thing `readableOn` needs and cannot know is the ground. A due badge
 * does not sit on the page: it sits on a row's aging tint, inside the amber
 * "carried forward" panel, on the parchment canvas — three layers, all of them
 * measured by axe and none of them `background.default`. So rather than thread
 * a surface through every call site, this module names the *least forgiving*
 * ground an ink can land on in each mode and tunes against that. Anything that
 * clears AA there clears it everywhere in the app.
 *
 *   light  #F4EAE2 — overdue row tint over the carried-forward panel over the
 *                    parchment canvas (axe measured #F6EDE6; this is a shade
 *                    deeper, for slack)
 *   dark   #3D2C22 — the same two tints over the page (axe measured #39281F).
 *                    Tints *lighten* a dark ground, which is the direction
 *                    that costs a light ink its contrast.
 */
import { readableOn } from '@geeksuite/ui';

const GROUND = {
  light: '#F4EAE2',
  dark:  '#3D2C22',
};

/**
 * The chip tint is a ground of its own: a 6% cream wash (dark) or `ink[100]`
 * (light) painted *on top of* the row tint above. In dark that lands around
 * #48382D, where the secondary text token measures 4.3:1 — the last three
 * findings of the burn-down.
 */
const CHIP_GROUND = {
  light: '#EDEAE4',
  dark:  '#48382D',
};

/** The worst ground a domain ink lands on in this theme's mode. */
export const groundFor = (theme) => GROUND[theme?.palette?.mode] || GROUND.light;

/** A label painted on a chip tint rather than on the page. */
export const chipInk = (color, theme, options) =>
  readableOn(color, CHIP_GROUND[theme?.palette?.mode] || CHIP_GROUND.light, options);

/**
 * A domain colour, tuned so it clears AA as text anywhere in the app.
 *
 * @param {string} color   an aging / priority / signifier ink
 * @param {object} theme   the MUI theme (its mode picks the ground)
 * @param {{min?: number}} [options] `min` defaults to 4.5. Pass 3 for a
 *                         non-text graphic or genuinely large text.
 */
export const domainInk = (color, theme, options) =>
  readableOn(color, groundFor(theme), options);

export default domainInk;
