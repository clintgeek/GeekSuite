import { describe, it, expect, vi } from 'vitest';
import {
  EXPORT_MAX_EDGE,
  EXPORT_MAX_BYTES,
  exportSketchPng,
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

/** The note the handwriting becomes, §2 step 5. */
describe('the derived note', () => {
  it('is titled from the composed first heading, or after the sketch', () => {
    expect(firstHeading('intro\n\n## Roof quote\n\n# Later')).toBe('Roof quote');
    expect(derivedNoteTitle({ sketchTitle: 'Tuesday', body: '# Roof quote\n\n- call', composed: true })).toBe('Roof quote');
    expect(derivedNoteTitle({ sketchTitle: 'Tuesday', body: 'no heading here', composed: true })).toBe('From sketch: Tuesday');
    // The plain path never promotes a line to a title, even one that looks like a heading.
    expect(derivedNoteTitle({ sketchTitle: 'Tuesday', body: '# written with a hash', composed: false })).toBe('From sketch: Tuesday');
    expect(derivedNoteTitle({ sketchTitle: '  ', body: '', composed: false })).toBe('From sketch: Untitled sketch');
  });

  it('opens with a link back to the sketch', () => {
    expect(backLinkLine({ sketchId: 'n3', sketchTitle: 'Sketch: [draft] flow' })).toBe('From sketch: [Sketch: \\[draft\\] flow](/notes/n3)');
    const body = derivedNoteContent({ sketchId: 'n3', sketchTitle: 'Tuesday', body: '# Doc\n\ntext', composed: true });
    expect(body.split('\n')[0]).toBe('From sketch: [Tuesday](/notes/n3)');
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

  it('keeps a plain transcript\'s line breaks in Markdown, and changes nothing else', () => {
    const text = 'milk\neggs\n\n-> call roofer\n[ ] quote by Fri';
    expect(plainTextAsMarkdown(text)).toBe('milk  \neggs\n\n-> call roofer  \n[ ] quote by Fri');
    expect(plainTextAsMarkdown(text).replace(/ {2}$/gm, '')).toBe(text);
  });
});
