import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// The contract under test is *when* the paid question is sent, so the
// Apollo hook is replaced by a spy that records its options.
const useQuery = vi.fn(() => ({ data: undefined, loading: false, error: undefined }));
vi.mock('@apollo/client', async (orig) => ({
  ...(await orig()),
  useQuery: (...args) => useQuery(...args),
  useApolloClient: () => ({ cache: { modify: vi.fn() } }),
}));

const { useWhatNext } = await import('../../hooks/useWhatNext');
const lastSkip = () => useQuery.mock.calls.at(-1)[1].skip;

describe('useWhatNext — on demand', () => {
  beforeEach(() => useQuery.mockClear());

  it('asks nothing when the library loads, even with the assistant on', () => {
    const { result } = renderHook(() => useWhatNext({ enabled: true, onUpdateShelf: vi.fn() }));
    expect(lastSkip()).toBe(true);
    expect(result.current.whatNextOpen).toBe(false);
  });

  it('asks on the first open, and closing keeps the answer instead of re-skipping', () => {
    const { result } = renderHook(() => useWhatNext({ enabled: true, onUpdateShelf: vi.fn() }));
    act(() => result.current.openWhatNext());
    expect(lastSkip()).toBe(false);
    expect(result.current.whatNextOpen).toBe(true);
    act(() => result.current.closeWhatNext());
    expect(result.current.whatNextOpen).toBe(false);
    expect(lastSkip()).toBe(false);
  });

  it('never asks with the assistant off, even when opened', () => {
    const { result } = renderHook(() => useWhatNext({ enabled: false, onUpdateShelf: vi.fn() }));
    act(() => result.current.openWhatNext());
    expect(lastSkip()).toBe(true);
    expect(result.current.whatNextOpen).toBe(false);
  });
});
