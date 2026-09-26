import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { useInfiniteSentinel } from '../hooks/useInfiniteSentinel';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useSectionOpen } from '../ui/filterUi';

describe('useInfiniteSentinel', () => {
  const observers = [];
  const RealIO = window.IntersectionObserver;
  afterEach(() => {
    window.IntersectionObserver = RealIO;
    observers.length = 0;
  });

  function installFakeIO() {
    window.IntersectionObserver = class {
      constructor(cb, opts) {
        this.cb = cb;
        this.opts = opts;
        observers.push(this);
      }
      observe() {}
      disconnect() {
        this.dead = true;
      }
    };
  }

  function Sentinel(props) {
    const ref = useInfiniteSentinel(props.onMore, props);
    return <div ref={ref} />;
  }

  it('calls once per load even when the observer reports twice, and looks ahead from the given root', () => {
    installFakeIO();
    const onMore = vi.fn(() => new Promise(() => {}));
    render(<Sentinel onMore={onMore} rootMargin="300px" />);
    const io = observers.at(-1);
    expect(io.opts).toEqual({ root: null, rootMargin: '300px' });
    act(() => io.cb([{ isIntersecting: true }]));
    act(() => io.cb([{ isIntersecting: true }]));
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('re-arms when busy drops, and stays quiet when disabled', () => {
    installFakeIO();
    const onMore = vi.fn();
    const { rerender } = render(<Sentinel onMore={onMore} busy={false} />);
    act(() => observers.at(-1).cb([{ isIntersecting: true }]));
    rerender(<Sentinel onMore={onMore} busy />);
    rerender(<Sentinel onMore={onMore} busy={false} />);
    act(() => observers.at(-1).cb([{ isIntersecting: true }]));
    expect(onMore).toHaveBeenCalledTimes(2);
    const count = observers.length;
    rerender(<Sentinel onMore={onMore} enabled={false} />);
    expect(observers.length).toBe(count);
  });
});

describe('useDebouncedValue', () => {
  it('settles after the delay', () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 100), { initialProps: { v: 'a' } });
      rerender({ v: 'b' });
      expect(result.current).toBe('a');
      act(() => vi.advanceTimersByTime(100));
      expect(result.current).toBe('b');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useSectionOpen', () => {
  afterEach(() => window.localStorage.clear());

  it('starts from the defaults, remembers toggles per key, and survives junk in storage', () => {
    const { result, unmount } = renderHook(() => useSectionOpen('books.sections', { shelf: true }));
    expect(result.current[0]).toEqual({ shelf: true });
    act(() => result.current[1]('tags'));
    expect(JSON.parse(window.localStorage.getItem('books.sections'))).toEqual({ shelf: true, tags: true });
    unmount();
    const again = renderHook(() => useSectionOpen('books.sections', { shelf: true, year: true }));
    expect(again.result.current[0]).toEqual({ shelf: true, year: true, tags: true });
    window.localStorage.setItem('other', 'not json');
    expect(renderHook(() => useSectionOpen('other', { a: true })).result.current[0]).toEqual({ a: true });
  });
});
