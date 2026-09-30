import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createNoteTheme } from '../../../theme/createAppTheme';

/**
 * Markdown import, wired (DOCS/CONTEXT.md §9): a drop, or the picker the New
 * surfaces open, becomes one `createNote` per file — Markdown, titled from
 * the opening heading — and the writer is told what landed and what was
 * skipped. Apollo and the toast are mocked at the hook level.
 */

const createNote = vi.fn();
const notify = vi.fn();

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      return [name === 'CreateNote' ? createNote : vi.fn(), { loading: false }];
    },
  };
});

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify }) };
});

import NoteImporter from '../../../components/new/NoteImporter';
import useImportStore, { openImportPicker } from '../../../store/importStore';

const theme = createNoteTheme('light');

function renderAt(path) {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <NoteImporter />
        <Routes>
          <Route path="/notes" element={<div>the list</div>} />
          <Route path="/notes/new" element={<div>blank note</div>} />
          <Route path="/notes/:id/edit" element={<div>an editor</div>} />
          <Route path="/notes/:id" element={<div>opened note</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

const md = (name, body) => new File([body], name, { type: '' });

/** jsdom has no DragEvent/DataTransfer; a plain event carries them. */
function drag(type, files = []) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', {
    value: { types: ['Files'], files, dropEffect: 'none' },
  });
  window.dispatchEvent(e);
  return e;
}

let nextId = 0;
beforeEach(() => {
  vi.clearAllMocks();
  nextId = 0;
  useImportStore.setState({ editorDropOk: false });
  createNote.mockImplementation(async ({ variables }) => ({
    data: { createNote: { id: `imp-${++nextId}`, title: variables.title } },
  }));
});

describe('dropping files', () => {
  it('one .md becomes one Markdown note, titled from its heading, and opens', async () => {
    renderAt('/notes');
    let e;
    await act(async () => { e = drag('drop', [md('trip.md', '# Lisbon trip\n\nDay one.')]); });
    expect(e.defaultPrevented).toBe(true); // not the browser's "open the file"
    await screen.findByText('opened note');
    expect(createNote).toHaveBeenCalledTimes(1);
    expect(createNote).toHaveBeenCalledWith({
      variables: { title: 'Lisbon trip', content: 'Day one.', type: 'markdown', tags: [] },
    });
    expect(notify).toHaveBeenCalledWith('Imported “Lisbon trip”.', { tone: 'success' });
  });

  it('several files stay on the list and say how many landed', async () => {
    renderAt('/notes');
    await act(async () => { drag('drop', [md('a.md', 'alpha'), md('b.txt', 'beta')]); });
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Imported 2 notes.', { tone: 'success' }));
    expect(createNote.mock.calls.map((c) => c[0].variables.title)).toEqual(['a', 'b']);
    expect(screen.getByText('the list')).toBeInTheDocument();
  });

  it('skips what is not Markdown or text, with a toast, and imports the rest', async () => {
    renderAt('/notes');
    await act(async () => {
      drag('drop', [new File(['x'], 'photo.png', { type: 'image/png' }), md('keep.md', 'kept')]);
    });
    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^Skipped photo\.png: only \.md, \.markdown and \.txt/), { tone: 'warning' });
    expect(createNote.mock.calls[0][0].variables.title).toBe('keep');
  });

  it('a drop of nothing importable creates nothing', async () => {
    renderAt('/notes');
    await act(async () => { drag('drop', [new File(['x'], 'a.pdf', { type: 'application/pdf' })]); });
    expect(createNote).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Skipped a\.pdf/), { tone: 'warning' });
  });

  it('a file too long for a note is refused before it is sent', async () => {
    renderAt('/notes');
    await act(async () => { drag('drop', [md('huge.md', 'x'.repeat(100_001))]); });
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/huge\.md is too long/), { tone: 'error' }));
    expect(createNote).not.toHaveBeenCalled();
  });

  it('a failed save is reported, not swallowed', async () => {
    createNote.mockRejectedValueOnce(new Error('Network down'));
    renderAt('/notes');
    await act(async () => { drag('drop', [md('a.md', 'alpha')]); });
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^a\.md: /), { tone: 'error' }));
  });

  it('shows the drop zone while files are over the page', async () => {
    renderAt('/notes');
    expect(document.querySelector('[data-import-dropzone]')).toBeNull();
    await act(async () => { drag('dragenter'); });
    expect(document.querySelector('[data-import-dropzone]')).not.toBeNull();
    expect(screen.getByText('Drop to make notes')).toBeInTheDocument();
    await act(async () => { drag('dragleave'); });
    expect(document.querySelector('[data-import-dropzone]')).toBeNull();
  });

  it('leaves drops alone on a note that is being written', async () => {
    renderAt('/notes/n1/edit');
    let e;
    await act(async () => { e = drag('drop', [md('a.md', 'alpha')]); });
    expect(e.defaultPrevented).toBe(false);
    expect(createNote).not.toHaveBeenCalled();
  });

  it('takes a drop on a blank new note only while the editor says it is empty', async () => {
    renderAt('/notes/new');
    await act(async () => { drag('drop', [md('a.md', 'alpha')]); });
    expect(createNote).not.toHaveBeenCalled();
    await act(async () => { useImportStore.getState().setEditorDropOk(true); });
    await act(async () => { drag('drop', [md('a.md', 'alpha')]); });
    await screen.findByText('opened note');
    expect(createNote).toHaveBeenCalledTimes(1);
  });
});

describe('the picker', () => {
  it('openImportPicker clicks the hidden multi-file input, and its files import', async () => {
    renderAt('/notes');
    const input = document.querySelector('input[data-import-input]');
    expect(input).toHaveAttribute('accept', '.md,.markdown,.txt,text/markdown,text/plain');
    expect(input.multiple).toBe(true);
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    expect(openImportPicker()).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);

    Object.defineProperty(input, 'files', { configurable: true, value: [md('picked.md', '# Picked\n\nbody')] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await screen.findByText('opened note');
    expect(createNote.mock.calls[0][0].variables).toMatchObject({ title: 'Picked', content: 'body', type: 'markdown' });
  });
});
