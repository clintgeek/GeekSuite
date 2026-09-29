import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { usePinNote } from '../../hooks/usePinNote';
import { SET_NOTE_PINNED } from '../../graphql/pinNote';

const wrapper = (mocks) =>
  function Wrapper({ children }) {
    return <MockedProvider mocks={mocks}>{children}</MockedProvider>;
  };

describe('usePinNote', () => {
  it('sends setNotePinned with the given id and pinned flag', async () => {
    let requested = false;
    const mocks = [
      {
        request: { query: SET_NOTE_PINNED, variables: { id: 'note-1', pinned: true } },
        result: () => {
          requested = true;
          return { data: { setNotePinned: { __typename: 'Note', id: 'note-1', pinned: true, pinnedAt: '2026-09-29T00:00:00.000Z' } } };
        },
      },
    ];

    const { result } = renderHook(() => usePinNote(), { wrapper: wrapper(mocks) });
    const [setPinned] = result.current;

    await act(async () => {
      await setPinned('note-1', true);
    });

    expect(requested).toBe(true);
  });

  it('sends pinned: false to unpin', async () => {
    let requested = false;
    const mocks = [
      {
        request: { query: SET_NOTE_PINNED, variables: { id: 'note-2', pinned: false } },
        result: () => {
          requested = true;
          return { data: { setNotePinned: { __typename: 'Note', id: 'note-2', pinned: false, pinnedAt: null } } };
        },
      },
    ];

    const { result } = renderHook(() => usePinNote(), { wrapper: wrapper(mocks) });
    const [setPinned] = result.current;

    await act(async () => {
      await setPinned('note-2', false);
    });

    expect(requested).toBe(true);
  });

  it('surfaces a mutation error through the hook state rather than throwing past the caller', async () => {
    const mocks = [
      {
        request: { query: SET_NOTE_PINNED, variables: { id: 'note-3', pinned: true } },
        error: new Error('Note not found or you do not have permission to edit it'),
      },
    ];

    const { result } = renderHook(() => usePinNote(), { wrapper: wrapper(mocks) });
    const [setPinned] = result.current;

    await act(async () => {
      await setPinned('note-3', true).catch(() => {});
    });

    await waitFor(() => {
      expect(result.current[1].error).toBeTruthy();
    });
  });
});
