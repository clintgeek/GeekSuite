/**
 * sketchFind.js — where on a handwritten page a search hit is
 * (DOCS/HANDWRITING.md §5, "Handwriting search that shows where").
 *
 * Nothing about positions is stored and no model is asked. The page's ink
 * lines come from `findInkLines` (@geeksuite/ink), worked out from the
 * strokes when the note opens; the transcript's lines are lined up with them
 * by a small dynamic-programming alignment; the query's words are found in
 * the transcript the way search rows mark them (`highlightTerms`,
 * `termRegExp`); and each match is turned into a box on the page.
 *
 * The alignment walks both lists top to bottom and allows: one transcript
 * line to one ink line, one to two (a line the model joined, or a long line
 * the finder split), two to one (two short lines the finder joined), and
 * skipping either side (a line the model left out, a scribble it ignored).
 * Each step is scored on relative position down the page (rank, not y, so a
 * two-column page in reading order still lines up) and on text length
 * against ink width (one characters-per-unit rate for the whole page).
 * `[drawing: …]` lines pair only with figure blocks.
 *
 * Inside a line the words are placed by count when the ink has as many word
 * gaps as the text has words, otherwise by proportion along the line, and
 * the box is widened to allow for it. Every hit carries a confidence; under
 * APPROXIMATE it is announced as approximate.
 *
 * Photographed pages stop at the page: `--- page N ---` markers say which
 * photo, and the hit is that whole page.
 */
import { highlightTerms, termRegExp } from './highlightTerms';

export const APPROXIMATE = 0.6;

const PAGE_MARKER = /^-{2,}\s*page\s+(\d+)\s*-{2,}$/i;
const FORM_HEADING = /^\s*§\s/;
const DRAWING = /^\[drawing:/i;

const W_POS = 4;
const MERGE = 0.5;
const SKIP_LINE = 1.6;
const SKIP_FIGURE_LINE = 0.6;
const SKIP_TEXT_BLOCK = 1.4;
const SKIP_FIGURE_BLOCK = 0.3;

/**
 * The transcript lines that are the writer's: no blank lines, no template
 * headings ("§ ACTIONS"), no page markers. Each `{ text, kind, page }`;
 * `kind` is 'figure' for a `[drawing: …]` line.
 */
export function transcriptLines(text) {
    const out = [];
    let page = 1;
    for (const raw of String(text ?? '').split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const marker = PAGE_MARKER.exec(line);
        if (marker) {
            page = Number(marker[1]);
            continue;
        }
        if (FORM_HEADING.test(raw)) continue;
        out.push({ text: line, kind: DRAWING.test(line) ? 'figure' : 'text', page });
    }
    return out;
}

/** Where the query's terms are in `text`: [{ start, end }]. */
export function termMatches(text, terms) {
    const re = termRegExp(terms);
    if (!re || !text) return [];
    return [...String(text).matchAll(re)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

const right = (b) => b.x + b.w;
const bottom = (b) => b.y + b.h;
function unionBox(boxes) {
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    return { x, y, w: Math.max(...boxes.map(right)) - x, h: Math.max(...boxes.map(bottom)) - y };
}

/**
 * Line up transcript `lines` with ink `blocks` (both in reading order).
 * Returns groups `{ lines: [i…], blocks: [j…], lenCost }`, in order; a
 * skipped line or block is simply in no group.
 */
export function alignLines(lines, blocks) {
    const m = lines.length;
    const n = blocks.length;
    const textChars = lines.filter((l) => l.kind === 'text').reduce((s, l) => s + l.text.length, 0);
    const textWidth = blocks.filter((b) => b.kind === 'text').reduce((s, b) => s + b.w, 0);
    const rate = textChars && textWidth ? textChars / textWidth : 0;

    const pos = (i0, i1, j0, j1) => Math.abs((i0 + i1) / 2 / Math.max(m, 1) - (j0 + j1) / 2 / Math.max(n, 1)) * W_POS;
    const lenCost = (is, js) => {
        if (!rate) return 0;
        const chars = is.reduce((s, i) => s + lines[i].text.length, 0) + (is.length - 1);
        const width = js.reduce((s, j) => s + blocks[j].w, 0);
        return Math.abs(Math.log((chars + 3) / (rate * width + 3)));
    };
    const pair = (is, js) => {
        const figureLines = is.every((i) => lines[i].kind === 'figure');
        const figureBlocks = js.every((j) => blocks[j].kind === 'figure');
        const anyFigure = is.some((i) => lines[i].kind === 'figure') || js.some((j) => blocks[j].kind === 'figure');
        if (figureLines && figureBlocks) return is.length === 1 && js.length === 1 ? { cost: 0, len: 0 } : null;
        if (anyFigure) return null;
        const len = lenCost(is, js);
        return { cost: len + (is.length + js.length > 2 ? MERGE : 0), len };
    };

    const cost = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(Infinity));
    const back = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(null));
    cost[0][0] = 0;
    const relax = (i, j, from, add, step) => {
        if (!Number.isFinite(cost[from[0]][from[1]])) return;
        const c = cost[from[0]][from[1]] + add;
        if (c < cost[i][j]) {
            cost[i][j] = c;
            back[i][j] = { from, step };
        }
    };
    for (let i = 0; i <= m; i += 1) {
        for (let j = 0; j <= n; j += 1) {
            if (i === 0 && j === 0) continue;
            if (i > 0) relax(i, j, [i - 1, j], lines[i - 1].kind === 'figure' ? SKIP_FIGURE_LINE : SKIP_LINE, null);
            if (j > 0) relax(i, j, [i, j - 1], blocks[j - 1].kind === 'figure' ? SKIP_FIGURE_BLOCK : SKIP_TEXT_BLOCK, null);
            for (const [di, dj] of [[1, 1], [1, 2], [2, 1]]) {
                if (i < di || j < dj) continue;
                const is = Array.from({ length: di }, (_, k) => i - di + k);
                const js = Array.from({ length: dj }, (_, k) => j - dj + k);
                const p = pair(is, js);
                if (!p) continue;
                relax(i, j, [i - di, j - dj], p.cost + pos(i - di, i, j - dj, j), { lines: is, blocks: js, lenCost: p.len });
            }
        }
    }
    const groups = [];
    for (let at = [m, n]; at[0] > 0 || at[1] > 0;) {
        const b = back[at[0]][at[1]];
        if (!b) break;
        if (b.step) groups.unshift(b.step);
        at = b.from;
    }
    return groups;
}

/** Character offsets of each whitespace-separated token. */
function tokensOf(s) {
    return [...s.matchAll(/\S+/g)].map((t) => ({ start: t.index, end: t.index + t[0].length }));
}

/**
 * The rectangles (one per ink block) that `occurrences` in the group's text
 * cover. `exact` when words were placed by count.
 */
function rectsFor(group, lines, blocks, occurrences, h) {
    const text = group.lines.map((i) => lines[i].text).join(' ');
    const strip = group.blocks.map((j) => blocks[j]);
    const words = strip.flatMap((b, k) => (b.words?.length ? b.words : [{ x: b.x, w: b.w }]).map((w) => ({ ...w, k })));
    const tokens = tokensOf(text);
    const exact = strip.every((b) => b.kind === 'text') && tokens.length === words.length && tokens.length > 0;
    const spans = new Map(); // block k -> [x0, x1]
    const add = (k, x0, x1) => {
        const b = strip[k];
        const a = Math.max(b.x, x0);
        const z = Math.min(right(b), x1);
        if (z <= a) return;
        const prev = spans.get(k);
        spans.set(k, prev ? [Math.min(prev[0], a), Math.max(prev[1], z)] : [a, z]);
    };
    const pad = h * 0.25;
    for (const occ of occurrences) {
        if (strip.some((b) => b.kind === 'figure')) {
            strip.forEach((b, k) => add(k, b.x, right(b)));
            continue;
        }
        if (exact) {
            tokens.forEach((t, idx) => {
                if (t.end > occ.start && t.start < occ.end) add(words[idx].k, words[idx].x - pad, words[idx].x + words[idx].w + pad);
            });
            continue;
        }
        // By proportion along the strip of blocks, widened by a letter
        // height either side for the guess.
        const total = strip.reduce((s, b) => s + b.w, 0) || 1;
        const at = (c) => {
            let d = (c / Math.max(text.length, 1)) * total;
            for (let k = 0; k < strip.length; k += 1) {
                if (d <= strip[k].w || k === strip.length - 1) return { k, x: strip[k].x + Math.min(d, strip[k].w) };
                d -= strip[k].w;
            }
            return { k: 0, x: strip[0].x };
        };
        const a = at(occ.start);
        const z = at(occ.end);
        for (let k = a.k; k <= z.k; k += 1) {
            add(k, k === a.k ? a.x - h : strip[k].x, k === z.k ? z.x + h : right(strip[k]));
        }
    }
    const rects = [...spans.entries()].sort((p, q) => p[0] - q[0]).map(([k, [x0, x1]]) => {
        const b = strip[k];
        // A highlighter pass is taller than the letters: a quarter of h above and below.
        const padY = b.kind === 'text' ? h * 0.25 : 0;
        return { x: x0, y: b.y - padY, w: x1 - x0, h: b.h + 2 * padY, block: group.blocks[k] };
    });
    return { rects, exact };
}

/**
 * Find `query` in a handwritten page.
 *
 * - `text`: the transcript (current or an older reading)
 * - `ink`: `findInkLines(...)` for the page ({ h, blocks })
 * - `photoPages`: page bounds, in order, for a photographed note (then `ink`
 *   is ignored and hits are whole pages)
 * - `stale`: the text is of an older version of the page
 *
 * Returns `{ status, hits }`. `status`: 'none' (no text or no query),
 * 'absent' (the words are not in the text: the hit was the title or tags),
 * 'unplaced' (in the text, but no line could be placed), 'placed'.
 * Each hit: `{ rects, box, lineText, confidence, approximate, page? }`
 * where `box` is what to bring into view and `rects` what to highlight.
 */
export function findInSketch({ query, text, ink = null, photoPages = null, stale = false }) {
    const terms = highlightTerms(query);
    if (!terms.length || typeof text !== 'string' || !text.trim()) return { status: 'none', hits: [] };
    const lines = transcriptLines(text);
    const matched = lines.map((l) => termMatches(l.text, terms));
    if (!matched.some((occ) => occ.length)) return { status: 'absent', hits: [] };

    if (photoPages?.length) {
        const byPage = new Map();
        lines.forEach((l, i) => {
            if (!matched[i].length) return;
            const bounds = photoPages[l.page - 1];
            if (!bounds) return;
            if (!byPage.has(l.page)) byPage.set(l.page, { page: l.page, rects: [], box: bounds, lineText: l.text, confidence: 1, approximate: false });
        });
        const hits = [...byPage.values()];
        return hits.length ? { status: 'placed', hits } : { status: 'unplaced', hits: [] };
    }

    const blocks = ink?.blocks || [];
    const h = ink?.h || 1;
    if (!blocks.length) return { status: 'unplaced', hits: [] };
    const groups = alignLines(lines, blocks);
    const textLines = lines.filter((l) => l.kind === 'text').length;
    const textBlocks = blocks.filter((b) => b.kind === 'text').length;
    const countFactor = 1 - Math.min(0.6, Math.abs(textLines - textBlocks) / Math.max(textLines, textBlocks, 1));

    const found = [];
    for (const g of groups) {
        const occurrences = g.lines.flatMap((i, n) => {
            // Offsets into the joined text of the group.
            const offset = g.lines.slice(0, n).reduce((s, k) => s + lines[k].text.length + 1, 0);
            return matched[i].map((o) => ({ start: o.start + offset, end: o.end + offset }));
        });
        if (!occurrences.length) continue;
        const { rects, exact } = rectsFor(g, lines, blocks, occurrences, h);
        if (!rects.length) continue;
        const step = g.lines.length === 1 && g.blocks.length === 1 ? 1 : 0.75;
        const confidence = countFactor * step * (1 - Math.min(0.4, g.lenCost * 0.4)) * (exact ? 1 : 0.9) * (stale ? 0.75 : 1);
        found.push({
            rects,
            blocks: g.blocks,
            lineText: g.lines.filter((i) => matched[i].length).map((i) => lines[i].text).join(' '),
            confidence,
        });
    }
    if (!found.length) return { status: 'unplaced', hits: [] };

    // Hits on neighbouring lines are one hit (a phrase across a line break).
    const merged = [];
    for (const f of found) {
        const prev = merged[merged.length - 1];
        const near = prev && f.blocks[0] - prev.blocks[prev.blocks.length - 1] <= 1
            && blocks[f.blocks[0]].y - bottom(blocks[prev.blocks[prev.blocks.length - 1]]) <= 2 * h;
        if (near) {
            prev.rects.push(...f.rects);
            prev.blocks.push(...f.blocks);
            prev.lineText = `${prev.lineText} ${f.lineText}`;
            prev.confidence = Math.min(prev.confidence, f.confidence);
        } else {
            merged.push({ ...f, rects: [...f.rects], blocks: [...f.blocks] });
        }
    }
    const hits = merged.map((f) => {
        const confidence = Math.round(f.confidence * 100) / 100;
        return {
            rects: f.rects.map(({ x, y, w, h: rh }) => ({ x, y, w, h: rh })),
            // The whole line(s), so the words are seen in context.
            box: unionBox(f.blocks.map((j) => blocks[j])),
            lineText: f.lineText,
            confidence,
            approximate: confidence < APPROXIMATE,
        };
    });
    return { status: 'placed', hits };
}
