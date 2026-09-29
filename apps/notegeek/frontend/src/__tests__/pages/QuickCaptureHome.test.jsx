import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';

/**
 * Home's "Pinned" group (pin UI wiring).
 *
 * The server already sorts pinned notes first; the split into a quiet
 * "Pinned" section above "Recent" is entirely client-side (QuickCaptureHome).
 * What matters here: the heading only appears when a pinned note exists, and
 * a pinned note is never rendered twice (once under Pinned, again under
 * Recent).
 */

const note = (id, title, extra = {}) => ({
  id,
  title,
  content: '',
  type: 'text',
  tags: [],
  pinned: false,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  ...extra,
});

const { mockStore } = vi.hoisted(() => ({ mockStore: { notes: [], fetchNotes: vi.fn(), isLoadingList: false, createNote: vi.fn() } }));

vi.mock('../../store/noteStore', () => {
  const useStore = (selector) => (selector ? selector(mockStore) : mockStore);
  useStore.getState = () => mockStore;
  return { default: useStore };
});

import QuickCaptureHome from '../../pages/QuickCaptureHome';

describe('QuickCaptureHome — Pinned group', () => {
  beforeEach(() => {
    mockStore.notes = [];
    mockStore.isLoadingList = false;
    mockStore.fetchNotes = vi.fn();
    mockStore.createNote = vi.fn();
  });

  it('shows a "Pinned" heading above "Recent", and does not repeat the pinned note below', () => {
    mockStore.notes = [
      note('p1', 'Roof quote', { pinned: true }),
      note('n1', 'Groceries'),
      note('n2', 'Standup notes'),
    ];
    renderWithProviders(<QuickCaptureHome />);

    const pinnedHeading = screen.getByRole('heading', { name: 'Pinned' });
    const recentHeading = screen.getByRole('heading', { name: 'Recent' });
    expect(pinnedHeading).toBeInTheDocument();
    expect(recentHeading).toBeInTheDocument();

    // "Pinned" precedes "Recent" in document order.
    expect(pinnedHeading.compareDocumentPosition(recentHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The pinned note appears once, and it is not inside the Recent section.
    expect(screen.getAllByText('Roof quote')).toHaveLength(1);
    const recentSection = recentHeading.closest('section');
    expect(within(recentSection).queryByText('Roof quote')).not.toBeInTheDocument();
    expect(within(recentSection).getByText('Groceries')).toBeInTheDocument();
  });

  it('shows no "Pinned" heading when nothing is pinned', () => {
    mockStore.notes = [note('n1', 'Groceries'), note('n2', 'Standup notes')];
    renderWithProviders(<QuickCaptureHome />);

    expect(screen.queryByRole('heading', { name: 'Pinned' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent' })).toBeInTheDocument();
  });
});
