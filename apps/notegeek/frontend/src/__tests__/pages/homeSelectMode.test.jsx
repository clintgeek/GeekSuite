/**
 * Select mode on Home (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md U1). Home's rows
 * open notes by `onClick` + navigate (not a Link like the lists), so the
 * long-press has its own path to cover here.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { createNoteTheme } from '../../theme/createAppTheme';

const { NOTES } = vi.hoisted(() => {
  const iso = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  return { NOTES: [
  { id: 'a', title: 'Alpha plan', content: 'a', type: 'markdown', tags: [], pinned: false, createdAt: iso(50), updatedAt: iso(1) },
  { id: 'b', title: 'Beta notes', content: 'b', type: 'markdown', tags: [], pinned: false, createdAt: iso(60), updatedAt: iso(2) },
  ] };
});

vi.mock('../../store/noteStore', () => {
  const store = { notes: NOTES, fetchNotes: vi.fn(), createNote: vi.fn(), isLoadingList: false };
  const useNoteStore = (sel) => (sel ? sel(store) : store);
  useNoteStore.getState = () => store;
  return { default: useNoteStore };
});

import QuickCaptureHome from '../../pages/QuickCaptureHome';

function renderHome() {
  return render(
    <ThemeProvider theme={createNoteTheme('light')}>
      <MockedProvider mocks={[]} addTypename={false}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<QuickCaptureHome />} />
            <Route path="/notes/:id" element={<div>opened the note</div>} />
          </Routes>
        </MemoryRouter>
      </MockedProvider>
    </ThemeProvider>
  );
}

describe('Home select mode', () => {
  it('a long press on a recent note selects it instead of opening it', async () => {
    renderHome();
    const row = screen.getByText('Alpha plan').closest('[data-note-row]');
    fireEvent.pointerDown(row, { button: 0, pointerType: 'touch' });
    await act(() => new Promise((r) => setTimeout(r, 560)));
    fireEvent.pointerUp(row, { pointerType: 'touch' });
    fireEvent.click(screen.getByText('Alpha plan').closest('[data-note-row]'));
    expect(screen.queryByText('opened the note')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Alpha plan/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Selected notes' })).toBeInTheDocument();
  });

  it('a tap still opens the note; "Select" enters select mode', async () => {
    renderHome();
    fireEvent.click(screen.getByText('Beta notes').closest('[data-note-row]'));
    expect(await screen.findByText('opened the note')).toBeInTheDocument();
  });

  it('"Select" in the Recent heading enters select mode', () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });
});
