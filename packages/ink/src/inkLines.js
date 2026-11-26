/**
 * inkLines.js — where the lines of handwriting are on a page, worked out from
 * the ink's own geometry (NoteGeek's "search hit shows where",
 * apps/notegeek/DOCS/HANDWRITING.md §5). Pure: it takes a list of shape
 * bounds in page units and knows nothing about tldraw, so GeekDay's day page
 * can use it too. `inkBoxesOf(editor)` is the one tldraw-shaped helper, and it
 * only reads.
 *
 * The method, in order:
 *   1. h = the median stroke height. Everything else is measured in h, so the
 *      same rules work at any writing size or zoom.
 *   2. A stroke taller than FIGURE (3) h is a figure: a box, an arrow, a
 *      drawing. Figures that touch become one figure block.
 *   3. A stroke flatter than MARK (0.35) h, or smaller than DOT (0.6) h both
 *      ways (a pen dot is drawn as a round blob the width of the nib), is a
 *      mark: an i-dot, a comma, a
 *      dash, a t-bar, an underline. Marks never start a line; each joins the
 *      nearest line within MARK_REACH (1.5) h, or is left out.
 *   4. The rest are joined into lines: two strokes are on one line when they
 *      overlap vertically by at least half the smaller height, their centres
 *      are within CENTRE (1) h, and they are at most JOIN_GAP (3) h apart
 *      sideways. Joining is transitive, so a line that climbs or sags across
 *      the page is followed stroke by stroke.
 *   5. Lines whose centres are within MERGE_CENTRE (0.5) h and at most
 *      MERGE_GAP (4) h apart sideways are one line (a wide gap between words).
 *   6. Blocks (lines and figures) are put in reading order by recursive XY
 *      cuts: at each level the wider of the best horizontal gap and the best
 *      vertical gutter (at least GUTTER, 2 h) splits the set; what cannot be
 *      split is ordered top to bottom. So a heading over two columns reads
 *      heading, left column, right column; a diagram in the middle sits
 *      between the lines above and below it.
 *   7. Each line's words: its strokes' x-extents, merged across gaps smaller
 *      than WORD_GAP (0.3) h.
 *
 * Honest limits (tuned against the synthetic pages in
 * __tests__/inkLines.test.js, not yet against a real notebook):
 *   - Lines written closer than about 1.5 h (baseline to baseline, in x-height
 *     units) can be joined into one; a descender that dips deep into the next
 *     line usually does not join them (rule 4's centre test), a cursive word
 *     that loops through two lines can.
 *   - Two columns closer than about 4 h read as one line per row.
 *   - Writing at more than three times the page's usual size (a big title) is
 *     taken for a figure; a drawing made of many short strokes is taken for
 *     lines of writing.
 *   - Words are estimated from gaps: tight handwriting reads as fewer words,
 *     spaced-out letters as more. Callers treat word boxes as a guess.
 */

export const INK_LINE_RULES = Object.freeze({
  FIGURE: 3,
  MARK: 0.35,
  DOT: 0.6,
  OVERLAP: 0.5,
  CENTRE: 1,
  JOIN_GAP: 3,
  MERGE_CENTRE: 0.5,
  MERGE_GAP: 4,
  MARK_REACH: 1.5,
  GUTTER: 2,
  WORD_GAP: 0.3,
});

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const right = (b) => b.x + b.w;
const bottom = (b) => b.y + b.h;
const cy = (b) => b.y + b.h / 2;
const yGap = (a, b) => Math.max(0, Math.max(a.y, b.y) - Math.min(bottom(a), bottom(b)));
const near = (a, b, d) => xGap(a, b) <= d && yGap(a, b) <= d;
const xGap = (a, b) => Math.max(0, Math.max(a.x, b.x) - Math.min(right(a), right(b)));

function union(boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map(right)) - x, h: Math.max(...boxes.map(bottom)) - y };
}

/** Union-find over indices. */
function groups(n, linked) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  linked((a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  });
  const out = new Map();
  for (let i = 0; i < n; i += 1) {
    const r = find(i);
    if (!out.has(r)) out.set(r, []);
    out.get(r).push(i);
  }
  return [...out.values()];
}

function wordsOf(strokes, h, rules) {
  const spans = strokes.map((s) => [s.x, right(s)]).sort((a, b) => a[0] - b[0]);
  const words = [];
  for (const [x0, x1] of spans) {
    const last = words[words.length - 1];
    if (last && x0 - last[1] <= rules.WORD_GAP * h) last[1] = Math.max(last[1], x1);
    else words.push([x0, x1]);
  }
  return words.map(([x0, x1]) => ({ x: x0, w: x1 - x0 }));
}

function makeLine(strokes, h, rules) {
  return {
    kind: 'text',
    ...union(strokes),
    cy: median(strokes.map(cy)),
    strokes,
    marks: [],
    words: wordsOf(strokes, h, rules),
  };
}

/** The best cut of `blocks` along one axis: { gap, index } over the sorted list. */
function bestCut(sorted, lo, hi) {
  let reach = hi(sorted[0]);
  let best = { gap: 0, index: -1 };
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = lo(sorted[i]) - reach;
    if (gap > best.gap) best = { gap, index: i };
    reach = Math.max(reach, hi(sorted[i]));
  }
  return best;
}

function readingOrder(blocks, h, rules) {
  if (blocks.length <= 1) return blocks;
  const byY = [...blocks].sort((a, b) => a.y - b.y);
  const byX = [...blocks].sort((a, b) => a.x - b.x);
  const across = bestCut(byY, (b) => b.y, bottom);
  const down = bestCut(byX, (b) => b.x, right);
  if (down.index > 0 && down.gap >= rules.GUTTER * h && down.gap > across.gap) {
    return [...readingOrder(byX.slice(0, down.index), h, rules), ...readingOrder(byX.slice(down.index), h, rules)];
  }
  if (across.index > 0) {
    return [...readingOrder(byY.slice(0, across.index), h, rules), ...readingOrder(byY.slice(across.index), h, rules)];
  }
  return [...blocks].sort((a, b) => (a.cy - b.cy) || (a.x - b.x));
}

/**
 * The lines of writing on a page.
 *
 * `boxes`: [{ x, y, w, h, id? }] in page units, one per stroke or shape, with
 * the paper sheet and photos already left out (see `inkBoxesOf`). A box with
 * `figure: true` is a figure whatever its size (a geo shape, an arrow).
 *
 * Returns `{ h, blocks }`: `h` the median stroke height (0 when there is no
 * ink), `blocks` in reading order, each `{ kind: 'text' | 'figure', x, y, w,
 * h, cy, ids, words }` (`words` empty on a figure).
 */
export function findInkLines(boxes, options = {}) {
  const rules = { ...INK_LINE_RULES, ...options };
  const clean = (Array.isArray(boxes) ? boxes : [])
    .filter((b) => b && finite(b.x) && finite(b.y) && finite(b.w) && finite(b.h) && b.w >= 0 && b.h >= 0)
    .map((b) => ({ ...b }));
  if (!clean.length) return { h: 0, blocks: [] };

  const h = Math.max(median(clean.filter((b) => !b.figure).map((b) => b.h)), 1e-6) || 1;
  const figures = [];
  const marks = [];
  const text = [];
  for (const b of clean) {
    if (b.figure || b.h > rules.FIGURE * h) figures.push(b);
    else if (b.h < rules.MARK * h || (b.h < rules.DOT * h && b.w < rules.DOT * h)) marks.push(b);
    else text.push(b);
  }

  // A flat stroke touching a figure (a box's top edge) is part of it.
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    if (figures.some((f) => near(f, marks[i], 0.5 * h))) figures.push(...marks.splice(i, 1));
  }

  // Lines (rule 4). Sorted by top, so a stroke is only compared with those
  // that start above its bottom.
  const sorted = [...text].sort((a, b) => a.y - b.y);
  const lineGroups = groups(sorted.length, (link) => {
    for (let i = 0; i < sorted.length; i += 1) {
      const a = sorted[i];
      for (let j = i + 1; j < sorted.length; j += 1) {
        const b = sorted[j];
        if (b.y >= bottom(a)) break;
        const overlap = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
        if (overlap < rules.OVERLAP * Math.min(a.h, b.h)) continue;
        if (Math.abs(cy(a) - cy(b)) > rules.CENTRE * h) continue;
        if (xGap(a, b) > rules.JOIN_GAP * h) continue;
        link(i, j);
      }
    }
  });
  let lines = lineGroups.map((idx) => idx.map((i) => sorted[i]));

  // Rule 5: one line split by a wide gap.
  for (let merged = true; merged;) {
    merged = false;
    const built = lines.map((strokes) => ({ strokes, box: union(strokes), cy: median(strokes.map(cy)) }));
    outer: for (let i = 0; i < built.length; i += 1) {
      for (let j = i + 1; j < built.length; j += 1) {
        if (Math.abs(built[i].cy - built[j].cy) <= rules.MERGE_CENTRE * h && xGap(built[i].box, built[j].box) <= rules.MERGE_GAP * h) {
          lines = built.filter((_, k) => k !== i && k !== j).map((l) => l.strokes);
          lines.push([...built[i].strokes, ...built[j].strokes]);
          merged = true;
          break outer;
        }
      }
    }
  }
  const textBlocks = lines.map((strokes) => makeLine(strokes, h, rules));

  // Rule 3: marks join the nearest line.
  for (const m of marks) {
    let best = null;
    for (const line of textBlocks) {
      if (xGap(m, line) > rules.JOIN_GAP * h) continue;
      const c = cy(m);
      const dy = c < line.y ? line.y - c : c > bottom(line) ? c - bottom(line) : 0;
      if (dy > rules.MARK_REACH * h) continue;
      const score = dy + xGap(m, line) * 0.01;
      if (!best || score < best.score) best = { line, score };
    }
    if (best) best.line.marks.push(m);
  }
  for (const line of textBlocks) {
    if (line.marks.length) Object.assign(line, union([line, ...line.marks]));
  }

  // Rule 2: figures that touch or sit inside one another are one figure.
  let figureSets = figures.map((f) => [f]);
  for (let merged = true; merged;) {
    merged = false;
    const boxesOf = figureSets.map(union);
    outer: for (let i = 0; i < figureSets.length; i += 1) {
      for (let j = i + 1; j < figureSets.length; j += 1) {
        if (near(boxesOf[i], boxesOf[j], 0.5 * h)) {
          figureSets = [...figureSets.filter((_, k) => k !== i && k !== j), [...figureSets[i], ...figureSets[j]]];
          merged = true;
          break outer;
        }
      }
    }
  }
  const figureBlocks = figureSets.map((members) => {
    const box = union(members);
    return { kind: 'figure', ...box, cy: cy(box), strokes: members, marks: [], words: [] };
  });

  const ordered = readingOrder([...textBlocks, ...figureBlocks], h, rules);
  return {
    h,
    blocks: ordered.map((b) => ({
      kind: b.kind,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      cy: b.cy,
      ids: [...b.strokes, ...b.marks].map((s) => s.id).filter((id) => id !== undefined),
      words: b.words,
    })),
  };
}

/** Shape types that are never a line of writing. */
const FIGURE_TYPES = new Set(['geo', 'arrow', 'line', 'frame', 'note', 'embed', 'bookmark', 'video']);

/**
 * The bounds of every shape on a tldraw editor's current page that could be
 * writing, for `findInkLines`. Images (photos, a template sheet) are left
 * out; geo shapes, arrows and the like are figures. Read only.
 */
export function inkBoxesOf(editor) {
  const shapes = editor?.getCurrentPageShapesSorted?.() || [];
  const out = [];
  for (const s of shapes) {
    if (!s || s.type === 'image' || s.type === 'group') continue;
    const b = editor.getShapePageBounds?.(s);
    if (!b) continue;
    out.push({ id: s.id, x: b.x, y: b.y, w: b.w, h: b.h, ...(FIGURE_TYPES.has(s.type) ? { figure: true } : null) });
  }
  return out;
}
