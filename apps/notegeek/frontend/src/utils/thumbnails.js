/**
 * Cheap, pure geometry for the list's sketch thumbnails.
 *
 * A sketch stores a JSON snapshot that can be large (the ceiling is millions
 * of characters), so:
 *   - nothing here touches the DOM or React;
 *   - results are memoised by the caller's key (note id + updatedAt +
 *     content length) in a small bounded cache, so a re-render, a re-sort
 *     or a remount of the list never re-parses a note it has seen;
 *   - stroke points are thinned to a fixed budget, so a dense sketch costs
 *     the same to DRAW as a sparse one.
 *
 * The row only asks for this once the thumbnail scrolls into view
 * (NotePreview.jsx), so a long list parses only what is on screen.
 */

const CACHE_LIMIT = 300;
const cache = new Map();

function memo(key, compute) {
  if (key && cache.has(key)) {
    const hit = cache.get(key);
    // Refresh recency so the bound evicts the oldest-used entry.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const value = compute();
  if (key) {
    cache.set(key, value);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }
  return value;
}

/**
 * A geometry already computed for this note version, or `undefined` — lets a
 * remounting row paint its thumbnail on the first frame instead of flashing
 * the placeholder while it waits for an idle slot.
 */
export function cachedGeometry(key) {
  const k = key && `s:${key}`;
  return k && cache.has(k) ? cache.get(k) : undefined;
}

/** Exposed for tests. */
export function _clearThumbnailCache() {
  cache.clear();
}

export function thumbnailKey(note) {
  if (!note) return null;
  const id = note.id || note._id;
  if (!id) return null;
  return `${id}:${note.updatedAt || ''}:${(note.content || '').length}`;
}

function parse(content) {
  if (typeof content !== 'string' || !content.trim().startsWith('{')) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const MAX_POINTS_PER_STROKE = 48;
const MAX_STROKES = 120;

function thin(points, budget) {
  if (points.length <= budget) return points;
  const step = (points.length - 1) / (budget - 1);
  const out = [];
  for (let i = 0; i < budget; i += 1) out.push(points[Math.round(i * step)]);
  return out;
}

/**
 * Strokes and boxes from a tldraw v2 store snapshot
 * (`{ store: { 'shape:…': { typeName: 'shape', type, x, y, props } } }`).
 *
 * Draw / highlight / line shapes become polylines; geo shapes (rectangles,
 * ellipses…) and images become their bounding boxes; everything else is ignored. Points
 * are shape-relative in tldraw, so the shape's x/y is added back. Rotation
 * is ignored — at 56px nobody can tell.
 *
 * @returns {{ viewBox: string, paths: string[], boxes: Array<{x,y,w,h}> } | null}
 *   null when there is nothing to draw.
 */
export function sketchGeometry(content, key) {
  return memo(key && `s:${key}`, () => {
    const data = parse(content);
    const records = data?.store || data?.document?.store || null;
    if (!records || typeof records !== 'object') return null;

    const strokes = [];
    const boxes = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (x, y) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };

    for (const rec of Object.values(records)) {
      if (!rec || rec.typeName !== 'shape') continue;
      const ox = Number(rec.x) || 0;
      const oy = Number(rec.y) || 0;
      const props = rec.props || {};

      if ((rec.type === 'draw' || rec.type === 'highlight') && Array.isArray(props.segments)) {
        for (const seg of props.segments) {
          if (strokes.length >= MAX_STROKES) break;
          const pts = Array.isArray(seg?.points) ? seg.points : [];
          const abs = [];
          for (const p of pts) {
            if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) abs.push([ox + p.x, oy + p.y]);
          }
          if (abs.length === 0) continue;
          if (abs.length === 1) abs.push([abs[0][0] + 0.5, abs[0][1] + 0.5]);
          const thinned = thin(abs, MAX_POINTS_PER_STROKE);
          thinned.forEach(([x, y]) => grow(x, y));
          strokes.push(thinned);
        }
      } else if (rec.type === 'line' && props.points && typeof props.points === 'object') {
        const abs = Object.values(props.points)
          .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
          .sort((a, b) => String(a.index || '').localeCompare(String(b.index || '')))
          .map((p) => [ox + p.x, oy + p.y]);
        if (abs.length >= 2) {
          abs.forEach(([x, y]) => grow(x, y));
          strokes.push(thin(abs, MAX_POINTS_PER_STROKE));
        }
      } else if ((rec.type === 'geo' || rec.type === 'frame' || rec.type === 'note' || rec.type === 'image') && Number.isFinite(props.w) && Number.isFinite(props.h)) {
        // `image`: a photo sketch note's pages (HANDWRITING.md §3) draw as
        // their outlines, stacked, rather than leaving the row blank.
        boxes.push({ x: ox, y: oy, w: props.w, h: props.h });
        grow(ox, oy);
        grow(ox + props.w, oy + props.h);
      }
    }

    if (!strokes.length && !boxes.length) return null;

    const pad = Math.max(maxX - minX, maxY - minY, 1) * 0.08;
    const vx = minX - pad;
    const vy = minY - pad;
    const vw = Math.max(maxX - minX, 1) + pad * 2;
    const vh = Math.max(maxY - minY, 1) + pad * 2;
    const r = (n) => Math.round(n * 10) / 10;

    return {
      viewBox: `${r(vx)} ${r(vy)} ${r(vw)} ${r(vh)}`,
      // Stroke width in viewBox units, so a line reads ~1.5px whatever the
      // sketch's real size.
      strokeWidth: r(Math.max(vw, vh) / 48),
      paths: strokes.map((pts) => 'M' + pts.map(([x, y]) => `${r(x)} ${r(y)}`).join('L')),
      boxes: boxes.map((b) => ({ x: r(b.x), y: r(b.y), w: r(b.w), h: r(b.h) })),
    };
  });
}
