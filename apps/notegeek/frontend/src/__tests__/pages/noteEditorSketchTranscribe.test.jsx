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
const saveSketchTranscriptEdit = vi.fn();
const autoTranscribeSketch = vi.fn();
const createTodoTask = vi.fn();
const recordSketchTasksSent = vi.fn();
// The sketch's stored automatic transcript (AUTO_TRANSCRIBE_SPEC.md §5).
const transcriptState = { current: undefined };
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
      if (name === 'SketchTranscript') return { data: transcriptState.current ? { sketchTranscript: transcriptState.current } : undefined, loading: false };
      return { data: undefined, loading: false, error: undefined };
    },
    useMutation: (doc) => {
      const name = doc?.definitions?.[0]?.name?.value;
      const fn = {
        CreateNote: createNote,
        UpdateNote: updateNote,
        ComposeNote: composeNote,
        TranscribeSketch: transcribeSketch,
        SaveSketchTranscriptEdit: saveSketchTranscriptEdit,
        AutoTranscribeSketch: autoTranscribeSketch,
        CreateTodoTask: createTodoTask,
        RecordSketchTasksSent: recordSketchTasksSent,
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
  transcriptState.current = undefined;
  saveSketchTranscriptEdit.mockResolvedValue({ data: {} });
  createTodoTask.mockResolvedValue({ data: { createTask: { id: 't1', content: 'x' } } });
  recordSketchTasksSent.mockResolvedValue({ data: {} });
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
      // noteId: the gateway keeps the reading for this sketch, so the next
      // automatic run and the next Convert needn't pay for it again.
      variables: { image: 'iVBORw0KGgoAAAA', mediaType: 'image/png', noteId: 'sketch-1' },
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

describe('reusing a stored transcript (AUTO_TRANSCRIBE_SPEC.md §5)', () => {
  const HASH = 'a'.repeat(64);
  const stored = (over = {}) => ({
    status: 'searchable', current: true, contentHash: HASH, text: 'buy milk\neggs', edited: false,
    source: 'auto', model: 'openai/gpt-4.1-mini', provider: 'openrouter', at: '2026-11-14T10:00:00.000Z',
    retryAt: null, error: null, autoEnabled: true, ...over,
  });

  it('a current transcript opens straight into review, with no request spent', async () => {
    transcriptState.current = stored();
    renderEditor();
    const box = await startTranscribe();
    expect(box).toHaveValue('buy milk\neggs');
    expect(transcribeSketch).not.toHaveBeenCalled();
    expect(screen.getByTestId('transcript-reused')).toHaveTextContent('Already transcribed · automatically');
    expect(screen.getByRole('button', { name: 'Transcribe again' })).toBeInTheDocument();
  });

  it('Transcribe again is the explicit way to spend a request', async () => {
    transcriptState.current = stored();
    renderEditor();
    await startTranscribe();
    await act(async () => { screen.getByRole('button', { name: 'Transcribe again' }).click(); });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Transcript' })).toHaveValue(TRANSCRIPT));
    expect(transcribeSketch).toHaveBeenCalledTimes(1);
  });

  it("the writer's corrections show as such, and are what Convert offers", async () => {
    transcriptState.current = stored({ text: 'buy oat milk', edited: true, source: 'user', model: null });
    renderEditor();
    const box = await startTranscribe();
    expect(box).toHaveValue('buy oat milk');
    expect(screen.getByTestId('transcript-reused')).toHaveTextContent('with your corrections');
  });

  it('an untouched reading is not saved again as a correction', async () => {
    transcriptState.current = stored();
    renderEditor();
    await startTranscribe();
    await act(async () => { screen.getByRole('button', { name: /keep as plain text/i }).click(); });
    expect(createNote).toHaveBeenCalledTimes(1);
    expect(saveSketchTranscriptEdit).not.toHaveBeenCalled();
  });

  it('corrections made in review are kept as the sketch transcript, for the content they were made against', async () => {
    transcriptState.current = stored();
    renderEditor();
    const box = await startTranscribe();
    fireEvent.change(box, { target: { value: 'buy milk\neggs\nbread' } });
    await act(async () => { screen.getByRole('button', { name: /keep as plain text/i }).click(); });
    expect(saveSketchTranscriptEdit).toHaveBeenCalledWith({
      variables: { noteId: 'sketch-1', text: 'buy milk\neggs\nbread', forHash: HASH },
    });
    // The new note is still made exactly as before.
    expect(createNote).toHaveBeenCalledTimes(1);
  });

  it('an out-of-date transcript is not reused: the page is read as before', async () => {
    transcriptState.current = stored({ status: 'waiting', current: false, text: null });
    renderEditor();
    await startTranscribe();
    expect(transcribeSketch).toHaveBeenCalledTimes(1);
  });
});

describe('Send tasks to TodoGeek (BUJO_HANDWRITING.md)', () => {
  const HASH = 'b'.repeat(64);
  const JOURNAL = '# Standup\n* call the roofer !high #house\n[ ] book flights\nx renew passport\n- the old site goes away\no dentist';
  const storedJournal = (over = {}) => ({
    status: 'searchable', current: true, contentHash: HASH, text: JOURNAL, edited: false, source: 'auto',
    model: 'openai/gpt-4.1-mini', provider: 'openrouter', at: '2026-11-14T10:00:00.000Z', retryAt: null, error: null,
    sentTaskKeys: [], autoEnabled: true, ...over,
  });

  async function openSend() {
    const menu = await openMenu();
    const item = within(menu).getByRole('menuitem', { name: /send tasks to todogeek/i });
    await act(async () => { item.click(); });
    return screen.findByRole('dialog', { name: /send tasks to todogeek/i });
  }
  const box = (dialog, name) => within(dialog).getByRole('checkbox', { name });

  it('lists the journal lines from the stored transcript — no request spent — with open things ticked', async () => {
    transcriptState.current = storedJournal();
    renderEditor();
    const dialog = await openSend();
    expect(transcribeSketch).not.toHaveBeenCalled();
    expect(box(dialog, /Task: call the roofer/)).toBeChecked();
    expect(box(dialog, /Task: book flights/)).toBeChecked();
    expect(box(dialog, /Event: dentist/)).toBeChecked();
    expect(box(dialog, /Done: renew passport/)).not.toBeChecked();
    expect(box(dialog, /Note: the old site goes away/)).not.toBeChecked();
    // Prose and headings are not entries.
    expect(within(dialog).queryByRole('checkbox', { name: /Standup/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send 3 to TodoGeek' })).toBeInTheDocument();
  });

  it("sends the ticked lines as TodoGeek tasks, built by TodoGeek's grammar, and remembers them", async () => {
    transcriptState.current = storedJournal();
    renderEditor();
    const dialog = await openSend();
    await act(async () => { within(dialog).getByRole('button', { name: 'Send 3 to TodoGeek' }).click(); });
    await waitFor(() => expect(createTodoTask).toHaveBeenCalledTimes(3));
    const sent = createTodoTask.mock.calls.map(([{ variables }]) => variables);
    expect(sent[0]).toMatchObject({ content: 'call the roofer', signifier: '*', priority: 1, tags: ['house'] });
    expect(sent[0].dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // no date written: today, date-only
    expect(sent[0].note).toMatch(/^From sketch: Tuesday — .*\/notes\/sketch-1$/);
    expect(sent[1]).toMatchObject({ content: 'book flights', signifier: '*' });
    expect(sent[2]).toMatchObject({ content: 'dentist', signifier: '@' });
    expect(recordSketchTasksSent).toHaveBeenCalledTimes(1);
    expect(recordSketchTasksSent.mock.calls[0][0].variables).toMatchObject({ noteId: 'sketch-1' });
    expect(recordSketchTasksSent.mock.calls[0][0].variables.keys).toHaveLength(3);
    expect(await screen.findByText('3 entries were added to TodoGeek.')).toBeInTheDocument();
    // The sketch itself is never written by this.
    expect(updateNote).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
  });

  it('a line already sent is shown as such and not ticked again', async () => {
    const { journalLines } = await import('../../utils/journalLines');
    const key = journalLines(JOURNAL)[0].key;
    transcriptState.current = storedJournal({ sentTaskKeys: [key] });
    renderEditor();
    const dialog = await openSend();
    expect(box(dialog, /Task: call the roofer/)).not.toBeChecked();
    expect(within(dialog).getByText('Already sent')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send 2 to TodoGeek' })).toBeInTheDocument();
  });

  it('with no current transcript it reads the page first, the way Convert does', async () => {
    transcribeSketch.mockResolvedValueOnce({ data: { transcribeSketch: { text: '* buy milk', provenance: { model: 'm' } } } });
    renderEditor();
    const dialog = await openSend();
    await waitFor(() => expect(box(dialog, /Task: buy milk/)).toBeChecked());
    expect(transcribeSketch).toHaveBeenCalledWith({ variables: { image: 'iVBORw0KGgoAAAA', mediaType: 'image/png', noteId: 'sketch-1' } });
  });

  it('a task that fails is reported, the rest still go, and only what went is remembered', async () => {
    transcriptState.current = storedJournal();
    createTodoTask.mockRejectedValueOnce(new Error('gateway down'));
    renderEditor();
    const dialog = await openSend();
    await act(async () => { within(dialog).getByRole('button', { name: 'Send 3 to TodoGeek' }).click(); });
    expect(await screen.findByText('2 entries were added to TodoGeek.')).toBeInTheDocument();
    expect(screen.getByText(/1 entry was not added/)).toBeInTheDocument();
    expect(recordSketchTasksSent.mock.calls[0][0].variables.keys).toHaveLength(2);
  });

  it('a page with no journal marks says so, and shows the marks', async () => {
    transcriptState.current = storedJournal({ text: 'just some prose\nand more prose' });
    renderEditor();
    const dialog = await openSend();
    expect(within(dialog).getByText('No journal lines on this page.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /to TodoGeek/ })).not.toBeInTheDocument();
  });
});
