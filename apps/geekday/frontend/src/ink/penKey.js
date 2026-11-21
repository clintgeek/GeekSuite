// Copied from apps/notegeek/frontend/src/utils/penKey.js (GeekDay keeps its own copy; apps do not import each other).
/**
 * penKey.js — a pen button that arrives as a KEY, not a pointer button.
 *
 * The Lenovo pen (Chef's tablet, 2026-11-16): the tablet keeps a held button
 * for its own menu, but a DOUBLE-CLICK of the button reaches the page as a
 * `keydown` whose `key` is "Unidentified". There is no matching "held"
 * state, so it cannot be "erase while held" (penButton.js). It is UNDO
 * (Chef, 2026-11-16): one action, no mode to be left in by accident — the
 * same as the two-finger tap. (It switched pen <-> eraser for an hour.)
 *
 * "Unidentified" is also what Android's on-screen keyboard sends for every
 * character (keyCode 229, composing), so it only fires when nobody
 * is typing: no composition, not keyCode 229, no text field or editable
 * focused, and tldraw is not editing a text shape.
 */
export const PEN_KEY = 'Unidentified';
const IME_KEYCODE = 229;
const REPEAT_GUARD_MS = 250;

function typing(doc) {
  const el = doc?.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/** Is this keydown the pen's button (and not a keyboard)? */
export function isPenKey(e, doc = globalThis.document) {
  if (e.key !== PEN_KEY) return false;
  if (e.code) return false; // the pen's key has no code (Chef's pen-lab report, 2026-11-16)
  if (e.repeat || e.isComposing || e.keyCode === IME_KEYCODE) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return !typing(doc);
}

/**
 * @param {Window} win
 * @param {() => object|null} getEditor  the live tldraw editor, or null
 * @returns {() => void} detach
 */
export function attachPenKey(win, getEditor, { now = () => Date.now() } = {}) {
  if (!win) return () => {};
  let last = 0;
  const onKeyDown = (e) => {
    if (!isPenKey(e, win.document)) return;
    const editor = getEditor();
    if (!editor || editor.getInstanceState?.().isReadonly) return;
    if (editor.getEditingShapeId?.()) return; // typing into a text shape
    const t = now();
    if (t - last < REPEAT_GUARD_MS) return;
    last = t;
    e.preventDefault();
    editor.complete?.(); // a stroke in progress ends first, so it is what gets undone
    editor.undo();
  };
  win.addEventListener('keydown', onKeyDown, true);
  return () => win.removeEventListener('keydown', onKeyDown, true);
}
