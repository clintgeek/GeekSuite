import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToday } from '../useToday.js';

afterEach(() => vi.useRealTimers());

describe('useToday', () => {
  it('moves to the new day when the app comes back to the foreground', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 22, 0));
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe('2026-10-15');

    vi.setSystemTime(new Date(2026, 9, 16, 7, 30));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current).toBe('2026-10-16');
  });

  it('rolls over at midnight while open', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 23, 59, 30));
    const { result } = renderHook(() => useToday());
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current).toBe('2026-10-16');
  });
});
