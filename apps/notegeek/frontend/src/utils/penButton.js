/**
 * penButton.js — what a pen's buttons do on the sketch canvas
 * (DOCS/HANDWRITING.md §1).
 *
 * - **The S Pen side button scrolls.** Hold it and drag to move around the
 *   page (tldraw's `hand` tool); let go and the pen is back. Chef, 2026-09-29:
 *   "Button on the S-pen should let me scroll. That's way more useful." It
 *   was the eraser until then.
 * - **An eraser end still erases.** A pen that reports its rubber end with the
 *   eraser bit (`buttons & 32`) gets the eraser for that stroke. `button === 5`
 *   (Surface/Wacom eraser end) is tldraw's own and is left alone.
 *
 * Android browsers are expected to report the side button as `button === 2`
 * (the same code as a right-click) with `buttons & 2` set. tldraw's canvas
 * turns a button-2 press into `right_click`, does nothing with it, and opens
 * its context menu under the pen. So, in a CAPTURE-phase listener on the
 * editor's container, a pen `pointerdown` on the canvas with the side button
 * or the eraser bit held:
 *
 *   1. stops the event before tldraw's own (React, bubble-phase) handler
 *      sees it, so there is no right_click and no context menu;
 *   2. remembers the current tool and switches to `hand` (side button) or
 *      `eraser` (eraser bit);
 *   3. dispatches the press to tldraw as a primary pointer_down, which is
 *      what starts a pan or an erase (tldraw starts those on buttons 0, 1, 5);
 *   4. on that pointer's `pointerup` OR `pointercancel`, dispatches the lift
 *      and restores the tool.
 *
 * Moves are left alone: tldraw's own pointermove handler feeds the tool.
 *
 * Only `pointerType === 'pen'`. A mouse right-click is never touched and keeps
 * tldraw's context menu. A `contextmenu` event from a pen (or straight after
 * a pen press) is swallowed, so the pen never opens tldraw's menu.
 *
 * @param {HTMLElement} container  the element wrapping <Tldraw>
 * @param {() => object|null} getEditor  the live tldraw editor, or null
 * @param {object} deps
 * @param {Function} deps.getPointerInfo  tldraw's getPointerInfo
 * @returns {() => void} detach
 */
export const BARREL_BUTTON = 2;
export const TLDRAW_ERASER_BUTTON = 5;
const BARREL_BIT = 2;
const ERASER_BIT = 32;

/** The tool a pen press should borrow, or null to leave the press alone. */
export function penButtonTool(e) {
  if (e.pointerType !== 'pen') return null;
  if (e.button === TLDRAW_ERASER_BUTTON) return null; // tldraw's own
  if ((e.buttons & ERASER_BIT) !== 0) return 'eraser';
  if (e.button === BARREL_BUTTON || (e.buttons & BARREL_BIT) !== 0) return 'hand';
  return null;
}

export function attachPenButton(container, getEditor, { getPointerInfo }) {
  let active = null; // { pointerId, restoreToolId, canvas }
  let lastPointerType = null;

  const info = (e, button) => ({
    type: 'pointer',
    target: 'canvas',
    ...getPointerInfo(e),
    button,
  });

  const onPointerDown = (e) => {
    lastPointerType = e.pointerType || null;
    const tool = penButtonTool(e);
    if (!tool) return;
    const canvas = e.target?.closest?.('.tl-canvas');
    if (!canvas) return; // the toolbar, a menu: not a stroke
    const editor = getEditor();
    if (!editor || editor.getInstanceState?.().isReadonly) return;

    e.stopPropagation();
    e.preventDefault();

    const restoreToolId = editor.getCurrentToolId();
    editor.complete();
    editor.setCurrentTool(tool);
    active = { pointerId: e.pointerId, restoreToolId, canvas };
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* not capturable: fine */ }
    editor.dispatch({ ...info(e, 0), name: 'pointer_down' });
  };

  const finish = (e) => {
    if (!active || e.pointerId !== active.pointerId) return;
    const { restoreToolId, canvas } = active;
    active = null;
    e.stopPropagation();
    const editor = getEditor();
    try { canvas.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
    if (!editor) return;
    // A cancel (the browser took the pointer) ends it the same way a lift
    // does: what the writer saw rubbed out stays rubbed out, a pan stays put.
    editor.dispatch({ ...info(e, 0), name: 'pointer_up' });
    editor.complete();
    editor.setCurrentTool(restoreToolId);
  };

  const onContextMenu = (e) => {
    const fromPen = e.pointerType === 'pen' || (!e.pointerType && lastPointerType === 'pen') || active;
    if (!fromPen) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const opts = { capture: true };
  container.addEventListener('pointerdown', onPointerDown, opts);
  container.addEventListener('pointerup', finish, opts);
  container.addEventListener('pointercancel', finish, opts);
  container.addEventListener('contextmenu', onContextMenu, opts);
  return () => {
    container.removeEventListener('pointerdown', onPointerDown, opts);
    container.removeEventListener('pointerup', finish, opts);
    container.removeEventListener('pointercancel', finish, opts);
    container.removeEventListener('contextmenu', onContextMenu, opts);
  };
}
