import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkTargetProps, readDisplay } from './linkTarget.js'

test('desktop opens apps in a new tab', () => {
  assert.deepEqual(linkTargetProps({ phone: false, standalone: false }), {
    target: '_blank',
    rel: 'noopener noreferrer',
  })
})

test('a phone-sized screen opens in the same tab', () => {
  assert.deepEqual(linkTargetProps({ phone: true }), {})
})

test('installed (standalone) opens in the same tab, even on a wide screen', () => {
  assert.deepEqual(linkTargetProps({ standalone: true }), {})
})

test('readDisplay reads the media queries and iOS navigator.standalone', () => {
  const win = (matches, standalone) => ({
    matchMedia: (q) => ({ matches: matches.includes(q) }),
    navigator: { standalone },
  })
  assert.deepEqual(readDisplay(win(['(max-width: 639px)'])), { phone: true, standalone: false })
  assert.deepEqual(readDisplay(win(['(display-mode: standalone)'])), { phone: false, standalone: true })
  assert.deepEqual(readDisplay(win([], true)), { phone: false, standalone: true })
  assert.deepEqual(readDisplay(undefined), { phone: false, standalone: false })
})
