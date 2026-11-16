import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const mutate = vi.fn();
const navigate = vi.fn();
vi.mock('@apollo/client', async (orig) => ({
  ...(await orig()),
  useApolloClient: () => ({ mutate, cache: {} }),
}));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
const authFetch = vi.fn();
vi.mock('../../utils/authFetch', () => ({ authFetch: (...a) => authFetch(...a) }));
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

/**
 * SUITE_REVIEW_2026-11 BookGeek #1: once `createBook` answered, a failed
 * later step (the upload, the Manga/Comic tag) left "Create" as the only
 * button, and tapping it made a second book. A retry must reuse the id.
 */
describe('useAddBook — a failed step after create never creates twice', () => {
  const createCalls = () => mutate.mock.calls.filter(([o]) => o.mutation === CREATE_BOOK);
  const tagCalls = () => mutate.mock.calls.filter(([o]) => o.mutation === UPDATE_BOOK);
  const ok = () => ({ ok: true, status: 200, json: async () => ({ success: true, data: { _id: 'b77' } }) });
  const tooBig = () => ({ ok: false, status: 413, json: async () => { throw new Error('html'); } });

  beforeEach(() => {
    mutate.mockReset();
    navigate.mockReset();
    authFetch.mockReset();
    mutate.mockImplementation(async ({ mutation }) =>
      mutation === CREATE_BOOK ? { data: { createBook: { id: 'b77' } } } : { data: { updateBook: { id: 'b77' } } });
  });

  const start = (kind) => {
    const hook = renderHook(() => useAddBook({ params: { search: '' } }));
    act(() => {
      hook.result.current.setAddBookOpen(true);
      hook.result.current.setAddBookTitle('A Big Manga');
      hook.result.current.setAddBookFile(new File(['x'], 'big.epub'));
      if (kind) hook.result.current.setAddBookKind(kind);
    });
    return hook.result;
  };
  const submit = async (result) => { await act(async () => { await result.current.handleCreateBook(); }); };

  it('an upload that fails keeps the book, says so, and the retry uploads to the same id', async () => {
    authFetch.mockResolvedValueOnce(tooBig()).mockResolvedValueOnce(ok());
    const result = start('');
    await submit(result);
    expect(createCalls()).toHaveLength(1);
    expect(result.current.addBookCreatedId).toBe('b77');
    expect(result.current.addBookError).toMatch(/in your library, but the file did not attach \(the file is too big/);
    expect(navigate).not.toHaveBeenCalled();

    await submit(result);
    expect(createCalls()).toHaveLength(1);
    expect(authFetch).toHaveBeenCalledTimes(2);
    expect(authFetch.mock.calls[1][0]).toBe('/books/b77/upload');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0]).toMatch(/b77/);
  });

  it('a tag that fails is retried alone; a tag that landed is not re-sent when the upload is retried', async () => {
    let tagAttempts = 0;
    mutate.mockImplementation(async ({ mutation }) => {
      if (mutation === CREATE_BOOK) return { data: { createBook: { id: 'b77' } } };
      tagAttempts += 1;
      if (tagAttempts === 1) throw new Error('network');
      return { data: { updateBook: { id: 'b77' } } };
    });
    authFetch.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce(ok());
    const result = start('manga');

    await submit(result); // tag fails
    expect(result.current.addBookError).toMatch(/could not be marked as Manga/);
    await submit(result); // tag lands, upload fails
    expect(result.current.addBookError).toMatch(/file did not attach/);
    await submit(result); // upload lands
    expect(createCalls()).toHaveLength(1);
    expect(tagCalls()).toHaveLength(2);
    expect(authFetch).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('"Open book" after a failed upload opens the book that was made, without another create', async () => {
    authFetch.mockResolvedValueOnce(tooBig());
    const result = start('');
    await submit(result);
    act(() => result.current.openCreatedBook());
    expect(createCalls()).toHaveLength(1);
    expect(navigate.mock.calls[0][0]).toMatch(/b77/);
    expect(result.current.addBookOpen).toBe(false);
  });

  it('closing the dialog forgets the half-finished book, so the next Create makes a new one', async () => {
    authFetch.mockResolvedValueOnce(tooBig()).mockResolvedValueOnce(ok());
    const result = start('');
    await submit(result);
    act(() => result.current.setAddBookOpen(false));
    expect(result.current.addBookCreatedId).toBe(null);
    act(() => {
      result.current.setAddBookOpen(true);
      result.current.setAddBookTitle('Another book');
    });
    await submit(result);
    expect(createCalls()).toHaveLength(2);
  });
});
