import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, render } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';

/**
 * Delete is a soft delete with Undo, and Enter never deletes (review 2026-11
 * 1.19, contract C4, decision D1).
 */

const { mocks } = vi.hoisted(() => ({
  mocks: { notify: vi.fn(() => 't1'), dismiss: vi.fn(), deleteNote: vi.fn(), restoreNoteApi: vi.fn(), refreshLists: vi.fn() },
}));

vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return { ...actual, useToast: () => ({ notify: mocks.notify, dismiss: mocks.dismiss }) };
});

vi.mock('../../store/noteStore', () => {
  const store = { get deleteNote() { return mocks.deleteNote; }, refreshLists: (...a) => mocks.refreshLists(...a), selectedError: null };
  const useStore = (selector) => (selector ? selector(store) : store);
  useStore.getState = () => store;
  return { default: useStore };
});

vi.mock('../../services/api', () => ({ restoreNoteApi: (...a) => mocks.restoreNoteApi(...a) }));

import DeleteNoteDialog from '../../components/DeleteNoteDialog';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteNote.mockResolvedValue(true);
  mocks.restoreNoteApi.mockResolvedValue({ data: { id: 'n1' } });
});

describe('DeleteNoteDialog', () => {
  it('focuses Cancel, not Delete, so Enter cannot delete', async () => {
    const onClose = vi.fn();
    renderWithProviders(<DeleteNoteDialog open onClose={onClose} noteId="n1" noteTitle="Roof" isUnsavedNote={false} />);
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Delete' }));
  });

  it('says the note can be restored for 30 days', () => {
    renderWithProviders(<DeleteNoteDialog open onClose={vi.fn()} noteId="n1" noteTitle="Roof" isUnsavedNote={false} />);
    expect(screen.getByText(/recently deleted for 30 days/i)).toBeInTheDocument();
  });

  it('deletes, then offers Undo, which restores the note', async () => {
    const onDiscarded = vi.fn();
    renderWithProviders(<DeleteNoteDialog open onClose={vi.fn()} onDiscarded={onDiscarded} noteId="n1" noteTitle="Roof" isUnsavedNote={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.deleteNote).toHaveBeenCalledWith('n1'));
    expect(onDiscarded).toHaveBeenCalled();
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('Note deleted', expect.objectContaining({ action: expect.anything() })));
    const { action } = mocks.notify.mock.calls.find((c) => c[0] === 'Note deleted')[1];
    render(action);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mocks.restoreNoteApi).toHaveBeenCalledWith('n1'));
    expect(mocks.dismiss).toHaveBeenCalledWith('t1');
  });
});
