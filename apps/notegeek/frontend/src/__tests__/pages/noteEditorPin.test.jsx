import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';

/**
 * The editor's Pin/Unpin menu item, wired through `usePinNote` into the real
 * `setNotePinned` mutation (NoteEditorPage's `handlePin`).
 *
 * Two things matter: the mutation is called with THIS note's id and the
 * FLIPPED pinned flag (not the current one — sending the current value
 * would be a no-op pin/unpin), and the menu's own label flips right away —
 * `handlePin` sets a local override before awaiting the mutation, precisely
 * because a note that autosaved but was never navigated to keeps `id ===
 * 'new'` in the URL, so `GetNoteById` stays skipped and the label would
 * otherwise never move.
 *
 * Apollo is mocked at the hook level, as in noteEditorCompose.test.jsx, so
 * the mutation call can be inspected directly.
 */

const updateNote = vi.fn();
const createNote = vi.fn();
const setNotePinned = vi.fn();
const notify = vi.fn();

const note = (extra = {}) => ({
  id: 'note-1',
  title: 'Roof quote',
  content: 'call back',
  type: 'markdown',
  tags: ['house'],
  isLocked: false,
  isEncrypted: false,
  pinned: false,
  pinnedAt: null,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  ...extra,
});

let currentNote;

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      if (name === 'GetNoteById') return { data: { note: currentNote }, loading: false, error: undefined };
      return { data: undefined, loading: false, error: undefined };
    },
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      const fn = { CreateNote: createNote, UpdateNote: updateNote, SetNotePinned: setNotePinned }[name]
        || vi.fn().mockResolvedValue({ data: {} });
      return [fn, { loading: false }];
    },
  };
});

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify }) };
});

vi.mock('../../components/notes/NoteTypeRouter', async () => {
  const actual = await vi.importActual('../../components/notes/NoteTypeRouter');
  return { ...actual, default: () => null };
});

import NoteEditorPage from '../../pages/NoteEditorPage';

const theme = createNoteTheme('light');

function renderEditor() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={['/notes/note-1/edit']}>
        <Routes>
          <Route path="/notes/:id/edit" element={<NoteEditorPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

async function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /more note actions/i }));
  return screen.findByRole('menu');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NoteEditorPage — Pin/Unpin wiring', () => {
  it("calls setNotePinned with this note's id and pinned: true, and the label flips to Unpin", async () => {
    currentNote = note({ pinned: false });
    setNotePinned.mockResolvedValue({ data: { setNotePinned: { id: 'note-1', pinned: true, pinnedAt: '2026-09-29T00:00:00.000Z' } } });
    renderEditor();

    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Pin' }));

    await waitFor(() => expect(setNotePinned).toHaveBeenCalledTimes(1));
    expect(setNotePinned.mock.calls[0][0]).toMatchObject({ variables: { id: 'note-1', pinned: true } });

    const menu2 = await openMenu();
    expect(within(menu2).getByRole('menuitem', { name: 'Unpin' })).toBeInTheDocument();
    expect(within(menu2).queryByRole('menuitem', { name: 'Pin' })).not.toBeInTheDocument();
  });

  it('calls setNotePinned with pinned: false on an already-pinned note, and the label flips back to Pin', async () => {
    currentNote = note({ pinned: true, pinnedAt: '2026-09-28T00:00:00.000Z' });
    setNotePinned.mockResolvedValue({ data: { setNotePinned: { id: 'note-1', pinned: false, pinnedAt: null } } });
    renderEditor();

    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Unpin' }));

    await waitFor(() => expect(setNotePinned).toHaveBeenCalledTimes(1));
    expect(setNotePinned.mock.calls[0][0]).toMatchObject({ variables: { id: 'note-1', pinned: false } });

    const menu2 = await openMenu();
    expect(within(menu2).getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument();
    expect(within(menu2).queryByRole('menuitem', { name: 'Unpin' })).not.toBeInTheDocument();
  });

  it('toasts on failure and leaves the label reverted to its starting state', async () => {
    currentNote = note({ pinned: false });
    setNotePinned.mockRejectedValue(new Error('Note not found'));
    renderEditor();

    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Pin' }));

    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(notify.mock.calls[0][1]).toMatchObject({ tone: 'error' });

    const menu2 = await openMenu();
    expect(within(menu2).getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument();
  });
});
