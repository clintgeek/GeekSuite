// scrim.js — how dark the Photo backdrop's scrim is, from the wallpaper's
// own luminance (CONTEXT.md "Adaptive wallpaper scrim").
//
// 2026-09-05: a clamped linear ramp scales three fixed alphas (top, middle,
// bottom) from 0.75x for a black photo to 1.4x for a white one.
// 2026-11-18 (design review #1): over a near-white photo the top of that
// ramp still left the date, the weather line and "Sign out" at about
// 3.4:1 and 1.5:1. A bright photo now also gets a FLOOR under the top and
// middle stops, so small text in the hero clears 4.5:1 even over white.
// Dark and mid photos keep exactly the alphas they had.

export const BASE = { top: 0.3, mid: 0.34, bottom: 0.62 }
export const SCRIM_MIN = 0.75
export const SCRIM_MAX = 1.4
// The floor starts at luminance FLOOR_FROM and reaches FLOOR_ALPHA by
// FLOOR_FULL. 0.64 is what white wallpaper (after the 0.92 brightness filter)
// needs for --ink-2 to read at 4.5:1 (see scrim.test.js).
export const FLOOR_FROM = 0.5
export const FLOOR_FULL = 0.75
export const FLOOR_ALPHA = 0.64

const clamp01 = (n) => Math.min(1, Math.max(0, n))

export function scrimFactorForLuminance(luminance) {
  return SCRIM_MIN + clamp01(luminance) * (SCRIM_MAX - SCRIM_MIN)
}

/** The floor under the top and middle stops for this luminance. */
export function scrimFloor(luminance) {
  const t = clamp01((luminance - FLOOR_FROM) / (FLOOR_FULL - FLOOR_FROM))
  return t * FLOOR_ALPHA
}

/** The top share of the photo the hero text sits over (rail, clock, weather). */
export const HERO_SHARE = 0.4

/**
 * Average luma (Rec. 601, 0 black .. 1 white) of rows [fromRow, toRow) of an
 * RGBA pixel buffer `width` pixels wide, or null for no pixels.
 */
export function averageLuma(data, width, fromRow = 0, toRow = Infinity) {
  const rows = Math.floor(data.length / 4 / width)
  const start = Math.max(0, fromRow) * width * 4
  const end = Math.min(rows, toRow) * width * 4
  let sum = 0
  let n = 0
  for (let i = start; i < end; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    n += 1
  }
  return n ? sum / n / 255 : null
}

/**
 * The whole photo's luma and its top `HERO_SHARE`'s, from a sampled
 * `size`×`size` RGBA buffer.
 */
export function sampleLuma(data, size) {
  return {
    whole: averageLuma(data, size),
    top: averageLuma(data, size, 0, Math.max(1, Math.round(size * HERO_SHARE))),
  }
}

/**
 * The three scrim alphas for a wallpaper's sampled luminance (0..1), or the
 * fixed originals when it is unknown (null: the probe failed).
 *
 * `topLuminance` is the luma of the part under the hero text. A white sky
 * over a dark landscape averages out mid-grey, which earned no floor while the
 * date sat on white; the floor follows the top (or the whole, if brighter).
 */
export function scrimStops(luminance, topLuminance = luminance) {
  if (luminance == null || !Number.isFinite(luminance)) return { ...BASE }
  const f = scrimFactorForLuminance(luminance)
  const top = Number.isFinite(topLuminance) ? Math.max(topLuminance, luminance) : luminance
  const floor = scrimFloor(top)
  const r = (n) => Math.round(Math.min(0.92, n) * 1000) / 1000
  return {
    top: r(Math.max(BASE.top * f, floor)),
    mid: r(Math.max(BASE.mid * f, floor)),
    bottom: r(Math.max(BASE.bottom * f, floor)),
  }
}

// WCAG contrast, for the tests and anyone tuning the numbers above.
const channel = (c) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
export const relativeLuminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
export function contrast(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** `over` painted at `alpha` on top of `under` (sRGB, as browsers blend). */
export const blend = (under, over, alpha) => under.map((u, i) => u * (1 - alpha) + over[i] * alpha)
