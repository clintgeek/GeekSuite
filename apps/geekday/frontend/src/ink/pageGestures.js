/**
 * pageGestures.js — how the page is moved (DOCS/GEEKDAY_SPEC.md S1, S2).
 *
 *   wheel                  scrolls; with Ctrl / Cmd (and a trackpad pinch,
 *                          which browsers send as Ctrl + wheel) it zooms at
 *                          the pointer; with Shift it scrolls sideways
 *   one finger             pans, when fingers do not draw
 *   two fingers            always pan and pinch
 *   the pen and the mouse  never move the page: they write
 *
 * tldraw's camera stays locked (pageCamera.js), so tldraw itself does none of
 * this and nothing here can fight it. This module only listens: no event is
 * stopped, so tldraw, the lasso, the two-finger tap and the day swipe all
 * still see every touch. Only the wheel's default is prevented (the browser
 * would zoom the whole app on Ctrl + wheel).
 *
 * The hand that writes rests on the glass. A touch that lands while the pen
 * is down, or within PEN_NEAR_MS of the pen being in range, is that hand: it
 * never moves the page, for as long as it stays down. And when the pen
 * touches the glass every finger already down stops moving the page.
 */
import { panCamera, zoomCamera } from './pageCamera';

/** A pen reported (touching or hovering) this recently is still at the page. */
export const PEN_NEAR_MS = 300;
/** A finger must travel this far (CSS px) before it moves the page. */
export const PAN_SLOP_PX = 8;
/** Two fingers must move or spread this far before they do. */
export const PINCH_SLOP_PX = 8;
/** A flick slower than this (px / ms) just stops. */
export const FLICK_MIN_SPEED = 0.25;
/** How quickly a flick dies away (ms). */
export const FLICK_DECAY_MS = 325;
const FLICK_STOP_SPEED = 0.02;
const FLICK_SAMPLE_MS = 100;
const WHEEL_ZOOM_PER_PX = 0.01;
const WHEEL_ZOOM_MAX_PX = 60;
const LINE_PX = 16;

const onSurface = (target) => Boolean(target?.closest?.('.tl-canvas, [data-ink-surface]'));

/**
 * @param {HTMLElement} el  the ink container
 * @param {object} deps
 * @param {() => {x: number, y: number, z: number}} deps.getCamera
 * @param {(camera: {x: number, y: number, z: number}) => void} deps.setCamera
 * @param {() => {left: number, top: number, width: number, height: number}} deps.getViewport
 * @param {() => number} deps.getPageHeight
 * @param {() => boolean} deps.fingerPans  does one finger pan (fingers do not draw)?
 * @returns {() => void} detach
 */
export function attachPageGestures(el, { getCamera, setCamera, getViewport, getPageHeight, fingerPans }, {
  now = () => performance.now(),
  raf = (fn) => requestAnimationFrame(fn),
  caf = (id) => cancelAnimationFrame(id),
} = {}) {
  const win = el.ownerDocument?.defaultView || window;
  const touches = new Map(); // pointerId -> { x, y, palm }
  let penDown = false;
  let lastPenAt = -Infinity;
  /** Two fingers were down in this gesture: the one left may keep moving the page. */
  let latched = false;
  let engaged = false;
  let ref = null; // { x, y, d }: where the gesture was at the last step
  let samples = []; // recent { t, x, y } of a one-finger pan
  let flick = 0;

  const live = () => [...touches.values()].filter((t) => !t.palm);
  const measure = (list) => {
    if (list.length === 1) return { x: list[0].x, y: list[0].y, d: 0 };
    const [a, b] = list;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  /** The fingers changed: whatever happens next starts from where they are now. */
  const rebase = () => {
    const list = live();
    engaged = false;
    samples = [];
    ref = list.length === 1 || list.length === 2 ? measure(list) : null;
  };
  const stopFlick = () => {
    if (flick) caf(flick);
    flick = 0;
  };
  const move = (next) => {
    const before = getCamera();
    if (next.x === before.x && next.y === before.y && next.z === before.z) return false;
    setCamera(next);
    return true;
  };

  const startFlick = () => {
    const recent = samples.filter((s) => s.t >= samples[samples.length - 1].t - FLICK_SAMPLE_MS);
    if (recent.length < 2) return;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = last.t - first.t;
    if (dt <= 0) return;
    let vx = (last.x - first.x) / dt;
    let vy = (last.y - first.y) / dt;
    if (Math.hypot(vx, vy) < FLICK_MIN_SPEED) return;
    let at = now();
    const step = () => {
      flick = 0;
      const t = now();
      const elapsed = Math.min(64, Math.max(1, t - at));
      at = t;
      const moved = move(panCamera(getCamera(), vx * elapsed, vy * elapsed, getViewport(), getPageHeight()));
      const decay = Math.exp(-elapsed / FLICK_DECAY_MS);
      vx *= decay;
      vy *= decay;
      // Against an edge, or slowed to nothing: done.
      if (moved && Math.hypot(vx, vy) > FLICK_STOP_SPEED) flick = raf(step);
    };
    flick = raf(step);
  };

  const onDown = (e) => {
    stopFlick();
    if (e.pointerType === 'pen') {
      penDown = true;
      lastPenAt = now();
      // The writing hand: nothing already on the glass moves the page any more.
      touches.forEach((t) => { t.palm = true; });
      rebase();
      return;
    }
    if (e.pointerType !== 'touch' || !onSurface(e.target)) return;
    const palm = penDown || now() - lastPenAt < PEN_NEAR_MS;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, palm });
    if (live().length >= 2) latched = true;
    rebase();
  };

  const onMove = (e) => {
    if (e.pointerType === 'pen') {
      lastPenAt = now();
      return;
    }
    const touch = touches.get(e.pointerId);
    if (!touch) return;
    touch.x = e.clientX;
    touch.y = e.clientY;
    if (touch.palm || !ref) return;
    const list = live();
    if (list.length === 1 && !(latched || fingerPans())) return;
    const at = measure(list);
    if (!engaged) {
      const slop = list.length === 1 ? PAN_SLOP_PX : PINCH_SLOP_PX;
      if (Math.hypot(at.x - ref.x, at.y - ref.y) < slop && Math.abs(at.d - ref.d) < slop) return;
      // Start from here: the page does not jump by the slop.
      engaged = true;
      ref = at;
      return;
    }
    const camera = getCamera();
    const viewport = getViewport();
    if (list.length === 1) {
      move(panCamera(camera, at.x - ref.x, at.y - ref.y, viewport, getPageHeight()));
      const t = now();
      samples.push({ t, x: at.x, y: at.y });
      if (samples.length > 12) samples.shift();
    } else {
      // Fingers that are nearly touching give a wild ratio: pan only.
      const ratio = ref.d > 24 && at.d > 24 ? at.d / ref.d : 1;
      const origin = { x: viewport.left || 0, y: viewport.top || 0 };
      move(zoomCamera(
        camera,
        camera.z * ratio,
        { x: ref.x - origin.x, y: ref.y - origin.y },
        { x: at.x - origin.x, y: at.y - origin.y },
        viewport,
        getPageHeight(),
      ));
    }
    ref = at;
  };

  const onUp = (e) => {
    if (e.pointerType === 'pen') {
      penDown = false;
      lastPenAt = now();
      return;
    }
    const touch = touches.get(e.pointerId);
    if (!touch) return;
    const wasPanning = !touch.palm && engaged && live().length === 1 && !latched && e.type === 'pointerup';
    const flickFrom = wasPanning ? samples : [];
    touches.delete(e.pointerId);
    rebase();
    if (touches.size === 0) latched = false;
    if (flickFrom.length) {
      samples = flickFrom;
      startFlick();
      samples = [];
    }
  };

  const onWheel = (e) => {
    if (!onSurface(e.target)) return;
    e.preventDefault();
    stopFlick();
    const viewport = getViewport();
    const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? viewport.height || 1 : 1;
    const dx = (e.deltaX || 0) * unit;
    const dy = (e.deltaY || 0) * unit;
    const camera = getCamera();
    if (e.ctrlKey || e.metaKey) {
      const by = Math.max(-WHEEL_ZOOM_MAX_PX, Math.min(WHEEL_ZOOM_MAX_PX, dy));
      const point = { x: e.clientX - (viewport.left || 0), y: e.clientY - (viewport.top || 0) };
      move(zoomCamera(camera, camera.z * Math.exp(-by * WHEEL_ZOOM_PER_PX), point, point, viewport, getPageHeight()));
    } else if (e.shiftKey && !dx) {
      move(panCamera(camera, -dy, 0, viewport, getPageHeight()));
    } else {
      move(panCamera(camera, -dx, -dy, viewport, getPageHeight()));
    }
  };

  const passive = { capture: true, passive: true };
  el.addEventListener('pointerdown', onDown, passive);
  win.addEventListener('pointermove', onMove, passive);
  win.addEventListener('pointerup', onUp, passive);
  win.addEventListener('pointercancel', onUp, passive);
  el.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return () => {
    stopFlick();
    el.removeEventListener('pointerdown', onDown, passive);
    win.removeEventListener('pointermove', onMove, passive);
    win.removeEventListener('pointerup', onUp, passive);
    win.removeEventListener('pointercancel', onUp, passive);
    el.removeEventListener('wheel', onWheel, { capture: true });
  };
}
