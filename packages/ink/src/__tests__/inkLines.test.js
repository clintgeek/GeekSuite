import { describe, it, expect } from 'vitest';
import { findInkLines, inkBoxesOf } from '../inkLines.js';

/**
 * Synthetic handwriting, one box per stroke, shaped like a real hand at
 * 100% zoom: x-height 10, ascenders to 18, descenders to 7 below the
 * baseline, letters 7 wide with 1.5 between them, 9 between words, an
 * i-dot over every i and a comma or full stop as a small mark.
 */
let nextId = 0;
function writeLine(text, { x = 20, baseline = 40, slope = 0, size = 1 } = {}) {
  const boxes = [];
  let at = x;
  for (const ch of text) {
    const base = baseline + slope * (at - x);
    if (ch === ' ') {
      at += 9 * size;
      continue;
    }
    const id = `s${nextId += 1}`;
    if (ch === ',' || ch === '.') {
      boxes.push({ id, x: at, y: base - 2 * size, w: 2 * size, h: 3 * size });
      at += 4 * size;
      continue;
    }
    const tall = 'bdfhklt'.includes(ch) || /[A-Z0-9]/.test(ch);
    const deep = 'gjpqy'.includes(ch);
    const top = base - (tall ? 18 : 10) * size;
    const foot = base + (deep ? 7 : 0) * size;
    boxes.push({ id, x: at, y: top, w: 7 * size, h: foot - top });
    if (ch === 'i' || ch === 'j') boxes.push({ id: `${id}dot`, x: at + 2.5 * size, y: base - 15 * size, w: 2 * size, h: 2 * size });
    at += 8.5 * size;
  }
  return boxes;
}

const page = (lines, opts = {}) => lines.flatMap((text, i) => writeLine(text, { baseline: 40 + i * (opts.spacing ?? 30), ...opts }));
const textBlocks = (r) => r.blocks.filter((b) => b.kind === 'text');

describe('findInkLines', () => {
  it('finds nothing on an empty page', () => {
    expect(findInkLines([])).toEqual({ h: 0, blocks: [] });
    expect(findInkLines(null).blocks).toEqual([]);
    expect(findInkLines([{ x: NaN, y: 0, w: 1, h: 1 }]).blocks).toEqual([]);
  });

  it('six plain lines, top to bottom, with their words', () => {
    const lines = [
      'Garage door quote from Hendricks',
      'call back before Friday',
      'ask about the side gate',
      'budget is about two thousand',
      'pick paint at the yard',
      'tell Sam the plan, done.',
    ];
    const r = findInkLines(page(lines));
    expect(r.blocks).toHaveLength(6);
    expect(r.blocks.every((b) => b.kind === 'text')).toBe(true);
    const tops = r.blocks.map((b) => b.cy);
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    r.blocks.forEach((b, i) => expect(b.words).toHaveLength(lines[i].split(' ').length));
  });

  it('i-dots and punctuation join their line and never make one', () => {
    const boxes = page(['this is it, mind.', 'idle insight in', 'quiet, quick.']);
    const r = findInkLines(boxes);
    expect(r.blocks).toHaveLength(3);
    const dots = boxes.filter((b) => b.h <= 3);
    expect(dots.length).toBeGreaterThan(8);
    const ids = r.blocks.flatMap((b) => b.ids);
    for (const d of dots) expect(ids).toContain(d.id);
  });

  it('follows lines that climb across the page', () => {
    // A 5% climb: the end of each line sits higher than the start of the
    // line above it would allow a band-by-y rule to tell apart.
    const lines = ['the lines in this note climb slowly to the right', 'and so does the second one, just the same', 'third line of slanted writing here too'];
    const r = findInkLines(page(lines, { slope: -0.05, spacing: 26 }));
    expect(textBlocks(r)).toHaveLength(3);
    r.blocks.forEach((b, i) => expect(b.words).toHaveLength(lines[i].split(' ').length));
  });

  it('a descender reaching into the next line does not join them', () => {
    // 22 apart: a g or y in line one (7 below) overlaps an ascender of line two (18 above).
    const lines = ['jolly yoga pygmy gypsy', 'black hold thick fold', 'quietly gaping jiggy'];
    const r = findInkLines(page(lines, { spacing: 22 }));
    expect(r.blocks).toHaveLength(3);
  });

  it('a wide gap between words is still one line', () => {
    const boxes = [...writeLine('left side', { x: 20 }), ...writeLine('far right', { x: 130 })];
    expect(findInkLines(boxes).blocks).toHaveLength(1);
  });

  it('two columns read left column, then right', () => {
    const left = ['left one', 'left two', 'left three', 'left four'].flatMap((t, i) => writeLine(t, { x: 20, baseline: 40 + i * 30 }));
    const right = ['right one', 'right two', 'right three'].flatMap((t, i) => writeLine(t, { x: 300, baseline: 52 + i * 30 }));
    const r = findInkLines([...left, ...right]);
    expect(r.blocks).toHaveLength(7);
    expect(r.blocks.slice(0, 4).every((b) => b.x < 100)).toBe(true);
    expect(r.blocks.slice(4).every((b) => b.x >= 300)).toBe(true);
  });

  it('a heading over two columns comes first', () => {
    const heading = writeLine('Meeting notes for the whole team today', { x: 20, baseline: 20 });
    const left = ['left one', 'left two', 'left three'].flatMap((t, i) => writeLine(t, { x: 20, baseline: 60 + i * 30 }));
    const right = ['right one', 'right two'].flatMap((t, i) => writeLine(t, { x: 300, baseline: 60 + i * 30 }));
    const r = findInkLines([...right, ...heading, ...left]);
    expect(r.blocks).toHaveLength(6);
    expect(r.blocks[0].y).toBeLessThan(20);
    expect(r.blocks.slice(1, 4).every((b) => b.x < 100)).toBe(true);
    expect(r.blocks.slice(4).every((b) => b.x >= 300)).toBe(true);
  });

  it('a diagram in the middle is a figure between the lines around it', () => {
    const above = ['first line above', 'second line above'].flatMap((t, i) => writeLine(t, { baseline: 40 + i * 30 }));
    // A box drawn as four strokes, and an arrow inside it.
    const box = [
      { id: 'top', x: 20, y: 100, w: 200, h: 3 },
      { id: 'left', x: 20, y: 100, w: 3, h: 120 },
      { id: 'right', x: 217, y: 100, w: 3, h: 120 },
      { id: 'bottom', x: 20, y: 217, w: 200, h: 3 },
      { id: 'arrow', x: 60, y: 120, w: 100, h: 60 },
    ];
    const below = ['first line below', 'last line below'].flatMap((t, i) => writeLine(t, { baseline: 260 + i * 30 }));
    const r = findInkLines([...below, ...box, ...above]);
    expect(r.blocks.map((b) => b.kind)).toEqual(['text', 'text', 'figure', 'text', 'text']);
    expect(r.blocks[2].ids).toEqual(expect.arrayContaining(['left', 'right', 'arrow']));
  });

  it('a box drawn with the shape tool is a figure whatever its size', () => {
    const r = findInkLines([...writeLine('a line'), { id: 'g', x: 20, y: 60, w: 80, h: 20, figure: true }]);
    expect(r.blocks.map((b) => b.kind)).toEqual(['text', 'figure']);
  });

  it('joined-up writing: one stroke per word, ascenders and all', () => {
    // A cursive word is one stroke from its tallest ascender to its lowest
    // descender: taller than a printed letter, so h is bigger.
    const cursive = (words, baseline) => {
      let x = 20;
      return words.map((w) => {
        const top = baseline - (/[bdfhklt]/.test(w) ? 18 : 10);
        const foot = baseline + (/[gjpqy]/.test(w) ? 7 : 0);
        const box = { id: `${w}${baseline}`, x, y: top, w: w.length * 7, h: foot - top };
        x += w.length * 7 + 9;
        return box;
      });
    };
    const r = findInkLines([
      ...cursive(['buy', 'eggs', 'and', 'flour'], 40),
      ...cursive(['ring', 'the', 'plumber', 'by', 'noon'], 68),
      ...cursive(['quiet', 'weekend', 'maybe'], 96),
    ]);
    expect(r.blocks).toHaveLength(3);
    expect(r.blocks.map((b) => b.words.length)).toEqual([4, 5, 3]);
  });

  it('works at any writing size', () => {
    const r = findInkLines(page(['big writing here', 'and more of it'], { size: 3, spacing: 90 }));
    expect(r.blocks).toHaveLength(2);
    expect(r.h).toBeGreaterThan(25);
  });
});

describe('inkBoxesOf', () => {
  it('leaves out images and marks shape-tool shapes as figures', () => {
    const shapes = [
      { id: 'shape:sheet', type: 'image' },
      { id: 'shape:a', type: 'draw' },
      { id: 'shape:b', type: 'geo' },
    ];
    const editor = {
      getCurrentPageShapesSorted: () => shapes,
      getShapePageBounds: (s) => ({ x: 1, y: 2, w: s.id === 'shape:b' ? 50 : 7, h: 10 }),
    };
    expect(inkBoxesOf(editor)).toEqual([
      { id: 'shape:a', x: 1, y: 2, w: 7, h: 10 },
      { id: 'shape:b', x: 1, y: 2, w: 50, h: 10, figure: true },
    ]);
    expect(inkBoxesOf(null)).toEqual([]);
  });
});
