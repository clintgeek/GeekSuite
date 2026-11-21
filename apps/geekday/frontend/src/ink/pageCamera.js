/**
 * pageCamera.js — the day page is a sheet of paper, not an infinite canvas.
 *
 * The page is PAGE_WIDTH page units wide whatever the screen: the camera is
 * locked at x 0, y 0 with zoom = container width / PAGE_WIDTH, so page x
 * 0..1000 spans the container and page y 0 is its top edge. Strokes are stored
 * in page units, so the same day looks the same on another screen width and
 * in NoteGeek.
 */
export const PAGE_WIDTH = 1000;
/** Decorative ruled lines, in page units. Never stored. */
export const RULE_SPACING = 48;

/** The camera zoom that makes PAGE_WIDTH page units span `containerWidth` CSS px. */
export function pageZoom(containerWidth) {
  const w = Number(containerWidth);
  return Number.isFinite(w) && w > 0 ? w / PAGE_WIDTH : 1;
}

/** A client (viewport) point as a page point, for a container with this rect. */
export function clientToPage(clientX, clientY, rect) {
  const z = pageZoom(rect?.width);
  return { x: (clientX - (rect?.left || 0)) / z, y: (clientY - (rect?.top || 0)) / z };
}

/**
 * Lock the camera to the page. tldraw 2.4.6: a locked camera ignores wheel,
 * pinch, pan and every zoom call; only `setCamera(..., { force: true })` moves
 * it, which is how the zoom follows the container's width.
 */
export function lockPageCamera(editor, containerWidth) {
  if (!editor || editor.isDisposed) return;
  editor.setCameraOptions({ isLocked: true, wheelBehavior: 'none' });
  editor.setCamera({ x: 0, y: 0, z: pageZoom(containerWidth) }, { force: true });
}
