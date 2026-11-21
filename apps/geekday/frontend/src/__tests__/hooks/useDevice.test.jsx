import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { swipeDirection, useIdle, useSwipe, useWakeLock } from '../../hooks/useDevice.js';

describe('useIdle (spec req 14)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('goes idle after the time with no input, and not before', () => {
    const { result } = renderHook(() => useIdle(120000));
    act(() => vi.advanceTimersByTime(119000));
    expect(result.current[0]).toBe(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current[0]).toBe(true);
  });

  it('any pointer or key input starts the count again', () => {
    const { result } = renderHook(() => useIdle(120000));
    act(() => vi.advanceTimersByTime(100000));
    act(() => fireEvent.pointerDown(window));
    act(() => vi.advanceTimersByTime(100000));
    expect(result.current[0]).toBe(false);
    act(() => fireEvent.keyDown(window, { key: 'a' }));
    act(() => vi.advanceTimersByTime(119999));
    expect(result.current[0]).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe(true);
  });

  it('input while idle does not wake it: only wake() does (spec req 16)', () => {
    const { result } = renderHook(() => useIdle(1000));
    act(() => vi.advanceTimersByTime(1000));
    act(() => fireEvent.pointerDown(window));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current[0]).toBe(true);
  });
});

describe('useWakeLock (spec req 15)', () => {
  afterEach(() => {
    delete navigator.wakeLock;
  });

  it('asks for the screen lock, asks again when the tab returns, and lets go on unmount', async () => {
    const sentinels = [];
    const request = vi.fn(async () => {
      const sentinel = { released: false, release: vi.fn(async () => { sentinel.released = true; }) };
      sentinels.push(sentinel);
      return sentinel;
    });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });

    const { unmount } = renderHook(() => useWakeLock(true));
    await act(async () => {});
    expect(request).toHaveBeenCalledWith('screen');

    sentinels[0].released = true; // the browser drops it when the tab is hidden
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(request).toHaveBeenCalledTimes(2);

    unmount();
    expect(sentinels[1].release).toHaveBeenCalled();
  });

  it('does nothing where the browser has no wake lock', () => {
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });

  it('a refused lock is not an error', async () => {
    Object.defineProperty(navigator, 'wakeLock', { value: { request: vi.fn().mockRejectedValue(new Error('NotAllowed')) }, configurable: true });
    renderHook(() => useWakeLock(true));
    await act(async () => {});
  });
});

describe('swipe (spec req 12)', () => {
  it('reads a quick sideways flick, and nothing else', () => {
    expect(swipeDirection(-120, 10, 200)).toBe(-1);
    expect(swipeDirection(120, -10, 200)).toBe(1);
    expect(swipeDirection(-40, 0, 200)).toBe(0); // too short
    expect(swipeDirection(-120, 90, 200)).toBe(0); // a diagonal: scrolling
    expect(swipeDirection(-120, 0, 900)).toBe(0); // too slow: a drag
  });

  function Harness({ onLeft, onRight, ignore }) {
    const ref = React.useRef(null);
    useSwipe(ref, { onLeft, onRight, ignore });
    return (
      <div ref={ref} data-testid="page">
        <input aria-label="field" />
      </div>
    );
  }

  const flick = (node, { type = 'touch', dx = -150 } = {}) => {
    const base = { pointerId: 1, pointerType: type, isPrimary: true };
    fireEvent.pointerDown(node, { ...base, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(node, { ...base, clientX: 300 + dx, clientY: 304 });
  };

  it('a finger flick left is the next day, right is the previous', () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    render(<Harness onLeft={onLeft} onRight={onRight} />);
    flick(screen.getByTestId('page'));
    expect(onLeft).toHaveBeenCalledTimes(1);
    flick(screen.getByTestId('page'), { dx: 150 });
    expect(onRight).toHaveBeenCalledTimes(1);
  });

  it('a pen or a mouse never turns the page: the pen is for writing', () => {
    const onLeft = vi.fn();
    render(<Harness onLeft={onLeft} onRight={vi.fn()} />);
    flick(screen.getByTestId('page'), { type: 'pen' });
    flick(screen.getByTestId('page'), { type: 'mouse' });
    expect(onLeft).not.toHaveBeenCalled();
  });

  it('honours the veto (a text field, a finger that draws)', () => {
    const onLeft = vi.fn();
    render(<Harness onLeft={onLeft} onRight={vi.fn()} ignore={(target) => target.tagName === 'INPUT'} />);
    flick(screen.getByRole('textbox', { name: 'field' }));
    expect(onLeft).not.toHaveBeenCalled();
  });
});
