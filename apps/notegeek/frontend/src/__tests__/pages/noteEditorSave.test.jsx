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

/** Cmd/Ctrl+S — the explicit save, now that there is no Save button. */
function pressSave() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
}

/** The quiet save status (role="status", under the title). */
function stamp() {
  return screen.getByRole('status');
}

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

    // There is no Save button any more (the page autosaves; the stamp shows
    // the state). Two explicit saves in the same tick — the shape of "Back
    // fires a save, then the unmount flush fires another".
    await act(async () => {
      pressSave();
      pressSave();
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

    await act(async () => { pressSave(); });          // create, still pending
    // The second request comes in the way the real ones do — Cmd/Ctrl+S
    // again, the ⋯ menu's "Save now", or (in production) the unmount flush.
    await act(async () => { pressSave(); });
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
      pressSave();
      await Promise.resolve();
    });

    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(notify.mock.calls[0][0]).toContain('at most 100000');
    expect(notify.mock.calls[0][1]).toMatchObject({ tone: 'error' });
    // And the page itself says so — the stamp, not only a toast that goes away.
    expect(stamp()).toHaveTextContent(/not saved/i);
  });

  it('keeps saying "Not saved" through further edits, until a save succeeds', async () => {
    createNote.mockRejectedValueOnce(new Error('Network down'));
    renderEditor();
    await typeTitle('Roof quote');
    await act(async () => { pressSave(); await Promise.resolve(); });
    await waitFor(() => expect(stamp()).toHaveTextContent(/not saved/i));

    // More typing must not make a failed save look fine.
    await typeTitle('Roof quote, v2');
    expect(stamp()).toHaveTextContent(/not saved/i);

    // The next save lands, and only then does the stamp come down.
    await act(async () => { pressSave(); await Promise.resolve(); });
    await waitFor(() => expect(stamp()).toHaveTextContent(/saved · just now/i));
    expect(stamp()).toHaveAttribute('data-save-state', 'saved');
  });
});

describe('NoteEditorPage — one New', () => {
  it('/notes/new opens straight into a Markdown note: no type picker', async () => {
    renderEditor('/notes/new');
    await screen.findByPlaceholderText(/untitled/i);
    expect(screen.queryByText(/what are you writing/i)).toBeNull();
    expect(document.querySelector('[data-note-meta]')).toHaveTextContent(/^Note/);
    await typeTitle('Roof quote');
    await act(async () => { pressSave(); await Promise.resolve(); });
    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    expect(createNote.mock.calls[0][0].variables.type).toBe('markdown');
  });

  it('still opens rich text from an old ?type=text link', async () => {
    renderEditor('/notes/new?type=text');
    await screen.findByPlaceholderText(/untitled/i);
    expect(document.querySelector('[data-note-meta]')).toHaveTextContent(/^Rich text/);
  });
});

describe('NoteEditorPage — quiet when fine, loud when not', () => {
  const alertPill = () => document.querySelector('[data-save-alert]');

  it('has no alert while things are fine: the status is small metadata', async () => {
    renderEditor();
    await typeTitle('Roof quote');
    await act(async () => { pressSave(); await Promise.resolve(); });
    await waitFor(() => expect(stamp()).toHaveTextContent(/saved · just now/i));
    expect(alertPill()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('a failed save raises the loud alert with a Retry that saves again', async () => {
    createNote.mockRejectedValueOnce(new Error('Network down'));
    renderEditor();
    await typeTitle('Roof quote');
    await act(async () => { pressSave(); await Promise.resolve(); });
    await waitFor(() => expect(alertPill()).not.toBeNull());
    expect(alertPill()).toHaveAttribute('data-save-alert', 'error');
    await act(async () => { screen.getAllByRole('button', { name: 'Retry' })[0].click(); await Promise.resolve(); });
    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(alertPill()).toBeNull());
  });

  it('toasts a repeated failure once: the alert stays, the toasts do not stack', async () => {
    createNote.mockRejectedValue(new Error('Network down'));
    renderEditor();
    await typeTitle('Roof quote');
    await act(async () => { pressSave(); await Promise.resolve(); });
    await waitFor(() => expect(alertPill()).not.toBeNull());
    await act(async () => { pressSave(); await Promise.resolve(); });
    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(2));
    expect(notify.mock.calls.filter(([, o]) => o?.tone === 'error')).toHaveLength(1);
    createNote.mockReset();
  });

  it('offline with unsaved edits is loud; offline with nothing unsaved is not', async () => {
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      renderEditor();
      await screen.findByPlaceholderText(/untitled/i);
      await act(async () => { window.dispatchEvent(new Event('offline')); });
      expect(alertPill()).toBeNull();
      await typeTitle('Roof quote');
      expect(alertPill()).toHaveAttribute('data-save-alert', 'offline');
      expect(stamp()).toHaveTextContent(/offline · not saved/i);
    } finally {
      onLine.mockRestore();
    }
  });
});

describe('NoteEditorPage — the save stamp', () => {
  it('walks draft → editing → saving… → saved · just now', async () => {
    let resolveCreate;
    createNote.mockImplementationOnce(
      () => new Promise((r) => { resolveCreate = () => r({ data: { createNote: { id: 'new-1', title: 'Roof quote' } } }); })
    );
    renderEditor();
    await screen.findByPlaceholderText(/untitled/i);
    expect(stamp()).toHaveTextContent(/^draft$/i);

    await typeTitle('Roof quote');
    expect(stamp()).toHaveTextContent(/^editing$/i);

    await act(async () => { pressSave(); });
    expect(stamp()).toHaveTextContent(/saving/i);

    await act(async () => { resolveCreate(); await Promise.resolve(); });
    await waitFor(() => expect(stamp()).toHaveTextContent(/saved · just now/i));
  });

  it('autosaves two seconds after the last edit, with no button to press', async () => {
    renderEditor();
    await typeTitle('Roof quote');
    expect(createNote).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(2100); });
    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(stamp()).toHaveTextContent(/saved/i));
  });

  it('says "Nothing to save" for an empty note instead of saying nothing', async () => {
    renderEditor();
    await screen.findByPlaceholderText(/untitled/i);
    await act(async () => { pressSave(); });
    expect(stamp()).toHaveTextContent(/nothing to save/i);
    expect(createNote).not.toHaveBeenCalled();
  });

  it('"Save now" in the ⋯ menu saves', async () => {
    renderEditor();
    await typeTitle('Roof quote');
    await act(async () => { screen.getByRole('button', { name: 'More note actions' }).click(); });
    await act(async () => { screen.getByRole('menuitem', { name: /save now/i }).click(); });
    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
  });

});
