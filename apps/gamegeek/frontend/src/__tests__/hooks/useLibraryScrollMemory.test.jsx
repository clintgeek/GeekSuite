import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLibraryScrollMemory } from '../../hooks/useLibraryScrollMemory';

function fakeScroller({ height = 800 } = {}) {
  const el = document.createElement('div');
  const box = { top: 0, scrollHeight: height };
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => height });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => box.scrollHeight });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => box.top,
    set: (v) => {
      box.top = Math.max(0, Math.min(v, box.scrollHeight - height));
    },
  });
  return { el, box };
}

const remembered = (map) => window.sessionStorage.setItem('gamegeek.libraryScroll', JSON.stringify(map));

describe('useLibraryScrollMemory', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => window.sessionStorage.clear());

  it('coming back to a view restores its position once enough rows have rendered', () => {
    remembered({ 'genre=RPG': 2400 });
    const { el, box } = fakeScroller();
    box.top = 1234; // wherever Settings left the shared scroll container
    box.scrollHeight = 1600; // one page rendered so far
    const { rerender } = renderHook((p) => useLibraryScrollMemory(el, 'genre=RPG', p), { initialProps: { rows: 48, hasMore: true } });
    // Not tall enough yet: it goes as far as it can (which pulls the next page in).
    expect(box.top).toBe(800);
    box.scrollHeight = 3600;
    rerender({ rows: 96, hasMore: true });
    expect(box.top).toBe(2400);
  });

  it('a view with nothing remembered starts at the top', () => {
    remembered({ 'genre=RPG': 2400 });
    const { el, box } = fakeScroller();
    box.scrollHeight = 5000;
    box.top = 900;
    renderHook(() => useLibraryScrollMemory(el, 'tag=Cozy', { rows: 48, hasMore: false }));
    expect(box.top).toBe(0);
  });

  it('switching views mid-page resets, then remembers the new one as you scroll', async () => {
    const { el, box } = fakeScroller();
    box.scrollHeight = 5000;
    const { rerender } = renderHook(({ k }) => useLibraryScrollMemory(el, k, { rows: 48, hasMore: false }), { initialProps: { k: '' } });
    box.top = 1500;
    el.dispatchEvent(new Event('scroll'));
    await new Promise((r) => requestAnimationFrame(r));
    expect(JSON.parse(window.sessionStorage.getItem('gamegeek.libraryScroll'))).toEqual({ '': 1500 });
    rerender({ k: 'store=steam' });
    expect(box.top).toBe(0);
    rerender({ k: '' });
    expect(box.top).toBe(1500);
  });

  it('survives storage that throws', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
    try {
      const { el, box } = fakeScroller();
      box.scrollHeight = 5000;
      box.top = 300;
      expect(() => renderHook(() => useLibraryScrollMemory(el, '', { rows: 10 }))).not.toThrow();
      expect(box.top).toBe(0);
    } finally {
      Object.defineProperty(window, 'sessionStorage', original);
    }
  });
});
