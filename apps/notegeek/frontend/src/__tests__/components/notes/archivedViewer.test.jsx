/**
 * Archive in the read-only viewer and the archived banner
 * (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md U6, U8).
 *
 * MockedProvider WITH typenames here (unlike testUtils' default), so the
 * cache normalizes `Note:<id>` the way production does — the banner flipping
 * after Archive / Restore is the cache update under test, not a refetch.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { GeekToastProvider } from '@geeksuite/ui';
import { createNoteTheme } from '../../../theme/createAppTheme';
import { GET_NOTE_BY_ID } from '../../../graphql/queries';
import { NOTE_ARCHIVE_STATE, ARCHIVE_NOTES, RESTORE_NOTES } from '../../../graphql/archive';
import NoteViewer from '../../../components/NoteViewer';

const NOTE = {
  __typename: 'Note',
  id: 'n1',
  title: 'Roof leak',
  content: '# Roof\n\nPatch the flashing.',
  type: 'markdown',
  tags: [],
  isLocked: false,
  isEncrypted: false,
  pinned: false,
  pinnedAt: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
};

const stateMock = (archived) => ({
  request: { query: NOTE_ARCHIVE_STATE, variables: { id: 'n1' } },
  result: { data: { note: { __typename: 'Note', id: 'n1', archived, archivedAt: archived ? '2026-10-08T12:00:00.000Z' : null } } },
  maxUsageCount: 5,
});
const noteMock = { request: { query: GET_NOTE_BY_ID, variables: { id: 'n1' } }, result: { data: { note: NOTE } }, maxUsageCount: 5 };

function renderViewer(mocks) {
  return render(
    <ThemeProvider theme={createNoteTheme('light')}>
      <MockedProvider mocks={mocks}>
        <GeekToastProvider>
          <MemoryRouter initialEntries={['/notes/n1']}>
            <Routes>
              <Route path="/notes/:id" element={<NoteViewer />} />
            </Routes>
          </MemoryRouter>
        </GeekToastProvider>
      </MockedProvider>
    </ThemeProvider>
  );
}

beforeEach(() => { vi.clearAllMocks(); });

describe('an archived note opened directly', () => {
  it('shows "Archived <date>" with Restore, and Restore brings it back', async () => {
    const restored = vi.fn(() => ({ data: { restoreNotes: { __typename: 'ArchiveResult', ids: ['n1'], count: 1 } } }));
    renderViewer([
      noteMock,
      stateMock(true),
      { request: { query: RESTORE_NOTES, variables: { ids: ['n1'] } }, result: restored },
    ]);
    const banner = await waitFor(() => {
      const el = document.querySelector('[data-archived-banner]');
      if (!el) throw new Error('no banner yet');
      return el;
    });
    expect(banner).toHaveTextContent('Archived Oct 8, 2026');
    // The note itself is all there.
    expect(screen.getAllByText('Patch the flashing.').length).toBeGreaterThan(0);
    // The action bar offers Restore, not Archive.
    expect(screen.getByRole('button', { name: 'Restore from archive' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restored).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelector('[data-archived-banner]')).toBeNull());
    expect(await screen.findByText('Restored 1 note')).toBeInTheDocument();
  });
});

describe('Archive from the viewer', () => {
  it('archives this note, the banner appears, and the toast has Undo', async () => {
    const archived = vi.fn(() => ({ data: { archiveNotes: { __typename: 'ArchiveResult', ids: ['n1'], count: 1 } } }));
    renderViewer([
      noteMock,
      stateMock(false),
      { request: { query: ARCHIVE_NOTES, variables: { ids: ['n1'] } }, result: archived },
    ]);
    await screen.findAllByText('Patch the flashing.');
    expect(document.querySelector('[data-archived-banner]')).toBeNull();
    const btn = await screen.findByRole('button', { name: 'Archive' });
    fireEvent.click(btn);
    await waitFor(() => expect(archived).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelector('[data-archived-banner]')).not.toBeNull());
    expect(await screen.findByText('Archived 1 note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });
});
