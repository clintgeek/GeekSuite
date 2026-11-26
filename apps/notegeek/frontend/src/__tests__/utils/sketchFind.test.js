/**
 * Where on a handwritten page a search hit is (DOCS/HANDWRITING.md §5):
 * transcript lines against the ink's own lines.
 */
import { describe, it, expect } from 'vitest';
import { findInkLines } from '@geeksuite/ink';
import { findInSketch, transcriptLines, alignLines, APPROXIMATE } from '../../utils/sketchFind';

/** Printed handwriting, one box per letter (as in packages/ink's inkLines tests). */
function writeLine(text, { x = 20, baseline = 40 } = {}) {
    const boxes = [];
    let at = x;
    for (const ch of text) {
        if (ch === ' ') {
            at += 9;
            continue;
        }
        const tall = /[bdfhklt]|[A-Z0-9]/.test(ch);
        const deep = /[gjpqy]/.test(ch);
        const top = baseline - (tall ? 18 : 10);
        boxes.push({ x: at, y: top, w: 7, h: baseline + (deep ? 7 : 0) - top });
        at += 8.5;
    }
    return boxes;
}
const inkOf = (lines, spacing = 30) => findInkLines(lines.flatMap((t, i) => (t ? writeLine(t, { baseline: 40 + i * spacing }) : [])));
// Inside the block across, and centred on it down (the highlight is padded above and below).
const inside = (r, b) => r.x >= b.x - 0.01 && r.x + r.w <= b.x + b.w + 0.01 && Math.abs((r.y + r.h / 2) - (b.y + b.h / 2)) < 0.01;

const PAGE = [
    'Garage door quote from Hendricks',
    'call back before Friday',
    'ask about the side gate',
    'budget is about two thousand',
    'pick paint at the yard',
    'tell Sam the plan',
];

describe('transcriptLines', () => {
    it('keeps the writer\'s lines only, with drawings marked and pages counted', () => {
        const lines = transcriptLines('§ ACTIONS\n\nbuy milk\n[drawing: a house]\n--- page 2 ---\n  call Sam  \n');
        expect(lines).toEqual([
            { text: 'buy milk', kind: 'text', page: 1 },
            { text: '[drawing: a house]', kind: 'figure', page: 1 },
            { text: 'call Sam', kind: 'text', page: 2 },
        ]);
    });
});

describe('findInSketch', () => {
    it('same line count: the word, on its line, confidently', () => {
        const ink = inkOf(PAGE);
        const r = findInSketch({ query: 'gate', text: PAGE.join('\n'), ink });
        expect(r.status).toBe('placed');
        expect(r.hits).toHaveLength(1);
        const [hit] = r.hits;
        expect(inside(hit.rects[0], ink.blocks[2])).toBe(true);
        // The word, not the whole line: "gate" is the last of five words.
        expect(hit.rects[0].w).toBeLessThan(ink.blocks[2].w / 3);
        expect(hit.rects[0].x).toBeGreaterThan(ink.blocks[2].x + ink.blocks[2].w / 2);
        expect(hit.lineText).toBe('ask about the side gate');
        expect(hit.approximate).toBe(false);
        expect(hit.confidence).toBeGreaterThan(0.8);
    });

    it('every occurrence is a hit, in page order', () => {
        const ink = inkOf(PAGE);
        const r = findInSketch({ query: 'Friday plan', text: PAGE.join('\n'), ink });
        expect(r.hits).toHaveLength(2);
        expect(inside(r.hits[0].rects[0], ink.blocks[1])).toBe(true);
        expect(inside(r.hits[1].rects[0], ink.blocks[5])).toBe(true);
        // On neighbouring lines they are one hit.
        expect(findInSketch({ query: 'about', text: PAGE.join('\n'), ink }).hits).toHaveLength(1);
    });

    it('the model joined two ink lines into one transcript line', () => {
        const ink = inkOf(PAGE);
        const text = [PAGE[0], `${PAGE[1]} ${PAGE[2]}`, ...PAGE.slice(3)].join('\n');
        const r = findInSketch({ query: 'gate', text, ink });
        expect(r.status).toBe('placed');
        expect(inside(r.hits[0].rects[0], ink.blocks[2])).toBe(true);
    });

    it('two short lines the finder read as one ink line', () => {
        // "milk" and "eggs" side by side on one row: one ink line, two transcript lines.
        const boxes = [...writeLine('milk', { x: 20, baseline: 40 }), ...writeLine('eggs', { x: 80, baseline: 40 }), ...writeLine('bread and butter', { baseline: 70 })];
        const ink = findInkLines(boxes);
        expect(ink.blocks).toHaveLength(2);
        const r = findInSketch({ query: 'eggs', text: 'milk\neggs\nbread and butter', ink });
        expect(r.status).toBe('placed');
        expect(r.hits[0].rects[0].x).toBeGreaterThan(70);
        expect(r.hits[0].rects[0].y).toBeLessThan(40);
    });

    it('a drawing line pairs with the figure', () => {
        const above = writeLine('see the plan below', { baseline: 40 });
        const figure = [{ x: 20, y: 70, w: 200, h: 120 }];
        const below = writeLine('then the porch', { baseline: 230 });
        const ink = findInkLines([...above, ...figure, ...below]);
        const text = 'see the plan below\n[drawing: floor plan with an arrow]\nthen the porch';
        const r = findInSketch({ query: 'arrow', text, ink });
        expect(r.hits).toHaveLength(1);
        expect(r.hits[0].rects[0]).toMatchObject({ x: 20, y: 70, w: 200, h: 120 });
        expect(findInSketch({ query: 'porch', text, ink }).hits[0].rects[0].y).toBeGreaterThan(200);
    });

    it('form headings are not the writer\'s and are not found', () => {
        const ink = inkOf(['ship the release', 'fix the build']);
        const text = '§ ACTIONS\nship the release\n§ NOTES\nfix the build';
        expect(findInSketch({ query: 'actions', text, ink }).status).toBe('absent');
        const r = findInSketch({ query: 'build', text, ink });
        expect(inside(r.hits[0].rects[0], ink.blocks[1])).toBe(true);
        expect(r.hits[0].confidence).toBeGreaterThan(0.8);
    });

    it('a photographed note stops at the page the marker names', () => {
        const pages = [{ x: 0, y: 0, w: 1000, h: 1400 }, { x: 0, y: 1448, w: 1000, h: 1400 }];
        const text = '--- page 1 ---\nshopping list\n\n--- page 2 ---\nthe garage door';
        const r = findInSketch({ query: 'garage', text, photoPages: pages });
        expect(r.status).toBe('placed');
        expect(r.hits).toEqual([expect.objectContaining({ page: 2, box: pages[1], rects: [] })]);
    });

    it('a phrase across two lines is one hit', () => {
        const lines = ['we need to fix the garage', 'door before winter', 'and the roof'];
        const ink = inkOf(lines);
        const r = findInSketch({ query: 'garage door', text: lines.join('\n'), ink });
        expect(r.hits).toHaveLength(1);
        expect(r.hits[0].rects).toHaveLength(2);
        expect(r.hits[0].lineText).toBe('we need to fix the garage door before winter');
        expect(r.hits[0].box.h).toBeGreaterThan(ink.blocks[0].h + ink.blocks[1].h);
    });

    it('an older reading still places the hit, with less confidence', () => {
        const ink = inkOf([...PAGE, 'a line written after the reading']);
        const fresh = findInSketch({ query: 'Friday', text: PAGE.join('\n'), ink });
        const stale = findInSketch({ query: 'Friday', text: PAGE.join('\n'), ink, stale: true });
        expect(inside(stale.hits[0].rects[0], ink.blocks[1])).toBe(true);
        expect(stale.hits[0].confidence).toBeLessThan(fresh.hits[0].confidence);
    });

    it('corrected text (words changed, lines kept) lines up the same', () => {
        const ink = inkOf(PAGE);
        const edited = PAGE.map((l) => l.replace('Hendricks', 'Hendrix')).join('\n');
        const r = findInSketch({ query: 'hendrix', text: edited, ink });
        expect(inside(r.hits[0].rects[0], ink.blocks[0])).toBe(true);
    });

    it('a much worse match is called approximate', () => {
        // The text has twice as many lines as the page: the counts disagree.
        const ink = inkOf(['one long line of writing here', 'another long line']);
        const text = 'one\nlong\nline\nof writing\nhere\nanother long line';
        const r = findInSketch({ query: 'writing', text, ink, stale: true });
        expect(r.status).toBe('placed');
        expect(r.hits[0].confidence).toBeLessThan(APPROXIMATE);
        expect(r.hits[0].approximate).toBe(true);
    });

    it('no text, no query, words not there, nothing to place', () => {
        const ink = inkOf(PAGE);
        expect(findInSketch({ query: 'gate', text: null, ink }).status).toBe('none');
        expect(findInSketch({ query: 'gate', text: '   ', ink }).status).toBe('none');
        expect(findInSketch({ query: '', text: PAGE.join('\n'), ink }).status).toBe('none');
        expect(findInSketch({ query: 'zebra', text: PAGE.join('\n'), ink }).status).toBe('absent');
        expect(findInSketch({ query: 'gate', text: PAGE.join('\n'), ink: { h: 0, blocks: [] } }).status).toBe('unplaced');
        // Only a drawing on the page, and the words are in a text line.
        const drawingOnly = findInkLines([{ x: 0, y: 0, w: 300, h: 200, figure: true }]);
        expect(findInSketch({ query: 'gate', text: 'the gate', ink: drawingOnly }).status).toBe('unplaced');
    });
});

describe('alignLines', () => {
    it('one to one when the counts agree', () => {
        const ink = inkOf(PAGE);
        const groups = alignLines(transcriptLines(PAGE.join('\n')), ink.blocks);
        expect(groups.map((g) => [g.lines, g.blocks])).toEqual(PAGE.map((_, i) => [[i], [i]]));
    });
});
