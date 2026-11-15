import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../testUtils';

/**
 * Review 2026-11, 3.1: a note already in the cache opens at once. The page
 * used to show a spinner whenever `loading` was true — and `cache-and-network`
 * keeps it true while it re-checks a note it already has — and showed an
 * error over a perfectly good cached copy when offline.
 */

const { state } = vi.hoisted(() => ({ state: { result: null } }));

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return { ...actual, useQuery: () => ({ refetch: vi.fn(), ...state.result }) };
});
vi.mock('../../store/authStore', () => {
  const store = { isAuthenticated: true };
  const useStore = (selector) => (selector ? selector(store) : store);
  useStore.getState = () => store;
  return { default: useStore };
});
vi.mock('../../components/NoteViewer', () => ({ default: () => <div>the viewer</div> }));
vi.mock('../../pages/NoteEditorPage', () => ({ default: () => <div>the editor</div> }));

import NotePage from '../../pages/NotePage';

const NOTE = { id: 'n1', title: 'Roof', content: 'x', type: 'markdown', tags: [], updatedAt: '2026-11-01T00:00:00.000Z' };

function renderPage() {
  return renderWithProviders(
    <Routes><Route path="/notes/:id" element={<NotePage />} /></Routes>,
    { route: '/notes/n1' },
  );
}

describe('NotePage — cache first (3.1)', () => {
  it('shows a cached note while the network re-checks it', () => {
    state.result = { data: { note: NOTE }, loading: true, error: undefined };
    renderPage();
    expect(screen.getByText('the viewer')).toBeInTheDocument();
    expect(screen.queryByText(/loading note/i)).toBeNull();
  });

  it('shows the cached note offline instead of an error', () => {
    state.result = { data: { note: NOTE }, loading: false, error: new Error('Failed to fetch') };
    renderPage();
    expect(screen.getByText('the viewer')).toBeInTheDocument();
  });

  it('spins only when there is nothing to show', () => {
    state.result = { data: undefined, loading: true, error: undefined };
    renderPage();
    expect(screen.getByText(/loading note/i)).toBeInTheDocument();
  });
});
