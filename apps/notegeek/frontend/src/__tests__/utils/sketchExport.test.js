import { describe, it, expect, vi } from 'vitest';
import {
  EXPORT_MAX_EDGE,
  EXPORT_MAX_BYTES,
  exportSketchPng,
  exportSketchForPrint,
  PRINT_MAX_EDGE,
  fitWithin,
  flattenOnWhite,
  sketchExportOptions,
  sketchHasShapes,
} from '../../utils/sketchExport';
import {
  backLinkLine,
  derivedNoteContent,
  derivedNoteTitle,
  firstHeading,
  journalMarkAsMarkdown,
  plainTextAsMarkdown,
} from '../../utils/sketchToText';

/** The page image, DOCS/HANDWRITING.md §2 step 2. */
describe('sketch export', () => {
  it('knows an empty sketch from one with ink', () => {
    expect(sketchHasShapes('')).toBe(false);
    expect(sketchHasShapes(null)).toBe(false);
    expect(sketchHasShapes(JSON.stringify({ store: { 'page:page': { typeName: 'page' } } }))).toBe(false);
    expect(sketchHasShapes(JSON.stringify({ store: { 'shape:a': { typeName: 'shape', type: 'draw' } } }))).toBe(true);
  });

  it('asks tldraw for light ink, no tldraw background, and a scale that fits 2000px at its 2x', () => {
    const opts = sketchExportOptions({ w: 3000, h: 1200 });
    expect(opts).toMatchObject({ background: false, darkMode: false, padding: 32 });
    expect(opts.scale * (3000 + 64) * 2).toBeLessThanOrEqual(EXPORT_MAX_EDGE + 0.001);
    // A small sketch is not blown up.
    expect(sketchExportOptions({ w: 200, h: 100 }).scale).toBe(1);
  });

  it('scales down, never up, to a 2000px longest edge', () => {
    expect(fitWithin(4000, 1000)).toEqual({ width: 2000, height: 500 });
    expect(fitWithin(1000, 3000)).toEqual({ width: 667, height: 2000 });
    expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 });
    expect(EXPORT_MAX_EDGE).toBe(2000);
  });

  it('flattens onto opaque white before drawing the ink', async () => {
    const ops = [];
    const canvas = {
      getContext: () => ({
        set fillStyle(v) { ops.push(['fill', v]); },
        fillRect: (...a) => ops.push(['rect', ...a]),
        drawImage: (_i, ...a) => ops.push(['draw', ...a]),
      }),
      toBlob: (cb, type) => cb(new Blob(['x'], { type })),
    };
    const out = await flattenOnWhite(new Blob(['raw']), {
      loadImage: async () => ({ width: 2400, height: 1200 }),
      createCanvas: () => canvas,
    });
    expect(ops).toEqual([['fill', '#ffffff'], ['rect', 0, 0, 2000, 1000], ['draw', 0, 0, 2000, 1000]]);
    expect(out).toMatchObject({ width: 2000, height: 1000 });
    expect(out.blob.type).toBe('image/png');
  });

  it('refuses a page over 6 MB, with a clear message, before anything is sent', async () => {
    const editor = { getCurrentPageShapeIds: () => new Set(['shape:a']), getCurrentPageBounds: () => ({ w: 10, h: 10 }) };
    const big = { size: EXPORT_MAX_BYTES + 1 };
    const toBase64 = vi.fn();
    const err = await exportSketchPng(editor, {
      exportToBlob: async () => new Blob(['raw']),
      flatten: async () => ({ blob: big, width: 2000, height: 2000 }),
      toBase64,
    }).catch((e) => e);
    expect(err.code).toBe('too_large');
    expect(err.message).toMatch(/limit is 6 MB/);
    expect(toBase64).not.toHaveBeenCalled();
    expect(EXPORT_MAX_BYTES).toBe(6 * 1024 * 1024);
  });

  it('a page at the limit goes through', async () => {
    const editor = { getCurrentPageShapeIds: () => new Set(['shape:a']), getCurrentPageBounds: () => ({ w: 10, h: 10 }) };
    const out = await exportSketchPng(editor, {
      exportToBlob: async () => new Blob(['raw']),
      flatten: async () => ({ blob: { size: EXPORT_MAX_BYTES }, width: 10, height: 10 }),
      toBase64: async () => 'iVBORw0KGgo',
    });
    expect(out).toMatchObject({ base64: 'iVBORw0KGgo', mediaType: 'image/png' });
  });
});

/**
 * Template sheets (DOCS/TEMPLATES_SPEC.md T6): a template is a locked image
 * shape in the drawing. A person's copy (share, print) has it; the image a
 * model reads does not, and is framed on the ink alone.
 */
describe('a template sheet in the exported image', () => {
  const SHEET = { id: 'shape:paper-template', type: 'image', meta: { paperTemplate: 'meeting' } };
  const boxes = {
    'shape:paper-template': { x: 0, y: 0, w: 1000, h: 1400 },
    'shape:a': { x: 40, y: 60, w: 300, h: 100 },
    'shape:b': { x: 340, y: 160, w: 300, h: 200 },
  };
  const editorFor = (extra = []) => {
    const shapes = [...extra, { id: 'shape:a', type: 'draw' }, { id: 'shape:b', type: 'draw' }];
    return {
      getCurrentPageShapeIds: () => new Set(shapes.map((s) => s.id)),
      getCurrentPageShapesSorted: () => shapes,
      getShape: (id) => shapes.find((s) => s.id === id),
      getCurrentPageBounds: () => (extra.length ? { x: 0, y: 0, w: 1000, h: 1400 } : { x: 40, y: 60, w: 600, h: 300 }),
      getShapePageBounds: (id) => boxes[id] || { x: 0, y: 0, w: 800, h: 1100 },
    };
  };
  const deps = (calls) => ({
    exportToBlob: async (args) => { calls.push({ ids: args.ids, format: args.format, opts: args.opts }); return new Blob(['raw']); },
    flatten: async () => ({ blob: new Blob(['flat']), width: 600, height: 300 }),
    toBase64: async () => 'iVBORw0KGgo',
  });

  it('the image a model reads is the ink alone, framed on the ink: the same with and without a sheet', async () => {
    const plain = [];
    const templated = [];
    const outA = await exportSketchPng(editorFor(), deps(plain));
    const outB = await exportSketchPng(editorFor([SHEET]), deps(templated));
    expect(templated).toEqual(plain);
    expect(templated).toEqual([{ ids: ['shape:a', 'shape:b'], format: 'png', opts: sketchExportOptions({ x: 40, y: 60, w: 600, h: 300 }) }]);
    expect({ ...outB, blob: null }).toEqual({ ...outA, blob: null });
  });

  it('a sketch that is only a sheet has nothing to read', async () => {
    const editor = editorFor([SHEET]);
    editor.getCurrentPageShapeIds = () => new Set([SHEET.id]);
    const err = await exportSketchPng(editor, deps([])).catch((e) => e);
    expect(err.code).toBe('empty');
  });

  it('a copy for a person (`sheet: true`) has the sheet, at the whole page\'s size', async () => {
    const calls = [];
    await exportSketchPng(editorFor([SHEET]), { ...deps(calls), sheet: true });
    expect(calls).toEqual([{ ids: ['shape:paper-template', 'shape:a', 'shape:b'], format: 'png', opts: sketchExportOptions({ w: 1000, h: 1400 }) }]);
  });

  it('print has the sheet, as one page with its ink: a sheet is not a photographed page', async () => {
    const calls = [];
    const pages = await exportSketchForPrint(editorFor([SHEET]), deps(calls));
    expect(pages).toHaveLength(1);
    expect(calls[0].ids).toEqual(['shape:paper-template', 'shape:a', 'shape:b']);
  });

  it('a photo sketch with a sheet still prints one page per photo', async () => {
    const calls = [];
    const photo = { id: 'shape:photo', type: 'image', meta: {} };
    boxes['shape:photo'] = { x: 2000, y: 0, w: 800, h: 1100 };
    const pages = await exportSketchForPrint(editorFor([SHEET, photo]), deps(calls));
    expect(calls[0].ids).toEqual(['shape:photo']);
    expect(calls[1].ids).toEqual(['shape:paper-template', 'shape:a', 'shape:b']);
    expect(pages).toHaveLength(2);
  });
});

describe('sketch export for print', () => {
  const editorWith = (shapes) => ({
    getCurrentPageShapesSorted: () => shapes.map(({ id, type }) => ({ id, type })),
    getCurrentPageShapeIds: () => new Set(shapes.map((s) => s.id)),
    getShapePageBounds: (id) => shapes.find((s) => s.id === id)?.b || null,
    getCurrentPageBounds: () => ({ w: 100, h: 100 }),
  });
  const run = (editor) => {
    const calls = [];
    const flatten = vi.fn(async (_raw, { maxEdge }) => ({ blob: { size: 9e9 }, width: maxEdge, height: 1 }));
    const exportToBlob = vi.fn(async (args) => { calls.push(args); return new Blob(['raw']); });
    return exportSketchForPrint(editor, { exportToBlob, flatten }).then((pages) => ({ pages, calls, flatten }));
  };

  it('a plain sketch is one image of all its ink, bigger than the vision export and never size-capped', async () => {
    const { pages, calls } = await run(editorWith([
      { id: 'shape:a', type: 'draw', b: { x: 0, y: 0, w: 50, h: 50 } },
      { id: 'shape:b', type: 'geo', b: { x: 60, y: 60, w: 20, h: 20 } },
    ]));
    expect(pages).toHaveLength(1);
    expect(pages[0].width).toBe(PRINT_MAX_EDGE); // the 2000px cap did not apply
    expect(calls[0].ids.sort()).toEqual(['shape:a', 'shape:b']);
    expect(PRINT_MAX_EDGE).toBeGreaterThan(EXPORT_MAX_EDGE);
  });

  it('a photo sketch prints one image per photographed page, with the ink drawn on it', async () => {
    const { pages, calls } = await run(editorWith([
      { id: 'shape:p2', type: 'image', b: { x: 0, y: 1100, w: 1000, h: 1000 } },
      { id: 'shape:p1', type: 'image', b: { x: 0, y: 0, w: 1000, h: 1000 } },
      { id: 'shape:ink1', type: 'draw', b: { x: 100, y: 100, w: 10, h: 10 } },
      { id: 'shape:ink2', type: 'draw', b: { x: 100, y: 1500, w: 10, h: 10 } },
      { id: 'shape:far', type: 'draw', b: { x: 5000, y: 5000, w: 10, h: 10 } },
    ]));
    expect(pages).toHaveLength(3);
    expect(calls.map((c) => c.ids)).toEqual([
      ['shape:p1', 'shape:ink1'],
      ['shape:p2', 'shape:ink2'],
      ['shape:far'],
    ]);
  });

  it('refuses an empty sketch', async () => {
    const err = await run(editorWith([])).catch((e) => e);
    expect(err.code).toBe('empty');
  });
});

/** The note the handwriting becomes, §2 step 5. */
describe('the derived note', () => {
  it('is titled from the composed first heading, or after the sketch', () => {
    expect(firstHeading('intro\n\n## Roof quote\n\n# Later')).toBe('Roof quote');
    expect(derivedNoteTitle({ sketchTitle: 'Tuesday', body: '# Roof quote\n\n- call', composed: true })).toBe('Roof quote');
    expect(derivedNoteTitle({ sketchTitle: 'Tuesday', body: 'no heading here', composed: true })).toBe('From handwritten note: Tuesday');
    // The plain path never promotes a line to a title, even one that looks like a heading.
    expect(derivedNoteTitle({ sketchTitle: 'Tuesday', body: '# written with a hash', composed: false })).toBe('From handwritten note: Tuesday');
    expect(derivedNoteTitle({ sketchTitle: '  ', body: '', composed: false })).toBe('From handwritten note: Untitled');
  });

  it('opens with a link back to the sketch', () => {
    expect(backLinkLine({ sketchId: 'n3', sketchTitle: 'Sketch: [draft] flow' })).toBe('From handwritten note: [Sketch: \\[draft\\] flow](/notes/n3)');
    const body = derivedNoteContent({ sketchId: 'n3', sketchTitle: 'Tuesday', body: '# Doc\n\ntext', composed: true });
    expect(body.split('\n')[0]).toBe('From handwritten note: [Tuesday](/notes/n3)');
    expect(body).toContain('# Doc\n\ntext');
  });

  it('photographed pages (§3) say "From photos", and link back the same way', () => {
    expect(backLinkLine({ sketchId: 'p1', sketchTitle: 'Photos · 27 Sep 2026', source: 'photo' }))
      .toBe('From photos: [Photos · 27 Sep 2026](/notes/p1)');
    expect(derivedNoteTitle({ sketchTitle: 'Kitchen', body: 'no heading', composed: false, source: 'photo' })).toBe('From photos: Kitchen');
    expect(derivedNoteTitle({ sketchTitle: 'Kitchen', body: '# Plan', composed: true, source: 'photo' })).toBe('Plan');
    const body = derivedNoteContent({ sketchId: 'p1', sketchTitle: 'Kitchen', body: 'a\nb', composed: false, source: 'photo' });
    expect(body).toBe('From photos: [Kitchen](/notes/p1)\n\na  \nb\n');
  });

  it('keeps a plain transcript\'s line breaks in Markdown, and changes no words', () => {
    const text = 'milk\neggs\n\n-> call roofer\nquote by Fri';
    expect(plainTextAsMarkdown(text)).toBe('milk  \neggs\n\n-> call roofer  \nquote by Fri');
    expect(plainTextAsMarkdown(text).replace(/ {2}$/gm, '')).toBe(text);
  });

  it('journal marks become the Markdown that draws them (BUJO_HANDWRITING.md, 2026-11-14)', () => {
    // Until then "[ ] quote by Fri" was kept as typed, and rendered as stray brackets.
    expect(journalMarkAsMarkdown('[ ] quote by Fri')).toBe('- [ ] quote by Fri');
    expect(journalMarkAsMarkdown('[x] pay rent')).toBe('- [x] pay rent');
    expect(journalMarkAsMarkdown('- [ ] already markdown')).toBe('- [ ] already markdown');
    expect(journalMarkAsMarkdown('x renew passport')).toBe('- [x] renew passport');
    expect(journalMarkAsMarkdown('o dentist 2pm')).toBe('- ○ dentist 2pm');
    expect(journalMarkAsMarkdown('  x indented')).toBe('  - [x] indented');
  });

  it('what is already Markdown, or plain words, is left exactly alone', () => {
    for (const line of ['* a task', '- a note', '# Heading', '> a quotation', '1. first', '! important', '? a question',
      'xylophone lessons', 'ok then', 'x', '**bold** words', '#work stuff']) {
      expect(journalMarkAsMarkdown(line)).toBe(line);
    }
  });
});

describe('a page too long to read well (review 2.7)', () => {
  it('flags ink whose longest edge shrinks below half a pixel per page unit', async () => {
    const { tooLongToRead, readableScale, MIN_READABLE_SCALE } = await import('../../utils/sketchExport');
    expect(MIN_READABLE_SCALE).toBe(0.5);
    expect(tooLongToRead({ w: 900, h: 1400 })).toBe(false); // about two phone screens
    expect(tooLongToRead({ w: 900, h: 4200 })).toBe(true); // a meeting's worth
    expect(readableScale({ w: 10, h: 10 })).toBe(2); // never above tldraw's 2x
  });
});
