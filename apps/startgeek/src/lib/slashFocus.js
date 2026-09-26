/**
 * `/` focuses the command box — StartGeek's own copy of the suite rule.
 *
 * The rest of GeekSuite gets this from `@geeksuite/ui` (focus/slashFocus.js);
 * StartGeek has no dependency on that package by design, and it has exactly
 * one box that matters, so this is the small version: the same guards, no
 * candidate ranking.
 *
 *   - only a bare `/` (Shift allowed — some layouts need it; Ctrl/Meta/Alt
 *     not), never mid-IME-composition, never an event already handled;
 *   - never when the keystroke is going into something editable (input,
 *     textarea, select, contenteditable, anything inside role=textbox /
 *     role=combobox);
 *   - the help modal is the command box's own help, so `/` from there closes
 *     it and goes to the box (what it always did). Any *other* open modal
 *     (settings, weather) keeps the keystroke: the box is behind it.
 *
 * Pure, so `node --test` can pin it without a DOM.
 */

const EDITABLE_ANCESTOR =
  '[role="textbox"], [role="combobox"], [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'

export function isEditableTarget(el) {
  if (!el || typeof el !== 'object' || el.nodeType !== 1) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return Boolean(el.closest?.(EDITABLE_ANCESTOR))
}

export function isSlashFocusEvent(event) {
  if (!event || event.key !== '/') return false
  if (event.defaultPrevented) return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (event.isComposing || event.keyCode === 229) return false
  return !isEditableTarget(event.target)
}

/**
 * What a keydown should do: 'focus', 'close-help', or null (leave it alone).
 * `otherModalOpen` is true when a modal other than the help modal is open.
 */
export function slashFocusAction(event, { helpOpen = false, otherModalOpen = false } = {}) {
  if (!isSlashFocusEvent(event)) return null
  if (otherModalOpen) return null
  return helpOpen ? 'close-help' : 'focus'
}
