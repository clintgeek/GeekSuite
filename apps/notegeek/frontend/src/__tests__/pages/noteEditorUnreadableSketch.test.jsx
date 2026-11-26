import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';

vi.setConfig({ testTimeout: 20000 });

/**
 * An unreadable handwritten body must never be written over (the 2026-11-25
 * data-loss bug: the editor opened blank and the next change autosaved over
 * the original). The page shows "can't be opened", mounts no canvas, offers
 * "Try again" (refetch) and no "start fresh", and no save path sends content.
 */

const createNote = vi.fn();
const updateNote = vi.fn();
const refetch = vi.fn();
const notify = vi.fn();
const note = { current: null };
const editorProps = { current: null };

const GOOD = JSON.stringify({ store: { 'page:page': { id: 'page:page', typeName: 'page' }, 'shape:a': { id: 'shape:a', typeName: 'shape', type: 'draw' } }, schema: {} });

const sketch = (content) => ({
  id: 'sketch-1', title: 'Tuesday', content, type: 'handwritten', tags: [],
  isLocked: false, isEncrypted: false,
  createdAt: '2026-09-20T12:00:00.000Z', updatedAt: '2026-09-20T12:00:00.000Z',
});

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      if (name === 'GetNoteById') return { data: { note: note.current }, loading: false, error: undefined, refetch };
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
  return { ...actual, useToast: () => ({ notify }) };
});

vi.mock('../../components/notes/NoteTypeRouter', async () => {
  const actual = await vi.importActual('../../components/notes/NoteTypeRouter');
  function FakeEditor(props) {
    editorProps.current = props;
    return <div data-testid="editor" />;
  }
  return { ...actual, default: FakeEditor };
});

import NoteEditorPage from '../../pages/NoteEditorPage';

const theme = createNoteTheme('light');
function renderEditor() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={['/notes/sketch-1/edit']}>
        <Routes>
          <Route path="/notes/:id/edit" element={<NoteEditorPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  editorProps.current = null;
  refetch.mockResolvedValue({});
  updateNote.mockResolvedValue({ data: { updateNote: { ...sketch(GOOD), updatedAt: '2026-09-21T12:00:00.000Z' } } });
});

const wait = (ms) => act(async () => { await new Promise((r) => { setTimeout(r, ms); }); });

describe('a handwritten note whose stored body cannot be read', () => {
  it.each([
    ['invalid JSON', 'not json at all'],
    ['a truncated body', GOOD.slice(0, GOOD.length - 15)],
    ['{}', '{}'],
  ])('%s: no canvas, a clear message, Try again, and nothing is ever written', async (_, body) => {
    note.current = sketch(body);
    renderEditor();
    expect(await screen.findByText("This note can't be opened")).toBeInTheDocument();
    expect(screen.getByText(/It has not been changed, and nothing will be written to it until it opens/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    expect(screen.queryByText(/start fresh/i)).not.toBeInTheDocument();
    // The title cannot be edited here, so no save is ever started.
    expect(screen.getByLabelText('Note title')).toBeDisabled();
    await wait(2600);
    expect(updateNote).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
  });

  it('the editor reporting a failed load (tldraw rejected the records) locks the page the same way, and a later change is refused', async () => {
    note.current = sketch(GOOD);
    renderEditor();
    await screen.findByTestId('editor');
    const { onChange, onLoadError } = editorProps.current;
    act(() => { onLoadError(new Error('migration failed')); });
    expect(await screen.findByText("This note can't be opened")).toBeInTheDocument();
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
    // A late stroke from the editor that was just removed (its unmount flush).
    act(() => { onChange(JSON.stringify({ store: { 'shape:new': { id: 'shape:new', typeName: 'shape' } } })); });
    await wait(2600);
    expect(updateNote).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
  });

  it('Try again refetches the note and opens it when it now reads', async () => {
    note.current = sketch('{}');
    refetch.mockImplementation(async () => { note.current = sketch(GOOD); return {}; });
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('editor')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("This note can't be opened")).not.toBeInTheDocument();
    expect(editorProps.current.content).toBe(GOOD);
    expect(editorProps.current.readOnly).toBe(false);
  });

  it('Try again that still cannot read stays locked', async () => {
    note.current = sketch('{}');
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(await screen.findByText("This note can't be opened")).toBeInTheDocument();
    expect(updateNote).not.toHaveBeenCalled();
  });

  it('a stored note with empty content is not a failure: it opens', async () => {
    note.current = sketch('');
    renderEditor();
    expect(await screen.findByTestId('editor')).toBeInTheDocument();
    expect(screen.queryByText("This note can't be opened")).not.toBeInTheDocument();
  });

  it('a readable note still saves a change (the guard is not a blanket)', async () => {
    note.current = sketch(GOOD);
    renderEditor();
    await screen.findByTestId('editor');
    const next = JSON.stringify({ store: { 'shape:new': { id: 'shape:new', typeName: 'shape', type: 'draw' } }, schema: {} });
    act(() => { editorProps.current.onChange(next); });
    await waitFor(() => expect(updateNote).toHaveBeenCalled(), { timeout: 4000 });
    expect(updateNote.mock.calls[0][0].variables.content).toBe(next);
  });
});
