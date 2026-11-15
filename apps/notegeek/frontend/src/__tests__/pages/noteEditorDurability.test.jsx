import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { ApolloProvider } from '@apollo/client';
import { createNoteTheme } from '../../theme/createAppTheme';
import { __resetDraftsForTests, saveDraft, getDraft, draftKeyFor } from '../../utils/draftStore';

/**
 * Review 2026-11, Tier 1 — the editor must not lose work:
 *   1.2  save at once when the app is hidden; keep a device copy; offer it back
 *   1.3  retry a failed save when the connection returns
 *   1.4  send the base version; a CONFLICT asks instead of overwriting;
 *        seed only from a network-fresh copy
 *   1.20 the address becomes /notes/<id>/edit after the first save, without
 *        a remount; "New note" from there starts a fresh note
 *   1.21 the title is never filled with "Untitled Note"
 *
 * Apollo is mocked at the hook level (as in noteEditorSave.test.jsx) so the
 * mutation calls can be counted and inspected.
 */

const createNote = vi.fn();
const updateNote = vi.fn();
const notify = vi.fn();

const serverNote = (extra = {}) => ({
  id: 'note-1',
  title: 'Roof quote',
  content: 'call back',
  type: 'markdown',
  tags: ['house'],
  isLocked: false,
  isEncrypted: false,
  pinned: false,
  pinnedAt: null,
  createdAt: '2026-11-10T12:00:00.000Z',
  updatedAt: '2026-11-10T12:00:00.000Z',
  ...extra,
});

let queryState;

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: (doc, opts) => {
      const name = doc?.definitions?.[0]?.name?.value;
      if (name === 'GetNoteById' && !opts?.skip) return queryState(opts?.variables?.id);
      return { data: undefined, loading: false, error: undefined };
    },
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      const fn = { CreateNote: createNote, UpdateNote: updateNote }[name] || vi.fn().mockResolvedValue({ data: {} });
      return [fn, { loading: false }];
    },
  };
});

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify, dismiss: vi.fn() }) };
});

// A plain textarea stands in for the five editors.
vi.mock('../../components/notes/NoteTypeRouter', async () => {
  const actual = await vi.importActual('../../components/notes/NoteTypeRouter');
  return {
    ...actual,
    default: ({ content, onChange }) => (
      <textarea aria-label="Body" value={content} onChange={(e) => onChange(e.target.value)} />
    ),
  };
});

import NoteEditorPage from '../../pages/NoteEditorPage';
import NoteEditorRoute from '../../pages/NoteEditorRoute';

const theme = createNoteTheme('light');

function Where() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="where">{location.pathname}</div>
      <button type="button" onClick={() => navigate('/notes/new')}>New note</button>
    </>
  );
}

function renderAt(route) {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/notes/new" element={<NoteEditorRoute />} />
          <Route path="/notes/:id/edit" element={<NoteEditorRoute />} />
          <Route path="/plain/:id" element={<NoteEditorPage />} />
          <Route path="/notes" element={<div>notes list</div>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </ThemeProvider>
  );
}

const body = () => screen.getByLabelText('Body');
const type = (text) => fireEvent.change(body(), { target: { value: text } });

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function conflictError(server) {
  return Object.assign(new Error('This note changed on another device.'), {
    graphQLErrors: [{ message: 'This note changed on another device.', extensions: { code: 'CONFLICT', serverNote: server } }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetDraftsForTests();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  queryState = () => ({ data: { note: serverNote() }, loading: false, error: undefined });
  createNote.mockResolvedValue({ data: { createNote: { id: 'new-1', title: '', tags: [], updatedAt: '2026-11-15T09:00:00.000Z' } } });
  updateNote.mockImplementation(({ variables }) => Promise.resolve({
    data: { updateNote: { id: variables.id, title: variables.title, tags: variables.tags, updatedAt: '2026-11-15T09:00:01.000Z' } },
  }));
});
afterEach(() => {
  setVisibility('visible');
  vi.useRealTimers();
});

describe('1.2 — hidden or leaving: save now, keep a device copy', () => {
  it('saves at once when the app is hidden, without waiting for the debounce', async () => {
    renderAt('/notes/note-1/edit');
    await screen.findByDisplayValue('call back');
    type('call back tomorrow');
    await act(async () => { setVisibility('hidden'); await Promise.resolve(); });
    expect(updateNote).toHaveBeenCalledTimes(1);
    expect(updateNote.mock.calls[0][0].variables.content).toBe('call back tomorrow');
  });

  it('saves on pagehide too', async () => {
    renderAt('/notes/note-1/edit');
    await screen.findByDisplayValue('call back');
    type('edited');
    await act(async () => { window.dispatchEvent(new Event('pagehide')); await Promise.resolve(); });
    expect(updateNote).toHaveBeenCalledTimes(1);
  });

  it('keeps a device copy of an unsaved edit and clears it when the server has it', async () => {
    renderAt('/notes/note-1/edit');
    await screen.findByDisplayValue('call back');
    type('draft words');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect((await getDraft(draftKeyFor('note-1')))?.content).toBe('draft words');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await waitFor(() => expect(updateNote).toHaveBeenCalled());
    await waitFor(async () => expect(await getDraft(draftKeyFor('note-1'))).toBeNull());
  });

  it('offers back a device copy the server never got', async () => {
    await saveDraft(draftKeyFor('note-1'), { noteId: 'note-1', title: 'Roof quote', content: 'lost on the train', tags: ['house'], type: 'markdown', baseUpdatedAt: '2026-11-10T12:00:00.000Z' });
    renderAt('/notes/note-1/edit');
    await screen.findByDisplayValue('call back');
    fireEvent.click(await screen.findByRole('button', { name: /restore unsaved changes/i }));
    expect(body().value).toBe('lost on the train');
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    await waitFor(() => expect(updateNote).toHaveBeenCalled());
    expect(updateNote.mock.calls[0][0].variables).toMatchObject({ content: 'lost on the train', baseUpdatedAt: '2026-11-10T12:00:00.000Z' });
  });
});

describe('1.3 — a failed save is retried when the connection returns', () => {
  it('retries on `online` without any new edit', async () => {
    updateNote.mockRejectedValueOnce(Object.assign(new Error('Failed to fetch'), { networkError: new Error('offline') }));
    renderAt('/notes/note-1/edit');
    await screen.findByDisplayValue('call back');
    type('written offline');
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
    await act(async () => { window.dispatchEvent(new Event('online')); await Promise.resolve(); });
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(2));
    expect(updateNote.mock.calls[1][0].variables.content).toBe('written offline');
  });

  it('retries on return to the app', async () => {
    updateNote.mockRejectedValueOnce(new Error('Failed to fetch'));
    renderAt('/notes/note-1/edit');
    await screen.findByDisplayValue('call back');
    type('written offline');
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
    await act(async () => { setVisibility('visible'); await Promise.resolve(); });
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(2));
  });
});

describe('1.4 — two devices on one note', () => {
  it('sends the version the edit was made against', async () => {
    renderAt('/notes/note-1/edit');
    await screen.findByDisplayValue('call back');
    type('mine');
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    await waitFor(() => expect(updateNote).toHaveBeenCalled());
    expect(updateNote.mock.calls[0][0].variables.baseUpdatedAt).toBe('2026-11-10T12:00:00.000Z');
  });

  it('asks on CONFLICT; "Keep mine" re-sends against their version', async () => {
    const theirs = serverNote({ content: 'theirs', updatedAt: '2026-11-14T08:00:00.000Z' });
    updateNote.mockRejectedValueOnce(conflictError(theirs));
    renderAt('/notes/note-1/edit');
    await screen.findByDisplayValue('call back');
    type('mine');
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(await screen.findByText(/changed on another device/i)).toBeInTheDocument();
    // Paused while the writer chooses: no retry loop.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(updateNote).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /keep mine/i }));
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(2));
    expect(updateNote.mock.calls[1][0].variables).toMatchObject({ content: 'mine', baseUpdatedAt: '2026-11-14T08:00:00.000Z' });
  });

  it('"Use theirs" puts their copy on screen, clean', async () => {
    const theirs = serverNote({ content: 'theirs', updatedAt: '2026-11-14T08:00:00.000Z' });
    updateNote.mockRejectedValueOnce(conflictError(theirs));
    renderAt('/notes/note-1/edit');
    await screen.findByDisplayValue('call back');
    type('mine');
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    fireEvent.click(await screen.findByRole('button', { name: /use theirs/i }));
    expect(body().value).toBe('theirs');
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(updateNote).toHaveBeenCalledTimes(1);
  });

  it('"Keep both" saves mine as a new note and shows theirs', async () => {
    const theirs = serverNote({ content: 'theirs', updatedAt: '2026-11-14T08:00:00.000Z' });
    updateNote.mockRejectedValueOnce(conflictError(theirs));
    createNote.mockResolvedValueOnce({ data: { createNote: { id: 'copy-1' } } });
    renderAt('/notes/note-1/edit');
    await screen.findByDisplayValue('call back');
    type('mine');
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    fireEvent.click(await screen.findByRole('button', { name: /keep both/i }));
    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    expect(createNote.mock.calls[0][0].variables).toMatchObject({ content: 'mine' });
    await waitFor(() => expect(body().value).toBe('theirs'));
  });

  it('on return to the app, a note changed elsewhere (and clean here) shows the newer copy', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ data: { note: serverNote({ content: 'from the phone', updatedAt: '2026-11-15T07:00:00.000Z' }) } }),
    };
    render(
      <ApolloProvider client={client}>
        <ThemeProvider theme={theme}>
          <MemoryRouter initialEntries={['/notes/note-1/edit']}>
            <Routes><Route path="/notes/:id/edit" element={<NoteEditorRoute />} /></Routes>
          </MemoryRouter>
        </ThemeProvider>
      </ApolloProvider>
    );
    await screen.findByDisplayValue('call back');
    await act(async () => { setVisibility('hidden'); setVisibility('visible'); await Promise.resolve(); });
    await waitFor(() => expect(body().value).toBe('from the phone'));
    expect(client.query.mock.calls[0][0]).toMatchObject({ variables: { id: 'note-1' }, fetchPolicy: 'network-only' });
    // …and the next save is made against that version.
    type('from the phone, then the tablet');
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    await waitFor(() => expect(updateNote).toHaveBeenCalled());
    expect(updateNote.mock.calls[0][0].variables.baseUpdatedAt).toBe('2026-11-15T07:00:00.000Z');
  });

  it('does not seed the editor from a cached copy while the network copy is on its way', async () => {
    queryState = () => ({ data: { note: serverNote({ content: 'stale cached' }) }, loading: true, error: undefined });
    const { rerender } = renderAt('/notes/note-1/edit');
    expect(screen.queryByDisplayValue('stale cached')).toBeNull();
    expect(screen.getByText(/loading note/i)).toBeInTheDocument();
    queryState = () => ({ data: { note: serverNote({ content: 'fresh' }) }, loading: false, error: undefined });
    rerender(
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={['/notes/note-1/edit']}>
          <Routes>
            <Route path="/notes/:id/edit" element={<NoteEditorRoute />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    );
    expect(await screen.findByDisplayValue('fresh')).toBeInTheDocument();
  });
});

describe('1.20 — a new note gets its own address', () => {
  it('replaces /notes/new with /notes/<id>/edit after the first save, keeping the editor', async () => {
    queryState = () => ({ data: undefined, loading: true, error: undefined });
    renderAt('/notes/new?type=markdown');
    type('first words');
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/notes/new-1/edit'));
    // Same editor: the text is still there, no loading screen, and the next
    // save updates the note it made rather than creating another.
    expect(body().value).toBe('first words');
    type('first words and more');
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
    expect(createNote).toHaveBeenCalledTimes(1);
    expect(updateNote.mock.calls[0][0].variables.id).toBe('new-1');
  });

  it('"New note" from an autosaved new note starts a fresh one', async () => {
    queryState = () => ({ data: undefined, loading: true, error: undefined });
    renderAt('/notes/new');
    type('first note');
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/notes/new-1/edit'));
    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/notes/new'));
    expect(body().value).toBe('');
  });
});

describe('1.20 — "New note" is always a new note', () => {
  it('pressed again before the first save, it starts fresh too', async () => {
    renderAt('/notes/new');
    type('not saved yet');
    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    await waitFor(() => expect(body().value).toBe(''));
  });
});

describe('1.21 — the title is the writer\'s', () => {
  it('saves an untitled note with an empty title, not "Untitled Note"', async () => {
    renderAt('/notes/new');
    type('just a body');
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    await waitFor(() => expect(createNote).toHaveBeenCalled());
    expect(createNote.mock.calls[0][0].variables.title).toBe('');
    expect(screen.queryByDisplayValue('Untitled Note')).toBeNull();
  });
});
