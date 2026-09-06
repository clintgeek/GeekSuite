import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';

/**
 * Regression tests for the save path found broken in the 2026-09-05 going-over.
 *
 * `NoteEditorPage` had no guard against a save already being in flight, and
 * three separate call sites that could fire one: the 2s autosave, Cmd/Ctrl+S,
 * and — the one that bit — `handleBack`, which fires a save without awaiting it
 * and then calls `navigate(-1)`. The navigation unmounts the page, the
 * unmount-flush effect re-reads a `dirty` the in-flight save has not cleared
 * yet, and fires a *second* save. On a new note both saw `savedNoteId === null`
 * and both took the create branch: **one click on Back made two notes.**
 *
 * The other half is the discard path: "Discard" on an unsaved note navigated
 * away, and the unmount flush then dutifully saved the draft that had just been
 * discarded.
 *
 * These drive the real component. Apollo is mocked at the hook level rather
 * than through MockedProvider so the tests can count mutation calls, which is
 * the whole point.
 */

const createNote = vi.fn();
const updateNote = vi.fn();
const notify = vi.fn();

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: () => ({ data: undefined, loading: false, error: undefined }),
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      return [name === 'CreateNote' ? createNote : updateNote, { loading: false }];
    },
  };
});

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify }) };
});

// The editors pull in TipTap / ReactFlow / tldraw; none of that is under test.
vi.mock('../../components/notes/NoteTypeRouter', async () => {
  const actual = await vi.importActual('../../components/notes/NoteTypeRouter');
  return { ...actual, default: () => null };
});

import NoteEditorPage from '../../pages/NoteEditorPage';

const theme = createNoteTheme('light');

function renderEditor(route = '/notes/new?type=text') {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/notes/new" element={<NoteEditorPage />} />
          <Route path="/notes" element={<div>notes list</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  createNote.mockResolvedValue({ data: { createNote: { id: 'new-1', title: 'Untitled Note' } } });
  updateNote.mockResolvedValue({ data: { updateNote: { id: 'new-1', title: 'Untitled Note' } } });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Type into the title field, which is the one control that is always present. */
async function typeTitle(text) {
  const field = await screen.findByPlaceholderText(/untitled/i);
  await act(async () => {
    // `fireEvent`-style direct set: the MUI input is controlled.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    setter.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return field;
}

describe('NoteEditorPage — one save at a time', () => {
  it('creates the note once when two saves are requested back to back', async () => {
    renderEditor();
    await typeTitle('Roof quote');

    const saveButtons = screen.getAllByRole('button', { name: /^save$/i });
    await act(async () => {
      // Two clicks in the same tick — the shape of "Back fires a save, then the
      // unmount flush fires another".
      saveButtons[0].click();
      saveButtons[0].click();
      await Promise.resolve();
    });

    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    // The replay lands as an UPDATE, because the id is recorded on a ref the
    // moment the create resolves — not on state a later call cannot read.
    expect(createNote).toHaveBeenCalledTimes(1);
  });

  it('routes a queued second save to updateNote, not a second createNote', async () => {
    let resolveCreate;
    createNote.mockImplementationOnce(
      () => new Promise((r) => { resolveCreate = () => r({ data: { createNote: { id: 'new-1', title: 'Roof quote' } } }); })
    );

    renderEditor();
    await typeTitle('Roof quote');

    const save = screen.getAllByRole('button', { name: /^save$/i })[0];
    await act(async () => { save.click(); });          // create, still pending
    // The Save button disables itself while a save runs, so the second request
    // comes in the way the real ones did — Cmd/Ctrl+S, which is not disabled,
    // and (in production) the unmount flush.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    });
    await act(async () => { resolveCreate(); await Promise.resolve(); });

    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
    // The point of the whole guard: the queued save UPDATES the note the first
    // one created. Before it, both took the create branch off a `savedNoteId`
    // state neither had seen updated, and made two notes.
    expect(createNote).toHaveBeenCalledTimes(1);
    expect(updateNote.mock.calls[0][0].variables.id).toBe('new-1');
  });
});

describe('NoteEditorPage — save failures are visible', () => {
  it('surfaces the gateway’s validation detail, not the flat "Invalid input"', async () => {
    const err = new Error('Invalid input');
    err.graphQLErrors = [
      {
        message: 'Invalid input',
        extensions: {
          code: 'BAD_USER_INPUT',
          details: [{ path: 'content', message: 'String must contain at most 100000 character(s)' }],
        },
      },
    ];
    createNote.mockRejectedValueOnce(err);

    renderEditor();
    await typeTitle('Roof quote');
    await act(async () => {
      screen.getAllByRole('button', { name: /^save$/i })[0].click();
      await Promise.resolve();
    });

    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(notify.mock.calls[0][0]).toContain('at most 100000');
    expect(notify.mock.calls[0][1]).toMatchObject({ tone: 'error' });
  });

});
