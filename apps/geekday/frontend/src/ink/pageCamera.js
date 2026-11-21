/**
 * pageCamera.js — the day page is a tall sheet of paper, not an infinite canvas.
 *
 * The page is PAGE_WIDTH page units wide whatever the screen, and as tall as
 * it needs to be: at least MIN_SHEETS sheets, and always a whole sheet below
 * the lowest ink. Zoomed all the way out ("fit"), PAGE_WIDTH units span the
 * pane exactly; the page can be zoomed in to MAX_ZOOM_FACTOR times that, never
 * out past it, and never scrolled off any edge. Strokes are stored in page
 * units, so the same day looks the same on another screen and in NoteGeek.
 *
 * tldraw's camera is `{ x, y, z }`: a page point p is drawn at (p + camera) * z
 * from the container's top-left. So the page point at the top-left of the
 * view is (-x, -y), and x and y are never positive here.
 *
 * tldraw's own camera is kept LOCKED (2.4.6: a locked camera ignores wheel,
 * pinch, pan and every zoom call, and a pinch no longer interrupts a stroke).
 * Every move is worked out here, clamped here, and applied with
 * `setCamera(..., { force: true })`; the gestures are in pageGestures.js.
 * All of this file but `setPageCamera` is plain arithmetic.
 */
export const PAGE_WIDTH = 1000;
/** One sheet: @geeksuite/ui's PAPER_PAGE.height (a test holds the two together). */
export const SHEET_HEIGHT = 1400;
/** Decorative ruled lines, in page units. Never stored. */
export const RULE_SPACING = 48;
export const MIN_SHEETS = 3;
/** How far in the page zooms, as a multiple of the fit zoom. */
export const MAX_ZOOM_FACTOR = 3;
/** Past this multiple of the fit zoom the page counts as zoomed in. */
const ZOOMED_FROM = 1.02;

const finite = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** The fit zoom: PAGE_WIDTH page units span `containerWidth` CSS px. */
export function pageZoom(containerWidth) {
  const w = Number(containerWidth);
  return Number.isFinite(w) && w > 0 ? w / PAGE_WIDTH : 1;
}
export const fitZoom = pageZoom;

/**
 * How tall the page is, in page units: whole sheets, at least MIN_SHEETS,
 * with one whole sheet below `inkBottom` (the lowest ink's bottom edge), and
 * never shorter than one screen at the fit zoom.
 */
export function pageHeightFor(inkBottom, viewport = null) {
  const bottom = Math.max(0, finite(inkBottom, 0));
  const forInk = Math.ceil(bottom / SHEET_HEIGHT) + 1;
  const z = pageZoom(viewport?.width);
  const screen = viewport ? Math.max(0, finite(viewport.height, 0)) / z : 0;
  const forScreen = Math.ceil(screen / SHEET_HEIGHT);
  return Math.max(MIN_SHEETS, forInk, forScreen) * SHEET_HEIGHT;
}

/**
 * The nearest camera that keeps the page in its pane.
 *
 * @param {{x: number, y: number, z: number}} camera
 * @param {{width: number, height: number}} viewport  the pane, in CSS px
 * @param {number} pageHeight  page units
 */
export function clampCamera(camera, viewport, pageHeight) {
  const fit = pageZoom(viewport?.width);
  const z = clamp(finite(camera?.z, fit), fit, fit * MAX_ZOOM_FACTOR);
  const viewW = finite(viewport?.width, 0) / z;
  const viewH = finite(viewport?.height, 0) / z;
  const minX = Math.min(0, viewW - PAGE_WIDTH);
  const minY = Math.min(0, viewH - finite(pageHeight, SHEET_HEIGHT * MIN_SHEETS));
  // `+ 0`: never hand tldraw a negative zero.
  return {
    x: clamp(finite(camera?.x, 0), minX, 0) + 0,
    y: clamp(finite(camera?.y, 0), minY, 0) + 0,
    z,
  };
}

/** How a day opens (S3): the top of the page, zoomed out. */
export const topOfPage = (viewport) => ({ x: 0, y: 0, z: pageZoom(viewport?.width) });

/** Is the page zoomed in (so a finger pans it sideways rather than turning the day)? */
export function isZoomedIn(camera, viewport) {
  return finite(camera?.z, 0) > pageZoom(viewport?.width) * ZOOMED_FROM;
}

/** Move the page by a drag of (dx, dy) CSS px. */
export function panCamera(camera, dx, dy, viewport, pageHeight) {
  const z = camera.z || 1;
  return clampCamera({ x: camera.x + dx / z, y: camera.y + dy / z, z }, viewport, pageHeight);
}

/**
 * Zoom to `nextZoom`, keeping the page point that was under `from` (a point
 * in the pane, CSS px from its top-left) under `to`. A pinch passes the
 * fingers' midpoint before and after; a wheel zoom passes the pointer twice.
 */
export function zoomCamera(camera, nextZoom, from, to, viewport, pageHeight) {
  const fit = pageZoom(viewport?.width);
  const z = clamp(finite(nextZoom, camera.z), fit, fit * MAX_ZOOM_FACTOR);
  const anchor = { x: from.x / camera.z - camera.x, y: from.y / camera.z - camera.y };
  return clampCamera({ x: to.x / z - anchor.x, y: to.y / z - anchor.y, z }, viewport, pageHeight);
}

/** Back to the fit zoom, keeping the top of what was on screen. */
export function fitCamera(camera, viewport, pageHeight) {
  return clampCamera({ x: 0, y: camera.y, z: pageZoom(viewport?.width) }, viewport, pageHeight);
}

/**
 * The pane changed size (rotation, split screen, a resized window): keep the
 * page point at the top-left of the view where it was, keep the zoom as the
 * same multiple of the fit zoom, and re-clamp.
 */
export function cameraAfterResize(camera, before, after, pageHeight) {
  const ratio = finite(camera?.z, 0) / pageZoom(before?.width);
  const z = pageZoom(after?.width) * (Number.isFinite(ratio) && ratio > 0 ? ratio : 1);
  return clampCamera({ x: camera.x, y: camera.y, z }, after, pageHeight);
}

/**
 * A client (viewport) point as a page point, for a container with this rect
 * and the camera as it is now. Without a camera: the top of the page at the
 * fit zoom.
 */
export function clientToPage(clientX, clientY, rect, camera = null) {
  const cam = camera || topOfPage(rect);
  const z = cam.z || 1;
  return {
    x: (clientX - (rect?.left || 0)) / z - cam.x,
    y: (clientY - (rect?.top || 0)) / z - cam.y,
  };
}

/** A page box as a box in the pane (CSS px from its top-left). */
export function pageBoxToPane(box, camera) {
  const z = camera?.z || 1;
  return {
    x: (box.x + (camera?.x || 0)) * z,
    y: (box.y + (camera?.y || 0)) * z,
    w: box.w * z,
    h: box.h * z,
  };
}

/**
 * Put tldraw's camera exactly here. The camera stays locked, so nothing in
 * tldraw moves it; `force` is how this does.
 */
export function setPageCamera(editor, camera) {
  if (!editor || editor.isDisposed) return;
  if (!editor.getCameraOptions?.()?.isLocked) editor.setCameraOptions({ isLocked: true, wheelBehavior: 'none' });
  const now = editor.getCamera?.();
  if (now && now.x === camera.x && now.y === camera.y && now.z === camera.z) return;
  editor.setCamera({ x: camera.x, y: camera.y, z: camera.z }, { force: true });
}
