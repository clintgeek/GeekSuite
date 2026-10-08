/**
 * Select mode in a note list (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md U1, U2, U8).
 *
 * Rendered through the real NoteList (All notes; a tag page is the same
 * component) with Apollo's MockedProvider, so the archive call, its variables
 * and its Undo are the real documents going out.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { GeekToastProvider } from '@geeksuite/ui';
import { createNoteTheme } from '../../../theme/createAppTheme';
import { GET_NOTES } from '../../../graphql/queries';
import { ARCHIVE_NOTES, RESTORE_NOTES } from '../../../graphql/archive';
import NoteList from '../../../components/NoteList';

const iso = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const note = (id, title, type = 'markdown', h = 1) => ({
  id, title, content: `${title} body`, type, tags: [], pinned: false, pinnedAt: null, createdAt: iso(h + 100), updatedAt: iso(h),
});
const NOTES = [
  note('a', 'Alpha plan', 'markdown', 1),
  note('b', 'Beta notes', 'text', 2),
  note('s', 'Sketch of the shed', 'handwritten', 3),
];
const VARS = { tag: undefined, prefix: undefined, under: undefined, type: null, limit: 200 };
const listMock = () => ({ request: { query: GET_NOTES, variables: VARS }, result: { data: { notes: NOTES } }, maxUsageCount: 10 });

function renderList(extraMocks = []) {
  return render(
    <ThemeProvider theme={createNoteTheme('light')}>
      <MockedProvider mocks={[listMock(), ...extraMocks]} addTypename={false}>
        <GeekToastProvider>
          <MemoryRouter initialEntries={['/notes']}>
            <Routes>
              <Route path="/notes" element={<NoteList />} />
              <Route path="/notes/:id" element={<div>opened the note</div>} />
            </Routes>
          </MemoryRouter>
        </GeekToastProvider>
      </MockedProvider>
    </ThemeProvider>
  );
}

const rowLink = (title) => screen.getByText(title).closest('[data-note-row]');
const box = (title) => screen.getByRole('checkbox', { name: new RegExp(title) });
const wait = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));

async function longPress(el, ms = 560) {
  fireEvent.pointerDown(el, { button: 0, pointerType: 'touch', clientX: 10, clientY: 10 });
  await wait(ms);
  fireEvent.pointerUp(el, { pointerType: 'touch' });
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

describe('entering and leaving select mode', () => {
  it('a long press selects the row and does not open the note', async () => {
    renderList();
    await screen.findByText('Alpha plan');
    const row = rowLink('Alpha plan');
    await longPress(row);
    // The click that ends the press lands on the row, now a checkbox.
    fireEvent.click(screen.getByText('Alpha plan').closest('[data-note-row]'));
    expect(screen.queryByText('opened the note')).not.toBeInTheDocument();
    expect(box('Alpha plan')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('a short tap still opens the note', async () => {
    renderList();
    await screen.findByText('Alpha plan');
    const row = rowLink('Alpha plan');
    fireEvent.pointerDown(row, { button: 0, pointerType: 'touch' });
    await wait(100);
    fireEvent.pointerUp(row, { pointerType: 'touch' });
    fireEvent.click(row);
    expect(await screen.findByText('opened the note')).toBeInTheDocument();
  });

  it('a finger that moves (a scroll) is not a long press', async () => {
    renderList();
    await screen.findByText('Alpha plan');
    const row = rowLink('Alpha plan');
    fireEvent.pointerDown(row, { button: 0, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerMove(row, { pointerType: 'touch', clientX: 10, clientY: 60 });
    await wait(560);
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it('"Select" in the header enters with nothing picked; a tap toggles; the count follows', async () => {
    renderList();
    await screen.findByText('Alpha plan');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    fireEvent.click(box('Alpha plan'));
    fireEvent.click(box('Beta notes'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(box('Alpha plan'));
    expect(box('Alpha plan')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.queryByText('opened the note')).not.toBeInTheDocument();
  });

  it('Cancel leaves select mode and the rows are links again', async () => {
    renderList();
    await screen.findByText('Alpha plan');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(box('Alpha plan'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Selected notes' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Alpha plan/ })).toBeInTheDocument();
  });

  it('Esc leaves select mode', async () => {
    renderList();
    await screen.findByText('Alpha plan');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(box('Alpha plan'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('the action bar (U2)', () => {
  const bar = () => within(screen.getByRole('toolbar', { name: 'Selected notes' }));

  it('Archive needs one note; Compose needs two and says how many', async () => {
    renderList();
    await screen.findByText('Alpha plan');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(bar().getByRole('button', { name: 'Archive' })).toBeDisabled();
    expect(bar().getByRole('button', { name: 'Compose' })).toBeDisabled();

    fireEvent.click(box('Alpha plan'));
    expect(bar().getByRole('button', { name: 'Archive' })).toBeEnabled();
    expect(bar().getByRole('button', { name: 'Compose' })).toBeDisabled();

    fireEvent.click(box('Beta notes'));
    expect(bar().getByRole('button', { name: 'Compose 2 notes' })).toBeEnabled();
  });

  it('counts a selected sketch as skipped, and says so', async () => {
    renderList();
    await screen.findByText('Alpha plan');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(box('Alpha plan'));
    fireEvent.click(box('Beta notes'));
    expect(screen.queryByText(/will be skipped/)).not.toBeInTheDocument();
    fireEvent.click(box('Sketch of the shed'));
    expect(bar().getByRole('button', { name: 'Compose 3 notes' })).toBeEnabled();
    expect(bar().getByText(/^1 will be skipped/)).toBeInTheDocument();
  });

  it('will not compose a sketch and one note — fewer than two it can read', async () => {
    renderList();
    await screen.findByText('Alpha plan');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(box('Alpha plan'));
    fireEvent.click(box('Sketch of the shed'));
    expect(bar().getByRole('button', { name: 'Compose 2 notes' })).toBeDisabled();
    expect(bar().getByText('Compose needs at least two notes it can read')).toBeInTheDocument();
  });
});

describe('archiving from the selection (U2, U5, U8)', () => {
  it('archives the selected ids, ends select mode, and Undo restores them', async () => {
    const archived = vi.fn(() => ({ data: { archiveNotes: { ids: ['a', 'b'], count: 2 } } }));
    const restored = vi.fn(() => ({ data: { restoreNotes: { ids: ['a', 'b'], count: 2 } } }));
    renderList([
      { request: { query: ARCHIVE_NOTES, variables: { ids: ['a', 'b'] } }, result: archived },
      { request: { query: RESTORE_NOTES, variables: { ids: ['a', 'b'] } }, result: restored },
    ]);
    await screen.findByText('Alpha plan');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(box('Alpha plan'));
    fireEvent.click(box('Beta notes'));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(await screen.findByText('Archived 2 notes')).toBeInTheDocument();
    expect(archived).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('toolbar', { name: 'Selected notes' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(restored).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Restored 2 notes')).toBeInTheDocument();
  });

  it('keeps the selection when the archive fails', async () => {
    renderList([
      { request: { query: ARCHIVE_NOTES, variables: { ids: ['a'] } }, error: new Error('gateway down') },
    ]);
    await screen.findByText('Alpha plan');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(box('Alpha plan'));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('gateway down')).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(box('Alpha plan')).toHaveAttribute('aria-checked', 'true');
  });
});
