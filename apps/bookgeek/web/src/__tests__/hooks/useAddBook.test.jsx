import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const mutate = vi.fn();
const navigate = vi.fn();
vi.mock('@apollo/client', async (orig) => ({
  ...(await orig()),
  useApolloClient: () => ({ mutate, cache: {} }),
}));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
vi.mock('../../graphql/cachePolicies.js', () => ({
  refreshLibraryList: vi.fn(async () => {}),
  writeRestBook: vi.fn(),
}));

import { useAddBook } from '../../hooks/useAddBook';
import { CREATE_BOOK, UPDATE_BOOK } from '../../graphql/mutations.js';

/**
 * The Add-book dialog's Manga / Comic choice (2026-11-15). Chef's manga are
 * EPUBs, which say nothing about being manga, and the dialog had nowhere to
 * say so. `createBook` takes no tags, so the choice is a second call that
 * writes the SHARED tag.
 */
describe('useAddBook — Manga / Comic', () => {
  beforeEach(() => {
    mutate.mockReset();
    navigate.mockReset();
    mutate.mockImplementation(async ({ mutation }) =>
      mutation === CREATE_BOOK ? { data: { createBook: { id: 'b77' } } } : { data: { updateBook: { id: 'b77' } } });
  });

  const create = async (kind) => {
    const { result } = renderHook(() => useAddBook({ params: { search: '' } }));
    act(() => {
      result.current.setAddBookOpen(true);
      result.current.setAddBookTitle('Death Note Vol 3');
      if (kind) result.current.setAddBookKind(kind);
    });
    await act(async () => { await result.current.handleCreateBook(); });
    return result;
  };
  const tagCalls = () => mutate.mock.calls.filter(([o]) => o.mutation === UPDATE_BOOK);

  it('Manga tags the new book "Manga", on the shared tags', async () => {
    await create('manga');
    expect(tagCalls()).toHaveLength(1);
    expect(tagCalls()[0][0].variables).toEqual({ id: 'b77', input: { tags: ['Manga'] } });
    expect(navigate).toHaveBeenCalled();
  });

  it('Comic tags it "Comics"', async () => {
    await create('comic');
    expect(tagCalls()[0][0].variables.input).toEqual({ tags: ['Comics'] });
  });

  it('an ordinary book gets no tag call at all', async () => {
    await create('');
    expect(tagCalls()).toHaveLength(0);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('the choice does not carry over to the next book', async () => {
    const result = await create('manga');
    expect(result.current.addBookKind).toBe('');
  });

  it('says so when the book was created but the tag failed', async () => {
    mutate.mockImplementation(async ({ mutation }) => {
      if (mutation === CREATE_BOOK) return { data: { createBook: { id: 'b77' } } };
      throw new Error('boom');
    });
    const result = await create('manga');
    expect(result.current.addBookError).toMatch(/could not be marked as Manga/);
  });
});
