import { test } from 'node:test'
import assert from 'node:assert/strict'
import { showShortcutChips } from './shortcutChips.js'

const base = { phone: true, focused: true, userFocused: true, value: '', signedIn: true }

test('a phone box the person tapped, empty and signed in, shows the chips', () => {
  assert.equal(showShortcutChips(base), true)
})

test('focus the page gave on load is not enough: no chips over the modules', () => {
  assert.equal(showShortcutChips({ ...base, userFocused: false }), false)
})

test('no chips on a desktop, with text in the box, unfocused, or signed out', () => {
  assert.equal(showShortcutChips({ ...base, phone: false }), false)
  assert.equal(showShortcutChips({ ...base, value: '> ' }), false)
  assert.equal(showShortcutChips({ ...base, focused: false }), false)
  assert.equal(showShortcutChips({ ...base, signedIn: false }), false)
})
