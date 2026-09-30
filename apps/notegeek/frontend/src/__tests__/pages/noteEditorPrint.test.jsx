import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, within, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';

vi.setConfig({ testTimeout: 20000 });

/**
 * Print / Save as PDF, wired into the editor page (DOCS/CONTEXT.md §8).
 *
 *   - "Print or save as PDF" in the ⋯ menu, and Ctrl/Cmd+P, both call
 *     window.print() with the NOTE's title as document.title, restored on
 *     afterprint;
 *   - the paper copy (NotePrintView) is on <body> with the note in it;
 *   - a sketch is exported for print BEFORE the dialog opens, and its
 *     images are in the paper copy when it does.
 *
 * Apollo is mocked at the hook level and the editor replaced by a stand-in
 * that fills `sketchApiRef`, as in noteEditorSketchTranscribe.test.jsx.
 */

const notify = vi.fn();
const exportForPrint = vi.fn();
const note = { current: null };

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      if (name === 'GetNoteById') return { data: { note: note.current }, loading: false, error: undefined };
      return { data: undefined, loading: false, error: undefined };
    },
    useMutation: () => [vi.fn().mockResolvedValue({ data: {} }), { loading: false }],
  };
});

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify }) };
});

vi.mock('../../components/notes/NoteTypeRouter', async () => {
  const actual = await vi.importActual('../../components/notes/NoteTypeRouter');
  const React = await vi.importActual('react');
  function FakeEditor({ sketchApiRef }) {
    React.useEffect(() => {
      if (!sketchApiRef) return undefined;
      sketchApiRef.current = { exportPng: vi.fn(), exportForPrint, hasShapes: () => true };
      return () => { sketchApiRef.current = null; };
    }, [sketchApiRef]);
    return <div data-testid="editor" />;
  }
  return { ...actual, default: FakeEditor };
});

import NoteEditorPage from '../../pages/NoteEditorPage';

const theme = createNoteTheme('light');

const noteOf = (type, content, extra = {}) => ({
  id: 'n1',
  title: 'Roof quote',
  content,
  type,
  tags: ['house'],
  isLocked: false,
  isEncrypted: false,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  ...extra,
});

function renderEditor() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={['/notes/n1/edit']}>
        <Routes>
          <Route path="/notes/:id/edit" element={<NoteEditorPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

const printRoot = () => document.body.querySelector(':scope > .ng-print-root');

// jsdom never loads an image, and the print waits for them (tested in
// utils/printNote.test.js), so every image here counts as already decoded.
const completeDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');

async function clickPrint() {
  const more = await screen.findByRole('button', { name: 'More note actions' });
  await act(async () => { more.click(); });
  const menu = await screen.findByRole('menu');
  await act(async () => {
    within(menu).getByRole('menuitem', { name: /print or save as pdf/i }).click();
  });
}

let printSpy;
let seenAtPrint;
beforeEach(() => {
  vi.clearAllMocks();
  document.title = 'NoteGeek';
  seenAtPrint = null;
  printSpy = vi.spyOn(window, 'print').mockImplementation(() => {
    seenAtPrint = {
      title: document.title,
      images: [...(printRoot()?.querySelectorAll('img') || [])].map((i) => i.getAttribute('src')),
      text: printRoot()?.textContent || '',
    };
  });
  URL.createObjectURL = vi.fn((b) => `blob:print-${b.size}`);
  URL.revokeObjectURL = vi.fn();
  Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
});
afterEach(() => {
  if (completeDescriptor) Object.defineProperty(HTMLImageElement.prototype, 'complete', completeDescriptor);
  printSpy.mockRestore();
  window.dispatchEvent(new Event('afterprint'));
});

describe('Print or save as PDF', () => {
  it('prints a markdown note from the ⋯ menu, titled after the note', async () => {
    note.current = noteOf('markdown', '# Scope\n\n| a | b |\n| - | - |\n| 1 | 2 |');
    renderEditor();
    await clickPrint();
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    expect(seenAtPrint.title).toBe('Roof quote');
    expect(seenAtPrint.text).toContain('Scope');
    expect(printRoot().querySelector('table')).not.toBeNull();
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('NoteGeek');
  });

  it('Ctrl+P prints the note through the same path (not the browser default)', async () => {
    note.current = noteOf('markdown', 'body text');
    renderEditor();
    await screen.findByRole('button', { name: 'More note actions' });
    const ev = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => { window.dispatchEvent(ev); });
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    expect(ev.defaultPrevented).toBe(true);
    expect(seenAtPrint.title).toBe('Roof quote');
  });

  it('the browser\'s own Print (beforeprint) gets the note title too', async () => {
    note.current = noteOf('markdown', 'body text');
    renderEditor();
    await screen.findByRole('button', { name: 'More note actions' });
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.title).toBe('Roof quote');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('NoteGeek');
  });

  it('exports a sketch before the dialog opens, and prints its images', async () => {
    note.current = noteOf('handwritten', '{"store":{}}');
    exportForPrint.mockImplementation(async () => [
      { blob: new Blob(['aaaa']), width: 1000, height: 1400 },
      { blob: new Blob(['bbbbbb']), width: 1000, height: 1400 },
    ]);
    renderEditor();
    await clickPrint();
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    expect(exportForPrint).toHaveBeenCalledTimes(1);
    expect(seenAtPrint.images).toEqual(['blob:print-4', 'blob:print-6']);
  });

  it('a sketch that cannot be exported still prints, and says why', async () => {
    note.current = noteOf('handwritten', '{"store":{}}');
    exportForPrint.mockRejectedValue(Object.assign(new Error('empty'), { code: 'empty' }));
    renderEditor();
    await clickPrint();
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    expect(seenAtPrint.text).toContain('This sketch is empty.');
  });

  it('a second click while printing does not open a second dialog', async () => {
    note.current = noteOf('handwritten', '{"store":{}}');
    let release;
    exportForPrint.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    renderEditor();
    await clickPrint();
    const ev = new KeyboardEvent('keydown', { key: 'p', metaKey: true, bubbles: true, cancelable: true });
    await act(async () => { fireEvent(window, ev); });
    await act(async () => { release([{ blob: new Blob(['a']), width: 10, height: 10 }]); });
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    expect(exportForPrint).toHaveBeenCalledTimes(1);
  });
});
