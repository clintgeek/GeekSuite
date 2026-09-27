import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, within, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createNoteTheme } from '../../theme/createAppTheme';

// Several dialogs open in turn here. The runner's clock is not ours (CI is
// slower than a dev box), so this file does not live on the 5s default.
vi.setConfig({ testTimeout: 20000 });

/**
 * "Convert handwriting to text", wired into the page (DOCS/HANDWRITING.md §2).
 *
 * Where the risk lives:
 *   - the ⋯ entry exists only on sketches, and is disabled on an empty one;
 *   - the page is exported and sent as bare base64 PNG;
 *   - the transcript is shown for correction, and the CORRECTED text is what
 *     moves on;
 *   - Compose gets that text and offers no "Replace this note";
 *   - the result is always a NEW markdown note, first line linking back to
 *     the sketch, and the sketch is never written to.
 *
 * Apollo is mocked at the hook level, as in noteEditorCompose.test.jsx. The
 * editor is replaced by a stand-in that fills `sketchApiRef` the way
 * HandwrittenEditor does (its own export is tested in HandwrittenEditor.test).
 */

const createNote = vi.fn();
const updateNote = vi.fn();
const composeNote = vi.fn();
const transcribeSketch = vi.fn();
const notify = vi.fn();
const exportPng = vi.fn();
const note = { current: null };

const SHAPE_SNAPSHOT = JSON.stringify({
  store: {
    'page:page': { id: 'page:page', typeName: 'page' },
    'shape:a': { id: 'shape:a', typeName: 'shape', type: 'draw' },
  },
  schema: {},
});
const EMPTY_SNAPSHOT = JSON.stringify({ store: { 'page:page': { id: 'page:page', typeName: 'page' } }, schema: {} });

const sketch = (content = SHAPE_SNAPSHOT, extra = {}) => ({
  id: 'sketch-1',
  title: 'Tuesday',
  content,
  type: 'handwritten',
  tags: ['house'],
  isLocked: false,
  isEncrypted: false,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  ...extra,
});

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      if (name === 'GetNoteById') return { data: { note: note.current }, loading: false, error: undefined };
      return { data: undefined, loading: false, error: undefined };
    },
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      const fn = {
        CreateNote: createNote,
        UpdateNote: updateNote,
        ComposeNote: composeNote,
        TranscribeSketch: transcribeSketch,
      }[name] || vi.fn().mockResolvedValue({ data: {} });
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
  const React = await vi.importActual('react');
  function FakeEditor({ sketchApiRef }) {
    React.useEffect(() => {
      if (!sketchApiRef) return undefined;
      sketchApiRef.current = { exportPng, hasShapes: () => true };
      return () => { sketchApiRef.current = null; };
    }, [sketchApiRef]);
    return <div data-testid="editor" />;
  }
  return { ...actual, default: FakeEditor };
});

import NoteEditorPage from '../../pages/NoteEditorPage';

const theme = createNoteTheme('light');

function renderEditor(path = '/notes/sketch-1/edit') {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/notes/:id/edit" element={<NoteEditorPage />} />
          <Route path="/notes/:id" element={<div>viewer</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

const TRANSCRIPT = 'call roofer\nquote by Fri\n[drawing: a house]';
const COMPOSED = '# Roof quote\n\n- call the roofer\n- quote by Friday\n';

beforeEach(() => {
  vi.clearAllMocks();
  note.current = sketch();
  exportPng.mockResolvedValue({
    blob: new Blob(['png'], { type: 'image/png' }),
    base64: 'iVBORw0KGgoAAAA',
    mediaType: 'image/png',
    width: 1200,
    height: 800,
  });
  transcribeSketch.mockResolvedValue({
    data: { transcribeSketch: { text: TRANSCRIPT, provenance: { source: 'model', model: 'openai/gpt-4.1-mini' } } },
  });
  composeNote.mockResolvedValue({
    data: {
      composeNote: {
        markdown: COMPOSED,
        stats: { inputChars: 40, fragments: 1, chunks: 1, chunksFailed: 0, strategy: 'single', truncated: false, degenerate: false },
        provenance: { reason: null, model: 'openai/gpt-4.1-mini' },
      },
    },
  });
  createNote.mockResolvedValue({ data: { createNote: { id: 'new-1', title: 'x' } } });
  updateNote.mockResolvedValue({ data: { updateNote: { id: 'sketch-1', title: 'Tuesday' } } });
});

async function openMenu() {
  const more = await screen.findByRole('button', { name: 'More note actions' });
  await act(async () => { more.click(); });
  return screen.findByRole('menu');
}

async function startTranscribe() {
  const menu = await openMenu();
  const item = within(menu).getByRole('menuitem', { name: /convert handwriting to text/i });
  await act(async () => { item.click(); });
  return screen.findByRole('textbox', { name: 'Transcript' });
}

describe('the ⋯ entry', () => {
  it('is offered on a sketch with ink', async () => {
    renderEditor();
    const menu = await openMenu();
    const item = within(menu).getByRole('menuitem', { name: /convert handwriting to text/i });
    expect(item).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('is disabled on an empty sketch', async () => {
    note.current = sketch(EMPTY_SNAPSHOT);
    renderEditor();
    const menu = await openMenu();
    const item = within(menu).getByRole('menuitem', { name: /convert handwriting to text/i });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(within(item).getByText('Write something first')).toBeInTheDocument();
  });

  it('is not offered on other note types', async () => {
    note.current = sketch('# hi', { type: 'markdown' });
    renderEditor();
    const menu = await openMenu();
    expect(within(menu).queryByRole('menuitem', { name: /convert handwriting/i })).not.toBeInTheDocument();
  });
});

describe('reading the page', () => {
  it('exports the page and sends it as bare base64 PNG', async () => {
    renderEditor();
    await startTranscribe();
    expect(exportPng).toHaveBeenCalledTimes(1);
    expect(transcribeSketch).toHaveBeenCalledWith({
      variables: { image: 'iVBORw0KGgoAAAA', mediaType: 'image/png' },
    });
  });

  it('shows the transcript in an editable box, with the model named', async () => {
    renderEditor();
    const box = await startTranscribe();
    expect(box).toHaveValue(TRANSCRIPT);
    expect(screen.getByText('openai/gpt-4.1-mini')).toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'call the roofer' } });
    expect(box).toHaveValue('call the roofer');
    // Nothing is written by reading.
    expect(createNote).not.toHaveBeenCalled();
    expect(updateNote).not.toHaveBeenCalled();
  });

  it('a gateway failure is shown with its detail and a retry, never an empty box', async () => {
    const err = Object.assign(new Error('Invalid input'), {
      graphQLErrors: [{ message: 'x', extensions: { details: [{ message: "That is today's 40 handwriting conversions used." }] } }],
    });
    transcribeSketch.mockRejectedValueOnce(err);
    renderEditor();
    const menu = await openMenu();
    await act(async () => { within(menu).getByRole('menuitem', { name: /convert handwriting/i }).click(); });
    expect(await screen.findByText(/today's 40 handwriting conversions/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Transcript' })).not.toBeInTheDocument();
    await act(async () => { screen.getByRole('button', { name: 'Try again' }).click(); });
    expect(await screen.findByRole('textbox', { name: 'Transcript' })).toHaveValue(TRANSCRIPT);
  });

  it('an export refused for size says so and sends nothing', async () => {
    exportPng.mockRejectedValueOnce(Object.assign(new Error('This page is too big to send (6.4 MB as an image; the limit is 6 MB).'), { code: 'too_large' }));
    renderEditor();
    const menu = await openMenu();
    await act(async () => { within(menu).getByRole('menuitem', { name: /convert handwriting/i }).click(); });
    expect(await screen.findByText(/the limit is 6 MB/)).toBeInTheDocument();
    expect(transcribeSketch).not.toHaveBeenCalled();
  });
});

describe('keeping it as plain text', () => {
  it('saves the corrected text as a NEW markdown note linking back, and leaves the sketch alone', async () => {
    renderEditor();
    const box = await startTranscribe();
    fireEvent.change(box, { target: { value: 'call the roofer\nquote by Fri' } });
    await act(async () => { screen.getByRole('button', { name: 'Keep as plain text' }).click(); });

    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    const { variables } = createNote.mock.calls[0][0];
    expect(variables.type).toBe('markdown');
    expect(variables.title).toBe('From sketch: Tuesday');
    expect(variables.tags).toEqual(['house']);
    const lines = variables.content.split('\n');
    expect(lines[0]).toBe('From sketch: [Tuesday](/notes/sketch-1)');
    expect(variables.content).toContain('call the roofer  \nquote by Fri');
    expect(updateNote).not.toHaveBeenCalled();
    expect(await screen.findByText('viewer')).toBeInTheDocument();
  });
});

describe('composing it', () => {
  it('hands the corrected transcript to Compose, offers only a new note, and saves one that links back', async () => {
    renderEditor();
    const box = await startTranscribe();
    fireEvent.change(box, { target: { value: 'call the roofer' } });
    await act(async () => { screen.getByRole('button', { name: 'Compose it' }).click(); });

    expect(composeNote).toHaveBeenCalledWith({ variables: { content: 'call the roofer' } });
    const save = await screen.findByRole('button', { name: /save as a new note/i });
    expect(screen.queryByRole('button', { name: /replace this note/i })).not.toBeInTheDocument();

    await act(async () => { save.click(); });
    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
    const { variables } = createNote.mock.calls[0][0];
    expect(variables.title).toBe('Roof quote');
    expect(variables.type).toBe('markdown');
    expect(variables.tags).toEqual(['house']);
    expect(variables.content.split('\n')[0]).toBe('From sketch: [Tuesday](/notes/sketch-1)');
    expect(variables.content).toContain(COMPOSED.trim());
    expect(updateNote).not.toHaveBeenCalled();
  });

  it('"Back to transcript" returns to the review with the corrections kept', async () => {
    renderEditor();
    const box = await startTranscribe();
    fireEvent.change(box, { target: { value: 'fixed words' } });
    await act(async () => { screen.getByRole('button', { name: 'Compose it' }).click(); });
    await act(async () => { (await screen.findByRole('button', { name: 'Back to transcript' })).click(); });
    expect(await screen.findByRole('textbox', { name: 'Transcript' })).toHaveValue('fixed words');
    expect(createNote).not.toHaveBeenCalled();
  });

  it('Compose on an ordinary note still offers Replace', async () => {
    note.current = sketch('scraps of text', { type: 'markdown' });
    renderEditor();
    const menu = await openMenu();
    await act(async () => { within(menu).getByRole('menuitem', { name: 'Compose a document from this note' }).click(); });
    await screen.findByRole('button', { name: /save as a new note/i });
    expect(screen.getByRole('button', { name: /replace this note/i })).toBeInTheDocument();
  });
});
