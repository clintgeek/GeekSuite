import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isEditableTarget, slashFocusAction } from './slashFocus.js'

/** A minimal element: tagName plus an optional editable ancestor. */
const el = (tagName, { editable = false, inTextbox = false } = {}) => ({
  nodeType: 1,
  tagName,
  isContentEditable: editable,
  closest: () => (inTextbox ? {} : null),
})
const key = (overrides = {}) => ({ key: '/', target: el('BODY'), ...overrides })

test('a bare "/" on the page focuses the box', () => {
  assert.equal(slashFocusAction(key()), 'focus')
  assert.equal(slashFocusAction(key({ shiftKey: true })), 'focus')
})

test('"/" typed into an editable target is left alone', () => {
  for (const target of [
    el('INPUT'),
    el('TEXTAREA'),
    el('SELECT'),
    el('DIV', { editable: true }),
    el('SPAN', { inTextbox: true }),
  ]) {
    assert.equal(slashFocusAction(key({ target })), null, target.tagName)
    assert.equal(isEditableTarget(target), true)
  }
})

test('modifiers, IME composition and handled events are left alone', () => {
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'isComposing', 'defaultPrevented']) {
    assert.equal(slashFocusAction(key({ [mod]: true })), null, mod)
  }
  assert.equal(slashFocusAction(key({ keyCode: 229 })), null)
})

test('other keys are ignored', () => {
  assert.equal(slashFocusAction(key({ key: '?' })), null)
})

test('help modal: "/" closes it and goes to the box; any other modal keeps it', () => {
  assert.equal(slashFocusAction(key(), { helpOpen: true }), 'close-help')
  assert.equal(slashFocusAction(key(), { otherModalOpen: true }), null)
})
