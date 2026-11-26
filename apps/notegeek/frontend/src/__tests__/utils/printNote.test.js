import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PAGE_HEADER_STYLE_ID,
  PRINT_TITLE_FALLBACK,
  beginPrintTitle,
  cssString,
  endPrintTitle,
  isPrintShortcut,
  printTitleFor,
  runPrint,
  waitForImages,
  waitForDiagrams,
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

  it('waits for diagrams still being drawn before the dialog opens', async () => {
    const root = document.createElement('div');
    const block = document.createElement('div');
    block.setAttribute('data-mermaid-pending', '');
    root.appendChild(block);
    document.body.appendChild(root);
    const order = [];
    printSpy.mockImplementation(() => order.push('print'));
    const printing = runPrint({ title: 'Flow', getRoot: () => root });
    await new Promise((r) => setTimeout(r, 80));
    expect(order).toEqual([]);
    order.push('drawn');
    block.removeAttribute('data-mermaid-pending');
    await printing;
    expect(order).toEqual(['drawn', 'print']);
    root.remove();
  });

  it('gives up waiting on a diagram after the timeout, and does not wait when there is none', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-mermaid-pending></div>';
    const t0 = Date.now();
    await waitForDiagrams(root, 60);
    expect(Date.now() - t0).toBeLessThan(2000);
    await waitForDiagrams(document.createElement('div'), 60000);
    await waitForDiagrams(null);
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
