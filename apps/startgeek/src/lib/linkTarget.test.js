import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkTargetProps, openLink, readDisplay } from './linkTarget.js'

function fakeWindow() {
  const calls = []
  return {
    calls,
    open: (...args) => calls.push(['open', ...args]),
    location: { assign: (url) => calls.push(['assign', url]) },
  }
}

test('Enter on a result opens a new tab on the desktop', () => {
  const win = fakeWindow()
  openLink('https://notegeek.clintgeek.com/notes/1', { phone: false, standalone: false }, win)
  assert.deepEqual(win.calls, [['open', 'https://notegeek.clintgeek.com/notes/1', '_blank', 'noopener,noreferrer']])
})

test('Enter on a result stays in the same tab on a phone, and when installed', () => {
  for (const display of [{ phone: true }, { standalone: true }]) {
    const win = fakeWindow()
    openLink('https://todogeek.clintgeek.com/', display, win)
    assert.deepEqual(win.calls, [['assign', 'https://todogeek.clintgeek.com/']])
  }
})

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
