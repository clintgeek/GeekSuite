import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BASE, FLOOR_FROM, averageLuma, blend, contrast, sampleLuma, scrimStops } from './scrim.js'

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

test('a white sky over a dark landscape gets the floor where the hero text sits', () => {
  // 32×32 sample: top 40% white, the rest near-black. The whole averages
  // mid-grey, which on its own earns no floor.
  const size = 32
  const data = new Uint8ClampedArray(size * size * 4)
  for (let row = 0; row < size; row += 1) {
    const v = row < size * 0.4 ? 255 : 20
    for (let col = 0; col < size; col += 1) data.set([v, v, v, 255], (row * size + col) * 4)
  }
  const { whole, top } = sampleLuma(data, size)
  assert.ok(whole < FLOOR_FROM, `whole ${whole}`)
  assert.equal(top, 1)
  const s = scrimStops(whole, top)
  const ground = blend(WHITE_PHOTO, SCRIM, s.top)
  assert.ok(contrast(INK_2, ground) >= 4.5, `ink-2 over the sky: ${contrast(INK_2, ground).toFixed(2)}`)
})

test('averageLuma reads only the rows asked for', () => {
  const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])
  assert.equal(averageLuma(data, 1, 0, 1), 1)
  assert.equal(averageLuma(data, 1, 1, 2), 0)
  assert.equal(averageLuma(data, 1), 0.5)
  assert.equal(averageLuma(new Uint8ClampedArray(0), 1), null)
})

test('the scrim never goes fully opaque', () => {
  const s = scrimStops(1)
  assert.ok(s.bottom <= 0.92)
})
