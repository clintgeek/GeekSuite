/**
 * A day's ink page as a few polylines, for its picture on the week spread.
 *
 * The note's content is tldraw's store snapshot (JSON). Nothing of tldraw is
 * loaded here: a `draw` record is turned into page points by
 * ink/lassoGeometry.js (imported directly — ink/index.js pulls in tldraw),
 * thinned, and written as SVG path data. Only strokes are drawn: a template
 * sheet (an image shape printed into the drawing) is the page, not the day's
 * writing, and a day with nothing but a sheet has no picture. Anything unexpected (bad JSON, no
 * strokes, another editor's format) is "no picture", never an error.
 */
import { shapePagePoints } from '../../ink/lassoGeometry.js';

/** The page is this many page units wide whatever the screen (ink/pageCamera.js). */
export const THUMB_PAGE_WIDTH = 1000;
/** How much of the page, from its top, the picture shows. */
export const THUMB_PAGE_HEIGHT = 700;

/** At thumbnail size nobody can see more than this many points in one stroke. */
const MAX_POINTS_PER_STROKE = 48;
const MAX_STROKES = 1500;

const round = (n) => Math.round(n);

function thin(points) {
  if (points.length <= MAX_POINTS_PER_STROKE) return points;
  const step = (points.length - 1) / (MAX_POINTS_PER_STROKE - 1);
  const out = [];
  for (let i = 0; i < MAX_POINTS_PER_STROKE; i += 1) out.push(points[Math.round(i * step)]);
  return out;
}

/** The records of a snapshot, whichever of tldraw's two wrappings it came in. */
function recordsOf(data) {
  const store = data?.document?.store ?? data?.store ?? data;
  return store && typeof store === 'object' ? Object.values(store) : [];
}

/**
 * @param {string} content  a note's content
 * @returns {{ paths: string[], top: number } | null}  SVG path data in page units and the page y the
 *   picture starts at (0 unless every stroke is further down the page); null when there is no ink
 */
export function parseInkThumb(content) {
  if (typeof content !== 'string' || !content) return null;
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return null;
  }
  const strokes = [];
  let minY = Infinity;
  try {
    for (const record of recordsOf(data)) {
      if (!record || record.typeName !== 'shape') continue;
      const points = shapePagePoints(record).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!points.length) continue;
      for (const p of points) if (p.y < minY) minY = p.y;
      strokes.push(thin(points));
      if (strokes.length >= MAX_STROKES) break;
    }
  } catch {
    return null;
  }
  if (!strokes.length) return null;
  const paths = strokes.map((points) => {
    // A dot is one point: give it a length the round line cap can draw.
    const [first, ...rest] = points;
    const tail = rest.length ? rest.map((p) => `L${round(p.x)} ${round(p.y)}`).join('') : `l0.01 0`;
    return `M${round(first.x)} ${round(first.y)}${tail}`;
  });
  // A page written only below the first screen still gets a picture of its ink, not a blank box.
  const top = minY >= THUMB_PAGE_HEIGHT ? Math.max(0, round(minY) - 40) : 0;
  return { paths, top };
}

// A sketch is routinely a megabyte of JSON: parse each content string once.
const cache = new Map();
const CACHE_SIZE = 8;

/** `parseInkThumb`, remembered per content string. */
export function inkThumbFor(content) {
  if (typeof content !== 'string' || !content) return null;
  if (cache.has(content)) return cache.get(content);
  const thumb = parseInkThumb(content);
  cache.set(content, thumb);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return thumb;
}
