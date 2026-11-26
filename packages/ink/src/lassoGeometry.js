/**
 * lassoGeometry.js — which strokes a circled loop encloses.
 *
 * Pure: no tldraw, no DOM. Everything is in PAGE coordinates (the units the
 * strokes are stored in), so the answer does not depend on the screen.
 *
 * A point is `{ x, y }`. A polygon is an array of points, closed implicitly
 * (last joins first). A sample is `{ id, points }`: one shape and the page
 * points that stand for it.
 */

/** A shape counts as circled when at least this share of its points is inside. */
export const LASSO_INSIDE_SHARE = 0.5;
/** A tap picks the stroke within this many page units of the point. */
export const TAP_TOLERANCE = 14;

/** Even-odd ray cast. A point exactly on an edge may land either way. */
export function pointInPolygon(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;
  const { x, y } = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** `{ x, y, w, h }` around these points, or null for none. */
export function boundsOfPoints(points) {
  if (!Array.isArray(points) || !points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * The page points of a tldraw `draw` (or `highlight`) shape record.
 *
 * tldraw 2.4.6 stores a stroke as `props.segments[].points[]`, each `{x, y, z}`
 * relative to the shape's own `x`/`y` and turned by its `rotation` (radians,
 * about the shape's origin). `props.scale` (the Fine pen) changes the line's
 * width only, not where the points are. Any other shape type has no points
 * here: see `shapeSample`.
 */
export function shapePagePoints(shape) {
  if (!shape || (shape.type !== 'draw' && shape.type !== 'highlight')) return [];
  const ox = Number(shape.x) || 0;
  const oy = Number(shape.y) || 0;
  const r = Number(shape.rotation) || 0;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const out = [];
  for (const segment of shape.props?.segments || []) {
    for (const p of segment?.points || []) {
      const px = Number(p.x) || 0;
      const py = Number(p.y) || 0;
      out.push(r ? { x: ox + px * cos - py * sin, y: oy + px * sin + py * cos } : { x: ox + px, y: oy + py });
    }
  }
  return out;
}

/**
 * One shape as a sample. A stroke is its own points; anything else (a shape
 * someone added in NoteGeek) is the centre of its page bounds, when given.
 */
export function shapeSample(shape, pageBounds = null) {
  const points = shapePagePoints(shape);
  if (points.length) return { id: shape.id, points };
  if (pageBounds) {
    const w = pageBounds.w ?? pageBounds.width ?? 0;
    const h = pageBounds.h ?? pageBounds.height ?? 0;
    return { id: shape.id, points: [{ x: (pageBounds.x ?? 0) + w / 2, y: (pageBounds.y ?? 0) + h / 2 }] };
  }
  return { id: shape?.id, points: [] };
}

/** Is at least `share` of these points inside the polygon? */
export function isCircled(points, polygon, share = LASSO_INSIDE_SHARE) {
  if (!Array.isArray(points) || !points.length) return false;
  let inside = 0;
  for (const p of points) if (pointInPolygon(p, polygon)) inside += 1;
  return inside / points.length >= share;
}

/** The ids of the samples the loop encloses, in the order given. */
export function selectByLasso(samples, polygon, share = LASSO_INSIDE_SHARE) {
  if (!Array.isArray(polygon) || polygon.length < 3) return [];
  return (samples || []).filter((s) => isCircled(s.points, polygon, share)).map((s) => s.id);
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The shortest distance from a point to a stroke's line (Infinity for no points). */
export function distanceToStroke(point, points) {
  if (!Array.isArray(points) || !points.length) return Infinity;
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y);
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const d = distanceToSegment(point, points[i - 1], points[i]);
    if (d < best) best = d;
  }
  return best;
}

/** The id of the stroke nearest the point, within `tolerance` page units; or null. */
export function strokeAtPoint(samples, point, tolerance = TAP_TOLERANCE) {
  let bestId = null;
  let best = Infinity;
  for (const s of samples || []) {
    const d = distanceToStroke(point, s.points);
    // `<=` on a tie: later samples are drawn on top.
    if (d <= tolerance && d <= best) {
      best = d;
      bestId = s.id;
    }
  }
  return bestId;
}

/** A drag that never left a `slop`-sized box is a tap, not a loop. */
export function isTap(path, slop) {
  if (!Array.isArray(path) || path.length < 3) return true;
  const b = boundsOfPoints(path);
  return Math.max(b.w, b.h) <= slop;
}

/**
 * What a finished lasso gesture selects.
 *
 * @param {Array<{id: string, points: Array<{x: number, y: number}>}>} samples
 * @param {Array<{x: number, y: number}>} path  the drag, in page units
 * @param {object} [opts]
 * @param {number} [opts.tapSlop]       how far a tap may wander, in page units
 * @param {number} [opts.tapTolerance]  how near a stroke a tap must land
 * @returns {string[]} shape ids (empty when nothing was circled)
 */
export function lassoSelection(samples, path, { tapSlop = TAP_TOLERANCE, tapTolerance = TAP_TOLERANCE, share = LASSO_INSIDE_SHARE } = {}) {
  if (!Array.isArray(path) || !path.length) return [];
  if (isTap(path, tapSlop)) {
    const id = strokeAtPoint(samples, path[path.length - 1], tapTolerance);
    return id ? [id] : [];
  }
  return selectByLasso(samples, path, share);
}
