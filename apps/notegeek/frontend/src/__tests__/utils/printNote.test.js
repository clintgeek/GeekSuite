import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PAGE_HEADER_STYLE_ID,
  PRINT_TITLE_FALLBACK,
  beginPrintTitle,
  cssString,
  endPrintTitle,
  isPrintShortcut,
  mindMapOutline,
  printTitleFor,
  runPrint,
  waitForImages,
} from '../../utils/printNote';

/**
 * Print / Save as PDF (DOCS/CONTEXT.md §8). What must hold:
 *   - "Save as PDF" suggests the NOTE's title: document.title is the note's
 *     at the moment window.print() runs, and the app's own is back after
 *     `afterprint` (not after print() returns: Android returns at once);
 *   - the page's `prepare` (a sketch's export) finishes BEFORE the dialog;
 *   - a failed `prepare` still prints;
 *   - a mind map's outline is its whole content, in canvas order.
 */
describe('printNote', () => {
  let printSpy;
  beforeEach(() => {
    document.title = 'NoteGeek';
    printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
  });
  afterEach(() => {
    printSpy.mockRestore();
    endPrintTitle();
  });

  it('suggests the note title, trimmed and collapsed, or a fallback', () => {
    expect(printTitleFor('  Trip  plan\n')).toBe('Trip plan');
    expect(printTitleFor('')).toBe('Untitled note');
    expect(printTitleFor(null)).toBe('Untitled note');
  });

  it('swaps the document title and puts the original back, once', () => {
    beginPrintTitle('Groceries');
    beginPrintTitle('Groceries'); // beforeprint after runPrint: must not save "Groceries"
    expect(document.title).toBe('Groceries');
    endPrintTitle();
    expect(document.title).toBe('NoteGeek');
    endPrintTitle();
    expect(document.title).toBe('NoteGeek');
  });

  it('prints with the note title, and restores it on afterprint', async () => {
    let titleAtPrint = null;
    printSpy.mockImplementation(() => { titleAtPrint = document.title; });
    await runPrint({ title: 'Quarterly review' });
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(titleAtPrint).toBe('Quarterly review');
    // Android: print() has returned but the dialog is still up.
    expect(document.title).toBe('Quarterly review');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('NoteGeek');
  });

  it('awaits prepare before opening the dialog', async () => {
    const order = [];
    printSpy.mockImplementation(() => order.push('print'));
    await runPrint({
      title: 'Sketch',
      prepare: () => new Promise((resolve) => setTimeout(() => { order.push('prepared'); resolve(); }, 20)),
    });
    expect(order).toEqual(['prepared', 'print']);
  });

  it('still prints when prepare fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await runPrint({ title: 'Sketch', prepare: () => Promise.reject(new Error('boom')) });
    expect(printSpy).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('waits for the print view\'s images before the dialog opens', async () => {
    const root = document.createElement('div');
    const img = document.createElement('img');
    let loaded = false;
    Object.defineProperty(img, 'complete', { get: () => loaded });
    root.appendChild(img);
    let done = false;
    const waiting = waitForImages(root, 10000).then(() => { done = true; });
    await new Promise((r) => setTimeout(r, 80));
    expect(done).toBe(false);
    loaded = true;
    img.dispatchEvent(new Event('load'));
    await waiting;
    expect(done).toBe(true);
  });

  it('gives up waiting on an image after the timeout', async () => {
    const root = document.createElement('div');
    const img = document.createElement('img');
    Object.defineProperty(img, 'complete', { get: () => false });
    root.appendChild(img);
    const t0 = Date.now();
    await waitForImages(root, 60);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('knows Ctrl+P and Cmd+P, and nothing near them', () => {
    expect(isPrintShortcut({ ctrlKey: true, key: 'p' })).toBe(true);
    expect(isPrintShortcut({ metaKey: true, key: 'P' })).toBe(true);
    expect(isPrintShortcut({ ctrlKey: true, shiftKey: true, key: 'p' })).toBe(false);
    expect(isPrintShortcut({ ctrlKey: true, altKey: true, key: 'p' })).toBe(false);
    expect(isPrintShortcut({ key: 'p' })).toBe(false);
    expect(isPrintShortcut({ ctrlKey: true, key: 's' })).toBe(false);
  });
});

describe('mindMapOutline', () => {
  const node = (id, label, y, isRoot = false) => ({ id, position: { x: 0, y }, data: { label, isRoot } });
  const edge = (s, t) => ({ id: `${s}-${t}`, source: s, target: t });

  it('nests children under their parent, top to bottom as on the canvas', () => {
    const content = JSON.stringify({
      nodes: [node('0', 'Trip', 200, true), node('2', 'Food', 300), node('1', 'Travel', 100), node('3', 'Train', 50)],
      edges: [edge('0', '2'), edge('0', '1'), edge('1', '3')],
    });
    expect(mindMapOutline(content)).toEqual([
      {
        id: '0', label: 'Trip', children: [
          { id: '1', label: 'Travel', children: [{ id: '3', label: 'Train', children: [] }] },
          { id: '2', label: 'Food', children: [] },
        ],
      },
    ]);
  });

  it('keeps nodes no edge reaches, and survives a cycle', () => {
    const content = JSON.stringify({
      nodes: [node('0', 'Root', 0, true), node('1', 'A', 10), node('9', 'Loose', 20)],
      edges: [edge('0', '1'), edge('1', '0')],
    });
    const out = mindMapOutline(content);
    expect(out.map((n) => n.label)).toEqual(['Root', 'Loose']);
    expect(out[0].children.map((n) => n.label)).toEqual(['A']);
    expect(out[0].children[0].children).toEqual([]);
  });

  it('is empty for anything that is not a mind map', () => {
    expect(mindMapOutline('not json')).toEqual([]);
    expect(mindMapOutline('{}')).toEqual([]);
    expect(mindMapOutline('')).toEqual([]);
  });
});

describe('the running header and footer', () => {
  afterEach(() => endPrintTitle());

  it('the note title goes in the page header of pages 2+ while printing, and is removed after', () => {
    beginPrintTitle('Trip notes');
    const el = document.getElementById(PAGE_HEADER_STYLE_ID);
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('@top-left { content: "Trip notes"');
    expect(el.textContent).toContain('@page :first { @top-left { content: none; } }');
    endPrintTitle();
    expect(document.getElementById(PAGE_HEADER_STYLE_ID)).toBeNull();
  });

  it('a title with quotes, backslashes or line breaks cannot break out of the CSS string', () => {
    expect(cssString('Say "hi"\\now\nplease')).toBe('"Say \\"hi\\"\\\\now please"');
  });

  it('an untitled note still gets a header, not an empty string', () => {
    beginPrintTitle('   ');
    expect(document.getElementById(PAGE_HEADER_STYLE_ID).textContent).toContain(`content: "${PRINT_TITLE_FALLBACK}"`);
  });

  it('the stylesheet defines the page-number footer — which is also what turns off Chrome’s date/URL headers', async () => {
    // Read from disk: vitest stubs CSS imports (even ?raw) to an empty string.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(process.cwd(), 'src/components/notes/notePrint.css'), 'utf8');
    expect(css).toMatch(/@bottom-right\s*\{\s*content: "Page " counter\(page\) " of " counter\(pages\)/);
  });
});
