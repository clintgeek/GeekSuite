import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useKeyboardInset from '../../hooks/useKeyboardInset';

/** A fake visualViewport the hook can listen to. */
function fakeViewport({ height, offsetTop = 0 }) {
  const listeners = {};
  const vv = {
    height,
    offsetTop,
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
    fire: (t) => (listeners[t] || []).forEach((fn) => fn()),
  };
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
  return vv;
}

const realInner = window.innerHeight;
afterEach(() => {
  delete window.visualViewport;
  Object.defineProperty(window, 'innerHeight', { value: realInner, configurable: true });
});

describe('useKeyboardInset', () => {
  it('is the height the keyboard covers, and follows it as it opens and closes', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const vv = fakeViewport({ height: 800 });
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);

    act(() => { vv.height = 480; vv.fire('resize'); });
    expect(result.current).toBe(320);

    act(() => { vv.height = 800; vv.fire('resize'); });
    expect(result.current).toBe(0);
  });

  it('ignores browser chrome (under 80px), and a scrolled visual viewport', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const vv = fakeViewport({ height: 740 });
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
    act(() => { vv.height = 500; vv.offsetTop = 300; vv.fire('scroll'); });
    expect(result.current).toBe(0);
  });

  it('is 0 without a visualViewport', () => {
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });
});
