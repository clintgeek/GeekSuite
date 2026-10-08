/**
 * Archive / Restore in the editor's ⋯ menu, and the archived banner on a note
 * opened for editing (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md U6). Apollo is
 * mocked at the hook level, as in noteEditorCompose.test.jsx, so the calls
 * and their variables can be inspected.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';

const archiveNotes = vi.fn();
const restoreNotes = vi.fn();
const updateNote = vi.fn();
const notify = vi.fn();
let archiveState = { archived: false, archivedAt: null };

const NOTE = {
  id: 'note-1', title: 'Scraps', content: 'a pile of things', type: 'markdown', tags: [],
  isLocked: false, isEncrypted: false, createdAt: '2026-09-20T12:00:00.000Z', updatedAt: '2026-09-20T12:00:00.000Z',
};

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      if (name === 'GetNoteById') return { data: { note: NOTE }, loading: false, error: undefined };
      if (name === 'NoteArchiveState') return { data: { note: { id: 'note-1', ...archiveState } }, loading: false };
      return { data: undefined, loading: false, error: undefined };
    },
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      const fn = { ArchiveNotes: archiveNotes, RestoreNotes: restoreNotes, UpdateNote: updateNote }[name]
        || vi.fn().mockResolvedValue({ data: {} });
      return [fn, { loading: false }];
    },
  };
});

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify, dismiss: vi.fn() }) };
});

vi.mock('../../components/notes/NoteTypeRouter', async () => {
  const actual = await vi.importActual('../../components/notes/NoteTypeRouter');
  return { ...actual, default: () => null };
});

import NoteEditorPage from '../../pages/NoteEditorPage';

function renderEditor() {
  return render(
    <ThemeProvider theme={createNoteTheme('light')}>
      <MemoryRouter initialEntries={['/notes/note-1/edit']}>
        <Routes>
          <Route path="/notes/:id/edit" element={<NoteEditorPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

async function openMenu() {
  const more = await screen.findByRole('button', { name: 'More note actions' });
  await act(async () => { more.click(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  archiveState = { archived: false, archivedAt: null };
  archiveNotes.mockResolvedValue({ data: { archiveNotes: { ids: ['note-1'], count: 1 } } });
  restoreNotes.mockResolvedValue({ data: { restoreNotes: { ids: ['note-1'], count: 1 } } });
});

describe('the ⋯ menu', () => {
  it('Archive archives this note — and is not an edit', async () => {
    renderEditor();
    await openMenu();
    const item = await screen.findByRole('menuitem', { name: 'Archive' });
    await act(async () => { item.click(); });
    expect(archiveNotes).toHaveBeenCalledWith({ variables: { ids: ['note-1'] } });
    expect(updateNote).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Archived 1 note', expect.objectContaining({ tone: 'success', action: expect.anything() }));
  });

  it('on an archived note it offers Restore instead, and shows the banner', async () => {
    archiveState = { archived: true, archivedAt: '2026-10-08T12:00:00.000Z' };
    renderEditor();
    expect(await screen.findByText(/^Archived Oct 8, 2026/)).toBeInTheDocument();
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).not.toBeInTheDocument();
    const item = screen.getByRole('menuitem', { name: 'Restore from archive' });
    await act(async () => { item.click(); });
    expect(restoreNotes).toHaveBeenCalledWith({ variables: { ids: ['note-1'] } });
    expect(archiveNotes).not.toHaveBeenCalled();
  });

  it('the banner\'s Restore restores', async () => {
    archiveState = { archived: true, archivedAt: '2026-10-08T12:00:00.000Z' };
    renderEditor();
    const btn = await screen.findByRole('button', { name: 'Restore' });
    await act(async () => { btn.click(); });
    expect(restoreNotes).toHaveBeenCalledWith({ variables: { ids: ['note-1'] } });
  });

  it('a note that is not archived shows no banner', async () => {
    renderEditor();
    await screen.findByRole('button', { name: 'More note actions' });
    expect(screen.queryByText(/^Archived /)).not.toBeInTheDocument();
  });
});
