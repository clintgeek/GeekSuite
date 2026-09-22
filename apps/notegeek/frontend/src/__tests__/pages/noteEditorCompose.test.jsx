import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';

/**
 * Compose, wired into the page.
 *
 * The dialog itself is covered in composeDialog.test.jsx. What is covered here
 * is what the page does with the result, which is where the risk lives:
 *
 *   - Save as a new note must leave the source ALONE. Compose is lossy by
 *     design and the note may be the only copy of something pasted in from a
 *     chat or an email.
 *   - Replace must carry `changeReason: 'compose'`, or the history entry it
 *     creates is indistinguishable from a normal edit — which is exactly what
 *     you are hunting for when a compose ate something.
 *
 * Apollo is mocked at the hook level, as in noteEditorSave.test.jsx, so the
 * mutations can be counted and their variables inspected.
 */

const createNote = vi.fn();
const updateNote = vi.fn();
const composeNote = vi.fn();
const notify = vi.fn();

const NOTE = {
  id: 'note-1',
  title: 'Scraps',
  content: 'a pile of half-finished things',
  type: 'markdown',
  tags: ['house'],
  isLocked: false,
  isEncrypted: false,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
};

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      if (name === 'GetNoteById') {
        return { data: { note: NOTE }, loading: false, error: undefined };
      }
      return { data: undefined, loading: false, error: undefined };
    },
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      const fn = { CreateNote: createNote, UpdateNote: updateNote, ComposeNote: composeNote }[name]
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

const COMPOSED = '# Scraps\n\n## The roof\n\n- get a quote\n';

function renderEditor() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={['/notes/note-1']}>
        <Routes>
          <Route path="/notes/:id" element={<NoteEditorPage />} />
          <Route path="/notes" element={<div>notes list</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  createNote.mockResolvedValue({ data: { createNote: { id: 'new-1', title: 'Scraps (composed)' } } });
  updateNote.mockResolvedValue({ data: { updateNote: { id: 'note-1', title: 'Scraps' } } });
  composeNote.mockResolvedValue({
    data: {
      composeNote: {
        markdown: COMPOSED,
        stats: { inputChars: 30, fragments: 3, chunks: 1, chunksFailed: 0, strategy: 'single', truncated: false, degenerate: false },
        provenance: { reason: null, model: 'gemma4:31b' },
      },
    },
  });
});

async function compose() {
  const button = (await screen.findAllByRole('button', { name: 'Compose a document from this note' }))[0];
  await act(async () => { button.click(); });
  await screen.findByRole('button', { name: /save as a new note/i });
}

describe('composing a note', () => {
  it('sends the note text and shows what came back', async () => {
    renderEditor();
    await compose();
    expect(composeNote).toHaveBeenCalledWith({
      variables: { content: 'a pile of half-finished things' },
    });
    expect(screen.getByRole('heading', { name: /the roof/i })).toBeInTheDocument();
  });

  it('writes nothing until the user picks', async () => {
    renderEditor();
    await compose();
    expect(updateNote).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
  });

  it('leaves the source untouched when saved as a new note', async () => {
    renderEditor();
    await compose();

    await act(async () => {
      screen.getByRole('button', { name: /save as a new note/i }).click();
    });

    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    const vars = createNote.mock.calls[0][0].variables;
    expect(vars.content).toBe(COMPOSED);
    expect(vars.type).toBe('markdown');
    // The whole point: nothing was written over the original.
    expect(updateNote).not.toHaveBeenCalled();
  });

  it('labels the history entry when the note is replaced', async () => {
    renderEditor();
    await compose();

    await act(async () => {
      screen.getByRole('button', { name: /replace this note/i }).click();
    });

    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1));
    const vars = updateNote.mock.calls[0][0].variables;
    expect(vars.id).toBe('note-1');
    expect(vars.content).toBe(COMPOSED);
    // Without this the entry is indistinguishable from a hand edit.
    expect(vars.changeReason).toBe('compose');
    expect(createNote).not.toHaveBeenCalled();
  });

  it('explains a discarded loop, and offers a retry rather than a document', async () => {
    // The gateway throws a looping answer away and reports degenerate_output.
    // The page must not present that as "unavailable" — the user needs to
    // know it is worth trying again, because routing picks again.
    composeNote.mockResolvedValue({
      data: {
        composeNote: {
          markdown: '',
          stats: { inputChars: 2425, fragments: 10, chunks: 1, chunksFailed: 0, strategy: 'single', truncated: false, degenerate: true },
          provenance: { reason: 'degenerate_output', model: 'allam-2-7b' },
        },
      },
    });
    renderEditor();
    const button = (await screen.findAllByRole('button', { name: 'Compose a document from this note' }))[0];
    await act(async () => { button.click(); });

    expect(await screen.findByText(/stuck repeating itself/i)).toBeInTheDocument();
    expect(screen.getByText(/try again/i)).toBeInTheDocument();
    // And the model that did it is named, which is the first thing anyone asks.
    expect(screen.getByText('allam-2-7b')).toBeInTheDocument();
    expect(updateNote).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
  });

  it('says the note is unchanged when nothing came back', async () => {
    composeNote.mockResolvedValue({
      data: { composeNote: { markdown: '', stats: null, provenance: { reason: 'fallback' } } },
    });
    renderEditor();
    const button = (await screen.findAllByRole('button', { name: 'Compose a document from this note' }))[0];
    await act(async () => { button.click(); });

    expect(await screen.findByText(/unavailable right now/i)).toBeInTheDocument();
    expect(updateNote).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
  });
});
