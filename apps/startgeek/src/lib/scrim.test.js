import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BASE, blend, contrast, scrimStops } from './scrim.js'

const SCRIM = [10, 13, 18]
const INK = [0xe9, 0xed, 0xf2]
const INK_2 = [0xcf, 0xdf, 0xef]
// The wallpaper layer is drawn with brightness(0.92): white becomes 235.
const WHITE_PHOTO = [235, 235, 235]

test('over a white photo, small hero text in --ink-2 clears 4.5:1 at the top and middle', () => {
  const s = scrimStops(1)
  for (const alpha of [s.top, s.mid]) {
    const ground = blend(WHITE_PHOTO, SCRIM, alpha)
    assert.ok(contrast(INK_2, ground) >= 4.5, `ink-2 at alpha ${alpha}: ${contrast(INK_2, ground).toFixed(2)}`)
    assert.ok(contrast(INK, ground) >= 4.5)
  }
})

test('a bright photo (luminance 0.8) gets the same floor', () => {
  const s = scrimStops(0.8)
  const ground = blend(WHITE_PHOTO, SCRIM, s.top)
  assert.ok(contrast(INK_2, ground) >= 4.5)
})

test('dark and mid photos keep the alphas they had', () => {
  assert.deepEqual(scrimStops(0), { top: 0.225, mid: 0.255, bottom: 0.465 })
  const mid = scrimStops(0.4)
  assert.ok(Math.abs(mid.top - BASE.top * (0.75 + 0.4 * 0.65)) < 0.001)
})

test('an unknown luminance is the original fixed scrim', () => {
  assert.deepEqual(scrimStops(null), BASE)
  assert.deepEqual(scrimStops(Number.NaN), BASE)
})

test('the scrim never goes fully opaque', () => {
  const s = scrimStops(1)
  assert.ok(s.bottom <= 0.92)
})
