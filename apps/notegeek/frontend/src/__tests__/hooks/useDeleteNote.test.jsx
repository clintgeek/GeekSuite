import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, render, renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

/**
 * Delete is a soft delete with Undo, so it acts at once — no confirm, the
 * same as Archive (review 2026-11-18 #8, reversing decision D1). Only
 * "Delete forever" from Recently deleted asks first.
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

import { useDeleteNote } from '../../hooks/useDeleteNote';

let where = null;
function Where() { where = useLocation().pathname; return null; }
const wrapper = ({ children }) => (
  <MemoryRouter initialEntries={['/notes/n1/edit']}>
    <Routes><Route path="*" element={<>{children}<Where /></>} /></Routes>
  </MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteNote.mockResolvedValue(true);
  mocks.restoreNoteApi.mockResolvedValue({ data: { id: 'n1' } });
});

describe('useDeleteNote', () => {
  it('deletes at once, stands the caller down, goes home, and offers Undo, which restores', async () => {
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useDeleteNote(), { wrapper });
    let ok;
    await act(async () => { ok = await result.current('n1', { onDeleted }); });
    expect(ok).toBe(true);
    expect(mocks.deleteNote).toHaveBeenCalledWith('n1');
    expect(onDeleted).toHaveBeenCalled();
    expect(where).toBe('/');
    expect(screen.queryByRole('dialog')).toBeNull();
    const call = mocks.notify.mock.calls.find((c) => c[0] === 'Note deleted');
    expect(call[1]).toMatchObject({ tone: 'success', action: expect.anything() });
    render(call[1].action);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mocks.restoreNoteApi).toHaveBeenCalledWith('n1'));
    expect(mocks.dismiss).toHaveBeenCalledWith('t1');
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('Note restored', { tone: 'success' }));
  });

  it('a failed delete says so, stays on the page, and leaves the caller alone', async () => {
    mocks.deleteNote.mockResolvedValue(false);
    const onDeleted = vi.fn();
    const { result } = renderHook(() => useDeleteNote(), { wrapper });
    await act(async () => { await result.current('n1', { onDeleted }); });
    expect(onDeleted).not.toHaveBeenCalled();
    expect(where).toBe('/notes/n1/edit');
    expect(mocks.notify).toHaveBeenCalledWith('Could not delete the note.', { tone: 'error' });
  });

  it('an Undo that fails says where the note is, and does not claim it was restored', async () => {
    mocks.restoreNoteApi.mockRejectedValue({});
    const { result } = renderHook(() => useDeleteNote(), { wrapper });
    await act(async () => { await result.current('n1'); });
    const call = mocks.notify.mock.calls.find((c) => c[0] === 'Note deleted');
    render(call[1].action);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith(
      'Could not restore it. It is in Recently deleted.', { tone: 'error' },
    ));
    expect(mocks.notify).not.toHaveBeenCalledWith('Note restored', expect.anything());
    expect(mocks.refreshLists).not.toHaveBeenCalled();
  });
});
