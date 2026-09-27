/**
 * penEraser.js — the S Pen's side button is an eraser (DOCS/HANDWRITING.md §1).
 *
 * tldraw 2.4 already does this for `button === 5`, the eraser end of a
 * Surface or Wacom pen (`Editor.ts`, STYLUS_ERASER_BUTTON): remember the
 * tool, switch to the eraser, restore it when the pen lifts. It does NOT do
 * it for a pen's barrel button, which Android browsers are expected to
 * report as `button === 2` (the same code as a right-click) with `buttons & 2`
 * set. tldraw's canvas turns a button-2 press into `right_click` and draws
 * nothing, and its context menu opens under the pen.
 *
 * So, in a CAPTURE-phase listener on the editor's container, a pen
 * `pointerdown` on the canvas with the barrel (`button 2`, `buttons & 2`) or
 * the eraser bit (`buttons & 32`) held:
 *
 *   1. stops the event before tldraw's own (React, bubble-phase) handler
 *      sees it, so there is no right_click and no context menu;
 *   2. remembers the current tool and switches to `eraser`;
 *   3. dispatches the press to tldraw as a primary pointer_down, which is
 *      what starts an erase — tldraw only starts one on buttons 0, 1 and 5;
 *   4. on that pointer's `pointerup` OR `pointercancel`, dispatches the lift
 *      and restores the tool.
 *
 * Moves are left alone: tldraw's own pointermove handler feeds the eraser.
 *
 * Only `pointerType === 'pen'`. A mouse right-click is never touched and keeps
 * tldraw's context menu. `button === 5` is left to tldraw, which already
 * handles it. A `contextmenu` event from a pen (or straight after a pen
 * press) is swallowed, so the pen never opens tldraw's menu.
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

export function isPenEraserPress(e) {
  if (e.pointerType !== 'pen') return false;
  if (e.button === TLDRAW_ERASER_BUTTON) return false; // tldraw's own
  return e.button === BARREL_BUTTON || (e.buttons & BARREL_BIT) !== 0 || (e.buttons & ERASER_BIT) !== 0;
}

export function attachPenEraser(container, getEditor, { getPointerInfo }) {
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
    if (!isPenEraserPress(e)) return;
    const canvas = e.target?.closest?.('.tl-canvas');
    if (!canvas) return; // the toolbar, a menu: not a stroke
    const editor = getEditor();
    if (!editor || editor.getInstanceState?.().isReadonly) return;

    e.stopPropagation();
    e.preventDefault();

    const restoreToolId = editor.getCurrentToolId();
    editor.complete();
    editor.setCurrentTool('eraser');
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
    // A cancel (the browser took the pointer) ends the stroke the same way a
    // lift does: what the writer saw rubbed out stays rubbed out.
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
