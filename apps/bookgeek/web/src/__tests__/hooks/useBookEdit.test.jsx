/**
 * SUITE_REVIEW_2026-11 BookGeek #6: Edit metadata sent EVERY catalog field on
 * every save, from the draft taken when the dialog opened — so a title or
 * description changed meanwhile on the other device (or by an enrich job)
 * was put back. Only what changed in this dialog may be sent.
 */
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@apollo/client', async (orig) => ({ ...(await orig()), useApolloClient: () => ({ query: vi.fn() }) }));

import { useBookEdit } from '../../hooks/useBookEdit';

const BOOK = {
  id: 'b1',
  title: 'Lock In',
  authors: ['John Scalzi'],
  description: 'Old blurb',
  publisher: 'Tor',
  isbn: '123',
  review: '',
  myTags: [],
  rating: 4,
  dateFinished: '2024-03-10T00:00:00.000Z',
};

function mount(updateBook = vi.fn(async () => ({}))) {
  const hook = renderHook(({ book }) => useBookEdit({ selectedBook: book, updateBook }), { initialProps: { book: BOOK } });
  return { ...hook, updateBook };
}

describe('useBookEdit — sends only the fields that changed', () => {
  it('editing the review sends the review alone, even after another device changed the title', async () => {
    const { result, rerender, updateBook } = mount();
    act(() => result.current.beginEditForSelectedBook());
    act(() => result.current.setEditDraft((d) => ({ ...d, review: 'Loved it' })));
    // The other device renamed it while this dialog was open.
    rerender({ book: { ...BOOK, title: 'Lock In (2014)', description: 'New blurb', dateFinished: '2025-01-01T00:00:00.000Z' } });

    await act(async () => { await result.current.handleSaveEditForSelectedBook(); });

    expect(updateBook).toHaveBeenCalledTimes(1);
    expect(updateBook.mock.calls[0][1]).toEqual({ review: 'Loved it' });
  });

  it('a save with nothing changed closes without a write', async () => {
    const { result, updateBook } = mount();
    act(() => result.current.beginEditForSelectedBook());
    await act(async () => { await result.current.handleSaveEditForSelectedBook(); });
    expect(updateBook).not.toHaveBeenCalled();
    expect(result.current.editMode).toBe(false);
  });

  it('clearing a field still sends it, as null', async () => {
    const { result, updateBook } = mount();
    act(() => result.current.beginEditForSelectedBook());
    act(() => result.current.setEditDraft((d) => ({ ...d, publisher: '', authors: 'John Scalzi, Someone Else' })));
    await act(async () => { await result.current.handleSaveEditForSelectedBook(); });
    expect(updateBook.mock.calls[0][1]).toEqual({ publisher: null, authors: ['John Scalzi', 'Someone Else'] });
  });
});
