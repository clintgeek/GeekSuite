/**
 * Recently deleted (`/deleted`) works the way Archived does (review
 * 2026-11-18 #8, "restore works one way"): a row opens the note, select mode
 * restores several at once, and "Delete forever" — the one act that cannot be
 * undone — asks first.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { InMemoryCache } from '@apollo/client';
import { GeekToastProvider } from '@geeksuite/ui';
import { createNoteTheme } from '../../theme/createAppTheme';
import { DELETED_NOTES } from '../../graphql/queries';
import { RESTORE_NOTE, PURGE_NOTE } from '../../graphql/mutations';
import DeletedNotes from '../../pages/DeletedNotes';

const deletedNote = (id, title) => ({
  id, title, preview: `${title} body`, type: 'markdown', tags: [], pinned: false, pinnedAt: null,
  createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z',
  deletedAt: new Date(Date.now() - 3600e3).toISOString(),
});
const NOTES = [deletedNote('d1', 'Old standup template'), deletedNote('d2', 'Roof quote')];
const listMock = (notes = NOTES) => ({
  request: { query: DELETED_NOTES, variables: { limit: 200 } },
  result: { data: { deletedNotes: notes } },
  maxUsageCount: 10,
});
const restoredRow = (id) => ({
  id, deletedAt: null, title: 'x', type: 'markdown', tags: [], pinned: false, pinnedAt: null,
  createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z',
});

function renderPage(mocks, { cache } = {}) {
  return render(
    <ThemeProvider theme={createNoteTheme('light')}>
      <MockedProvider mocks={mocks} addTypename={false} cache={cache}>
        <GeekToastProvider>
          <MemoryRouter initialEntries={['/deleted']}>
            <Routes>
              <Route path="/deleted" element={<DeletedNotes />} />
              <Route path="/notes/:id" element={<div>opened the note</div>} />
            </Routes>
          </MemoryRouter>
        </GeekToastProvider>
      </MockedProvider>
    </ThemeProvider>
  );
}

const bar = () => within(screen.getByRole('toolbar', { name: 'Selected notes' }));

describe('Recently deleted — one way to restore, like Archived', () => {
  it('rows carry no per-row buttons; a row opens the note', async () => {
    renderPage([listMock()]);
    expect(await screen.findByText('Old standup template')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete forever' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: /Old standup template/ }));
    expect(await screen.findByText('opened the note')).toBeInTheDocument();
  });

  it('select mode restores the picked notes from the bar', async () => {
    const restored = vi.fn(() => ({ data: { restoreNote: restoredRow('d2') } }));
    renderPage([listMock(), { request: { query: RESTORE_NOTE, variables: { id: 'd2' } }, result: restored }]);
    await screen.findByText('Roof quote');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(bar().getByRole('button', { name: 'Restore' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Roof quote/ }));
    fireEvent.click(bar().getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restored).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Restored 1 note')).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Selected notes' })).not.toBeInTheDocument();
  });

  it('Delete forever asks first, with Cancel focused, and only then purges', async () => {
    const purged = vi.fn(() => ({ data: { purgeNote: true } }));
    renderPage([listMock(), { request: { query: PURGE_NOTE, variables: { id: 'd1' } }, result: purged }]);
    await screen.findByText('Old standup template');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Old standup template/ }));
    fireEvent.click(bar().getByRole('button', { name: 'Delete forever' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete forever?' });
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' })));
    expect(within(dialog).getByText(/Old standup template and its history/)).toBeInTheDocument();
    expect(purged).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete forever' }));
    await waitFor(() => expect(purged).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Deleted forever')).toBeInTheDocument();
  });
});

// Review 2026-11-20: a batch runs one call per note, so what failed must stay
// selected, and the lists are evicted once for the batch, not once per note.
describe('Recently deleted — a batch of several', () => {
  const pickBoth = async () => {
    await screen.findByText('Roof quote');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Old standup template/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Roof quote/ }));
  };

  it('a partial failure restores what it could and keeps the failed note selected', async () => {
    const ok = vi.fn(() => ({ data: { restoreNote: restoredRow('d1') } }));
    renderPage([
      listMock(),
      { request: { query: RESTORE_NOTE, variables: { id: 'd1' } }, result: ok },
      { request: { query: RESTORE_NOTE, variables: { id: 'd2' } }, error: new Error('The server said no.') },
    ]);
    await pickBoth();
    fireEvent.click(bar().getByRole('button', { name: 'Restore 2 notes' }));
    await waitFor(() => expect(ok).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Restored 1 note')).toBeInTheDocument();
    expect(await screen.findByText('The server said no.')).toBeInTheDocument();
    // Still selecting, with only the one that failed.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Roof quote/ })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('checkbox', { name: /Old standup template/ })).toHaveAttribute('aria-checked', 'false');
    expect(bar().getByRole('button', { name: 'Restore' })).toBeEnabled();
  });

  it('evicts the bin list once for the batch, and the bar stays disabled until it is done', async () => {
    const cache = new InMemoryCache({ addTypename: false });
    const evict = vi.spyOn(cache, 'evict');
    renderPage([
      listMock(),
      { request: { query: RESTORE_NOTE, variables: { id: 'd1' } }, result: { data: { restoreNote: restoredRow('d1') } } },
      { request: { query: RESTORE_NOTE, variables: { id: 'd2' } }, result: { data: { restoreNote: restoredRow('d2') } }, delay: 150 },
    ], { cache });
    await pickBoth();
    fireEvent.click(bar().getByRole('button', { name: 'Restore 2 notes' }));
    expect(bar().getByRole('button', { name: 'Restore 2 notes' })).toBeDisabled();
    expect(bar().getByRole('button', { name: 'Delete forever' })).toBeDisabled();
    expect(await screen.findByText('Restored 2 notes')).toBeInTheDocument();
    const binEvictions = evict.mock.calls.filter(([opts]) => opts?.fieldName === 'deletedNotes');
    expect(binEvictions).toHaveLength(1);
  });
});
