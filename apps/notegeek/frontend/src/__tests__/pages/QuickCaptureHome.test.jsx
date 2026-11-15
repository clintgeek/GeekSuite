import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
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

const { toast } = vi.hoisted(() => ({ toast: { notify: vi.fn() } }));
vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify: toast.notify, dismiss: vi.fn() }) };
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

describe('QuickCaptureHome — Fold into a note', () => {
  beforeEach(() => {
    mockStore.notes = [];
    mockStore.isLoadingList = false;
    mockStore.fetchNotes = vi.fn();
    mockStore.createNote = vi.fn();
  });

  it('offers "Fold into an existing note" only once something is typed, and it opens the picker', async () => {
    renderWithProviders(<QuickCaptureHome />);
    expect(screen.queryByRole('button', { name: 'Fold into an existing note' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Quick capture'), { target: { value: 'brown widow in the garage' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fold into an existing note' }));
    expect(await screen.findByText('Fold into a note')).toBeInTheDocument();
    expect(screen.getByLabelText('Find a note')).toBeInTheDocument();
    // Picking is not saving: nothing was created.
    expect(mockStore.createNote).not.toHaveBeenCalled();
  });
});

describe('QuickCaptureHome — capture integrity (review 1.21, 3.5)', () => {
  beforeEach(() => {
    mockStore.notes = [];
    mockStore.isLoadingList = false;
    mockStore.listError = null;
    mockStore.selectedError = null;
    mockStore.fetchNotes = vi.fn();
    mockStore.createNote = vi.fn();
  });

  const box = () => screen.getByRole('textbox', { name: 'Quick capture' });

  it('keeps line breaks', async () => {
    mockStore.createNote = vi.fn().mockResolvedValue({ id: 'n9' });
    renderWithProviders(<QuickCaptureHome />);
    fireEvent.change(box(), { target: { value: 'groceries\n- milk\n- eggs\n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(mockStore.createNote).toHaveBeenCalledTimes(1));
    expect(mockStore.createNote.mock.calls[0][0].content).toBe('groceries\n- milk\n- eggs');
  });

  it('a double tap saves once', async () => {
    let resolve;
    mockStore.createNote = vi.fn(() => new Promise((r) => { resolve = r; }));
    renderWithProviders(<QuickCaptureHome />);
    fireEvent.change(box(), { target: { value: 'one thought' } });
    const save = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(mockStore.createNote).toHaveBeenCalledTimes(1);
    resolve({ id: 'n1' });
    await vi.waitFor(() => expect(box().value).toBe(''));
  });

  it('says so when the save fails, and keeps the text', async () => {
    mockStore.createNote = vi.fn().mockResolvedValue(null);
    mockStore.selectedError = 'Network down';
    renderWithProviders(<QuickCaptureHome />);
    fireEvent.change(box(), { target: { value: 'do not lose me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(toast.notify).toHaveBeenCalledWith(expect.stringMatching(/not saved — Network down/i), { tone: 'error' }));
    expect(box().value).toBe('do not lose me');
  });

  it('fetches only what it shows, and keeps cached notes on screen while refreshing', () => {
    mockStore.notes = [note('n1', 'Groceries')];
    mockStore.isLoadingList = true;
    const { container } = renderWithProviders(<QuickCaptureHome />);
    expect(mockStore.fetchNotes).toHaveBeenCalledWith({ limit: 12 });
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(container.querySelectorAll('.MuiSkeleton-root')).toHaveLength(0);
  });

  it('shows a failed load as an error, not "Nothing here yet"', () => {
    mockStore.listError = 'Failed to fetch notes';
    renderWithProviders(<QuickCaptureHome />);
    expect(screen.queryByText('Nothing here yet')).toBeNull();
    expect(screen.getByRole('button', { name: /retry|try again/i })).toBeInTheDocument();
  });
});
