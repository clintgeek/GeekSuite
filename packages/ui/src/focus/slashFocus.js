/**
 * Slash focus — `/` puts the cursor in the most important text box on the page.
 *
 * One document-level keydown listener for the whole app (ref-counted, so
 * `GeekShell` and a standalone `useSlashFocus()` can both ask for it without
 * doubling up). Pages opt elements in with an attribute instead of wiring
 * refs up to a global:
 *
 *   data-geek-slash-focus          → a candidate, priority 10
 *   data-geek-slash-focus="30"     → a candidate, priority 30 (higher wins)
 *   data-geek-slash-select="false" → do not select existing text on focus
 *                                    (capture/composition boxes)
 *
 * The attribute can sit on the input itself or on a wrapper (a MUI TextField
 * root, a top-bar search slot); a wrapper resolves to its first visible,
 * enabled input/textarea/contenteditable.
 *
 * Rules, in the order they are checked:
 *   - only a bare `/` (Shift is allowed — some layouts need it for `/`;
 *     Ctrl/Meta/Alt are not), never mid-IME-composition, never an event
 *     somebody already handled (`defaultPrevented`);
 *   - never when the keystroke is going into something editable — an input,
 *     textarea, select, contenteditable, or anything inside role=textbox /
 *     role=combobox — so a `/` typed in a field, an editor's slash-commands
 *     or a code editor is never hijacked;
 *   - a candidate must be visible, enabled, and not inside an
 *     `aria-hidden="true"` or `inert` subtree. That last rule is what makes an
 *     open MUI dialog win: MUI aria-hides everything behind the modal, so the
 *     background candidates drop out and a marked input inside the dialog is
 *     the only one left. A dialog with no marked input → nothing happens, and
 *     the `/` is left alone;
 *   - highest priority wins; ties go to the first in DOM order.
 *
 * Search boxes get their text selected so typing replaces the query.
 */

export const SLASH_FOCUS_ATTR = 'data-geek-slash-focus';
export const SLASH_SELECT_ATTR = 'data-geek-slash-select';
export const DEFAULT_SLASH_PRIORITY = 10;

const EDITABLE_ANCESTOR =
  '[role="textbox"], [role="combobox"], [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
const FOCUSABLE_TEXT =
  'input:not([type="hidden"]), textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

/**
 * Attribute props for a candidate. `slashFocusProps(30, { select: false })`.
 * `priority === false` returns `{}` (opted out).
 */
export function slashFocusProps(priority = DEFAULT_SLASH_PRIORITY, { select = true } = {}) {
  if (priority === false || priority == null) return {};
  const props = { [SLASH_FOCUS_ATTR]: String(priority === true ? DEFAULT_SLASH_PRIORITY : priority) };
  if (!select) props[SLASH_SELECT_ATTR] = 'false';
  return props;
}

/** True when a keystroke landing on `el` is typing into something. */
export function isEditableTarget(el) {
  if (!el || typeof el !== 'object' || el.nodeType !== 1) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest?.(EDITABLE_ANCESTOR));
}

function priorityOf(el) {
  const raw = el.getAttribute(SLASH_FOCUS_ATTR);
  if (raw === null || raw.trim() === '') return DEFAULT_SLASH_PRIORITY;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_SLASH_PRIORITY;
}

function noLayoutEngine() {
  // jsdom has no layout: every element reports zero client rects. Only there
  // do we skip the "has a box" check.
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
}

function isVisible(el) {
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
  }
  const view = el.ownerDocument?.defaultView;
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    if (node.hidden) return false;
    const style = view?.getComputedStyle?.(node);
    if (style && style.display === 'none') return false;
    if (node === el && style && (style.visibility === 'hidden' || style.visibility === 'collapse')) {
      return false;
    }
  }
  if (noLayoutEngine()) return true;
  return el.getClientRects().length > 0;
}

function isEnabled(el) {
  if (el.disabled) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  if (el.closest?.('fieldset[disabled]')) return false;
  return true;
}

function isReachable(el) {
  return !el.closest('[aria-hidden="true"], [inert]');
}

function usable(el) {
  return isReachable(el) && isEnabled(el) && isVisible(el);
}

/** The element a candidate actually focuses: itself, or its first usable text control. */
function resolveTarget(candidate) {
  if (candidate.matches(FOCUSABLE_TEXT)) return usable(candidate) ? candidate : null;
  if (!isReachable(candidate)) return null;
  for (const inner of candidate.querySelectorAll(FOCUSABLE_TEXT)) {
    if (usable(inner)) return inner;
  }
  return null;
}

/**
 * The best candidate under `root`, or null.
 * Returns `{ candidate, target, priority }` so callers can read the marker.
 */
export function findSlashFocusTarget(root = typeof document !== 'undefined' ? document : null) {
  if (!root) return null;
  let best = null;
  for (const candidate of root.querySelectorAll(`[${SLASH_FOCUS_ATTR}]`)) {
    const priority = priorityOf(candidate);
    if (best && priority <= best.priority) continue; // ties: first in DOM order
    const target = resolveTarget(candidate);
    if (target) best = { candidate, target, priority };
  }
  return best;
}

function wantsSelect(candidate, target) {
  if (candidate.getAttribute(SLASH_SELECT_ATTR) === 'false') return false;
  if (target.getAttribute(SLASH_SELECT_ATTR) === 'false') return false;
  return typeof target.select === 'function' && Boolean(target.value);
}

/** Focuses the best candidate. Returns the focused element, or null. */
export function focusSlashTarget(root) {
  const found = findSlashFocusTarget(root);
  if (!found) return null;
  const { candidate, target } = found;
  target.focus({ preventScroll: false });
  if (wantsSelect(candidate, target)) {
    try {
      target.select();
    } catch {
      // Some input types (number, email in older engines) refuse select().
    }
  }
  return target;
}

/** True when this keydown should be treated as the slash shortcut. */
export function isSlashFocusEvent(event) {
  if (!event || event.key !== '/') return false;
  if (event.defaultPrevented) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.isComposing || event.keyCode === 229) return false;
  const origin = event.composedPath?.()[0] ?? event.target;
  if (isEditableTarget(origin)) return false;
  return true;
}

/** The keydown handler itself. Returns true when it moved focus. */
export function handleSlashKeydown(event) {
  if (!isSlashFocusEvent(event)) return false;
  const doc = event.target?.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  const found = findSlashFocusTarget(doc);
  if (!found) return false; // nothing to go to: leave the keystroke alone
  event.preventDefault();
  focusSlashTarget(doc);
  return true;
}

const installs = new WeakMap();

/**
 * Installs the listener on `doc` (once, however many callers ask).
 * Returns the matching uninstall.
 */
export function installSlashFocus(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return () => {};
  const count = installs.get(doc) ?? 0;
  if (count === 0) doc.addEventListener('keydown', handleSlashKeydown);
  installs.set(doc, count + 1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const next = (installs.get(doc) ?? 1) - 1;
    if (next <= 0) {
      doc.removeEventListener('keydown', handleSlashKeydown);
      installs.delete(doc);
    } else {
      installs.set(doc, next);
    }
  };
}
