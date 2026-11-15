/**
 * twoFingerTap.js — two fingers tapped together on the canvas undo
 * (review 2.12; the gesture GoodNotes and Procreate taught everyone).
 *
 * A tap, not a pinch: exactly two touches, both down within a moment of each
 * other, both up quickly, and neither moved. Nothing is stopped or swallowed —
 * tldraw still sees every touch (a pinch is still a pinch); this only listens.
 *
 * @param {HTMLElement} container
 * @param {() => void} onTap
 * @returns {() => void} detach
 */
export const TAP_MAX_MS = 300;
export const TAP_MAX_MOVE = 12;
const DOWN_GAP_MS = 150;

export function attachTwoFingerTap(container, onTap, { now = () => Date.now() } = {}) {
  let touches = new Map(); // pointerId -> { x, y, t }
  let peak = 0;
  let firstAt = 0;
  let spoiled = false;

  const reset = () => { touches = new Map(); peak = 0; firstAt = 0; spoiled = false; };

  const onDown = (e) => {
    if (e.pointerType !== 'touch') return;
    if (!e.target?.closest?.('.tl-canvas')) return;
    const t = now();
    if (touches.size === 0) { reset(); firstAt = t; }
    if (t - firstAt > DOWN_GAP_MS) spoiled = true;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t });
    peak = Math.max(peak, touches.size);
    if (peak > 2) spoiled = true;
  };
  const onMove = (e) => {
    const s = touches.get(e.pointerId);
    if (!s) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > TAP_MAX_MOVE) spoiled = true;
  };
  const onUp = (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.delete(e.pointerId);
    if (e.type === 'pointercancel') spoiled = true;
    if (touches.size > 0) return;
    const fire = !spoiled && peak === 2 && now() - firstAt <= TAP_MAX_MS;
    reset();
    if (fire) onTap();
  };

  const opts = { capture: true, passive: true };
  container.addEventListener('pointerdown', onDown, opts);
  container.addEventListener('pointermove', onMove, opts);
  container.addEventListener('pointerup', onUp, opts);
  container.addEventListener('pointercancel', onUp, opts);
  return () => {
    container.removeEventListener('pointerdown', onDown, opts);
    container.removeEventListener('pointermove', onMove, opts);
    container.removeEventListener('pointerup', onUp, opts);
    container.removeEventListener('pointercancel', onUp, opts);
  };
}
