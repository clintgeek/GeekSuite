/**
 * Compose from several notes, end to end in the UI (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md
 * U3–U5): the selection bar's Compose → `composeNotes` → the draft → Save as a
 * new note → the archive offer → the new note opens.
 *
 * The rules that matter most here:
 *   - the archive offer offers ONLY `sources.used` — a skipped note was not
 *     composed, and archiving it would hide material that is in no other note;
 *   - nothing is archived unless asked, and Undo restores what was archived;
 *   - a refusal or an error keeps the selection.
 */
import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { GeekToastProvider } from '@geeksuite/ui';
import { createNoteTheme } from '../../../theme/createAppTheme';
import { COMPOSE_NOTES, ARCHIVE_NOTES, RESTORE_NOTES } from '../../../graphql/archive';
import { CREATE_NOTE } from '../../../graphql/mutations';
import { useNoteSelection } from '../../../hooks/useNoteSelection';
import SelectionBar from '../../../components/select/SelectionBar';

// Selected newest-first on purpose: the request must go oldest-first (C3).
const NOTES = [
  { id: 'n3', title: 'Roof quote', type: 'markdown', createdAt: '2026-10-05T10:00:00Z' },
  { id: 'n1', title: 'Roof leak', type: 'text', createdAt: '2026-09-01T10:00:00Z' },
  { id: 'sk', title: 'Shed sketch', type: 'handwritten', createdAt: '2026-09-20T10:00:00Z' },
];
const ORDERED_IDS = ['n1', 'sk', 'n3'];
const DRAFT = 'Some framing first.\n\n# Roof repair\n\n## The leak\n\n- patch the flashing\n';

const stats = (over = {}) => ({
  inputChars: 900, fragments: 5, chunks: 1, chunksFailed: 0, strategy: 'single', truncated: false, degenerate: false, ...over,
});
const composed = (over = {}) => ({
  markdown: DRAFT,
  stats: stats(),
  provenance: { source: 'model', reason: null, model: 'openai/gpt-4.1-mini', provider: 'openrouter', cached: false, callsToday: 1, cap: 120 },
  sources: { used: ['n1', 'n3'], skipped: [{ id: 'sk', title: 'Shed sketch', reason: 'unsupported_type' }] },
  ...over,
});
const composeMock = (result, fn) => ({
  request: { query: COMPOSE_NOTES, variables: { noteIds: ORDERED_IDS } },
  result: fn || (() => ({ data: { composeNotes: result } })),
});

let lastSelection = null;
function Harness() {
  const selection = useNoteSelection();
  lastSelection = selection;
  const { active, enter, toggle } = selection;
  useEffect(() => {
    if (active) return;
    enter();
    NOTES.forEach((n) => toggle(n));
    // once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div data-testid="count">{selection.active ? `${selection.count} selected` : 'not selecting'}</div>
      <SelectionBar selection={selection} />
    </>
  );
}

function renderFlow(mocks) {
  return render(
    <ThemeProvider theme={createNoteTheme('light')}>
      <MockedProvider mocks={mocks} addTypename={false}>
        <GeekToastProvider>
          <MemoryRouter initialEntries={['/notes']}>
            <Routes>
              <Route path="/notes" element={<Harness />} />
              <Route path="/notes/:id" element={<div>opened the new note</div>} />
            </Routes>
          </MemoryRouter>
        </GeekToastProvider>
      </MockedProvider>
    </ThemeProvider>
  );
}

const createMock = (fn) => ({
  request: {
    query: CREATE_NOTE,
    variables: { title: 'Roof repair', content: DRAFT, type: 'markdown', tags: [] },
  },
  result: fn,
});

async function startCompose() {
  const btn = await screen.findByRole('button', { name: 'Compose 3 notes' });
  fireEvent.click(btn);
}

beforeEach(() => { vi.clearAllMocks(); lastSelection = null; });

describe('the happy path', () => {
  it('composes oldest first, shows the draft, saves ONE markdown note titled from its heading, with no tags', async () => {
    const compose = vi.fn(() => ({ data: { composeNotes: composed() } }));
    const create = vi.fn(() => ({ data: { createNote: { id: 'new1', title: 'Roof repair', content: DRAFT, type: 'markdown', tags: [], createdAt: 'x', updatedAt: 'x' } } }));
    renderFlow([composeMock(null, compose), createMock(create)]);
    await startCompose();

    // The status line counts the notes and the seconds.
    expect(screen.getByText(/^Composing 3 notes… \d+s$/)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'The leak' })).toBeInTheDocument();
    expect(compose).toHaveBeenCalledTimes(1);
    // No Replace: there is no single source to replace.
    expect(screen.queryByRole('button', { name: /replace/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save as a new note' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });

  it('says which notes were left out, and why', async () => {
    renderFlow([composeMock(composed())]);
    await startCompose();
    expect(await screen.findByText('1 note left out: Shed sketch (a sketch)')).toBeInTheDocument();
  });

  it('offers to archive ONLY the notes that went in; Archive them archives those, opens the note, and Undo restores', async () => {
    const archived = vi.fn(() => ({ data: { archiveNotes: { ids: ['n1', 'n3'], count: 2 } } }));
    const restored = vi.fn(() => ({ data: { restoreNotes: { ids: ['n1', 'n3'], count: 2 } } }));
    renderFlow([
      composeMock(composed()),
      createMock(() => ({ data: { createNote: { id: 'new1', title: 'Roof repair', content: DRAFT, type: 'markdown', tags: [], createdAt: 'x', updatedAt: 'x' } } })),
      // The mock matches ['n1','n3'] exactly — an archive of 'sk' would find no mock and fail.
      { request: { query: ARCHIVE_NOTES, variables: { ids: ['n1', 'n3'] } }, result: archived },
      { request: { query: RESTORE_NOTES, variables: { ids: ['n1', 'n3'] } }, result: restored },
    ]);
    await startCompose();
    fireEvent.click(await screen.findByRole('button', { name: 'Save as a new note' }));

    // Two, not three: the sketch was skipped, so it is not offered.
    const offer = await screen.findByRole('dialog', { name: 'Saved. Archive the 2 source notes?' });
    expect(archived).not.toHaveBeenCalled();
    fireEvent.click(within(offer).getByRole('button', { name: 'Archive them' }));

    expect(await screen.findByText('opened the new note')).toBeInTheDocument();
    expect(archived).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Archived 2 notes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(restored).toHaveBeenCalledTimes(1));
  });

  it('Keep them archives nothing and opens the new note', async () => {
    const archived = vi.fn(() => ({ data: { archiveNotes: { ids: ['n1', 'n3'], count: 2 } } }));
    renderFlow([
      composeMock(composed()),
      createMock(() => ({ data: { createNote: { id: 'new1', title: 'Roof repair', content: DRAFT, type: 'markdown', tags: [], createdAt: 'x', updatedAt: 'x' } } })),
      { request: { query: ARCHIVE_NOTES, variables: { ids: ['n1', 'n3'] } }, result: archived },
    ]);
    await startCompose();
    fireEvent.click(await screen.findByRole('button', { name: 'Save as a new note' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep them' }));
    expect(await screen.findByText('opened the new note')).toBeInTheDocument();
    expect(archived).not.toHaveBeenCalled();
  });

  it('a failed save keeps the draft and offers nothing', async () => {
    renderFlow([
      composeMock(composed()),
      { request: { query: CREATE_NOTE, variables: { title: 'Roof repair', content: DRAFT, type: 'markdown', tags: [] } }, error: new Error('save refused') },
    ]);
    await startCompose();
    fireEvent.click(await screen.findByRole('button', { name: 'Save as a new note' }));
    expect(await screen.findByText('save refused')).toBeInTheDocument();
    expect(screen.queryByText(/Archive the/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The leak' })).toBeInTheDocument();
  });
});

describe('partial results are said out loud (U3)', () => {
  it('chunksFailed: some material could not be read', async () => {
    renderFlow([composeMock(composed({ stats: stats({ chunksFailed: 1, strategy: 'map_reduce', chunks: 3 }) }))]);
    await startCompose();
    expect(await screen.findByText(/some material could not be read — check before relying on it/i)).toBeInTheDocument();
    expect(screen.getByText(/your notes are untouched/i)).toBeInTheDocument();
  });

  it('truncated: the document stops mid-thought', async () => {
    renderFlow([composeMock(composed({ stats: stats({ truncated: true }) }))]);
    await startCompose();
    expect(await screen.findByText(/stops\s+mid-thought/i)).toBeInTheDocument();
  });
});

describe('refusals and errors keep the selection (U3)', () => {
  it('not_enough_sources: says so, names what was left out, and Back keeps all three selected', async () => {
    renderFlow([composeMock(composed({
      markdown: '',
      provenance: { source: 'none', reason: 'not_enough_sources', model: null, provider: null, cached: false, callsToday: 0, cap: 120 },
      sources: { used: ['n1'], skipped: [{ id: 'sk', title: 'Shed sketch', reason: 'unsupported_type' }, { id: 'n3', title: 'Roof quote', reason: 'empty' }] },
    }))]);
    await startCompose();
    expect(await screen.findByText(/needs at least two notes it can read/i)).toBeInTheDocument();
    expect(screen.getByText('2 notes left out: Shed sketch (a sketch), Roof quote (empty)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save as a new note' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to selection' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('count')).toHaveTextContent('3 selected');
    expect(lastSelection.ids.sort()).toEqual(['n1', 'n3', 'sk']);
  });

  it('content_too_long: says how much and to select fewer notes', async () => {
    renderFlow([composeMock(composed({
      markdown: '',
      stats: stats({ inputChars: 250000 }),
      provenance: { source: 'none', reason: 'content_too_long', model: null, provider: null, cached: false, callsToday: 0, cap: 120 },
      sources: { used: [], skipped: [] },
    }))]);
    await startCompose();
    expect(await screen.findByText(/\(250,000 characters\)\. Select fewer notes\./)).toBeInTheDocument();
  });

  it('a network error is shown and the selection stays', async () => {
    renderFlow([{ request: { query: COMPOSE_NOTES, variables: { noteIds: ORDERED_IDS } }, error: new Error('the gateway is down') }]);
    await startCompose();
    expect(await screen.findByText('the gateway is down')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to selection' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('count')).toHaveTextContent('3 selected');
  });
});
