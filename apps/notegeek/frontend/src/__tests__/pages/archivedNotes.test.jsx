/**
 * The Archived view (`/archived`, DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md U7):
 * lists `archivedNotes`, explains itself when empty, and restores from select
 * mode — Restore, never Compose or Archive.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { GeekToastProvider } from '@geeksuite/ui';
import { createNoteTheme } from '../../theme/createAppTheme';
import { ARCHIVED_NOTES, RESTORE_NOTES } from '../../graphql/archive';
import ArchivedNotes from '../../pages/ArchivedNotes';
import { activeNavId, pageTitle } from '../../components/navConfig';
import { TagsPanel } from '../../components/Sidebar';

const archivedNote = (id, title, type = 'markdown') => ({
  id, title, content: `${title} body`, type, tags: [], isLocked: false, isEncrypted: false, pinned: false,
  createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z',
  archived: true, archivedAt: new Date(Date.now() - 3600e3).toISOString(),
});
const listMock = (notes) => ({
  request: { query: ARCHIVED_NOTES, variables: { limit: 200 } },
  result: { data: { archivedNotes: notes } },
  maxUsageCount: 5,
});

function renderPage(mocks) {
  return render(
    <ThemeProvider theme={createNoteTheme('light')}>
      <MockedProvider mocks={mocks} addTypename={false}>
        <GeekToastProvider>
          <MemoryRouter initialEntries={['/archived']}>
            <Routes>
              <Route path="/archived" element={<ArchivedNotes />} />
              <Route path="/notes/:id" element={<div>opened the note</div>} />
            </Routes>
          </MemoryRouter>
        </GeekToastProvider>
      </MockedProvider>
    </ThemeProvider>
  );
}

describe('Archived', () => {
  it('lists the archived notes under an "Archived" heading; a row opens the note', async () => {
    renderPage([listMock([archivedNote('a1', 'Old roof quote'), archivedNote('a2', 'Last year\'s garden')])]);
    expect(await screen.findByText('Old roof quote')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /Archived/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /Old roof quote/ }));
    expect(await screen.findByText('opened the note')).toBeInTheDocument();
  });

  it('explains what archive is when there is nothing in it', async () => {
    renderPage([listMock([])]);
    expect(await screen.findByText('Nothing archived')).toBeInTheDocument();
    expect(screen.getByText(/without deleting it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
  });

  it('select mode offers Restore (not Compose or Archive) and restores the picked notes', async () => {
    const restored = vi.fn(() => ({ data: { restoreNotes: { ids: ['a2'], count: 1 } } }));
    renderPage([
      listMock([archivedNote('a1', 'Old roof quote'), archivedNote('a2', 'Last year\'s garden')]),
      { request: { query: RESTORE_NOTES, variables: { ids: ['a2'] } }, result: restored },
    ]);
    await screen.findByText('Old roof quote');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    const bar = within(screen.getByRole('toolbar', { name: 'Selected notes' }));
    expect(bar.getByRole('button', { name: 'Restore' })).toBeDisabled();
    expect(bar.queryByRole('button', { name: /Compose/ })).not.toBeInTheDocument();
    expect(bar.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /Last year/ }));
    fireEvent.click(bar.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restored).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Restored 1 note')).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Selected notes' })).not.toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('titles the page "Archived"', () => {
    expect(pageTitle('/archived')).toBe('Archived');
    // A secondary place, not a sidebar primary row of its own.
    expect(activeNavId('/archived')).toBeUndefined();
  });

  it('is reached from the Tags panel (desktop sidebar, phone Tags sheet), beside All notes', () => {
    render(
      <ThemeProvider theme={createNoteTheme('light')}>
        <MockedProvider mocks={[]} addTypename={false}>
          <MemoryRouter initialEntries={['/archived']}>
            <TagsPanel />
          </MemoryRouter>
        </MockedProvider>
      </ThemeProvider>
    );
    const link = screen.getByRole('link', { name: 'Archived' });
    expect(link).toHaveAttribute('href', '/archived');
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});
