// @vitest-environment jsdom
/**
 * GeekSheet across the `md` breakpoint (SUITE_TODO §14, 2026-11-25): a tablet
 * rotating while a sheet is open flips it between a bottom sheet and a Dialog.
 * The children must survive: same DOM node, same value, focus kept, and no
 * second `initialFocus`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { GeekSheet } from '../surfaces/GeekSheet.jsx';
import { matchesQuery, VIEWPORTS } from './helpers/viewport.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let viewport = VIEWPORTS.tabletPortrait;
const listeners = new Set();
function installMatchMedia() {
  window.matchMedia = (query) => {
    const mql = {
      media: query,
      get matches() {
        return matchesQuery(query, viewport);
      },
      addEventListener: (_t, fn) => listeners.add(fn),
      removeEventListener: (_t, fn) => listeners.delete(fn),
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
      dispatchEvent: () => false,
    };
    return mql;
  };
}
function rotate(next) {
  viewport = next;
  act(() => {
    window.innerWidth = next.width;
    window.innerHeight = next.height;
    listeners.forEach((fn) => fn({ matches: true }));
  });
}

let root;
let container;
function mount(ui) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(ui));
}
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  listeners.clear();
  viewport = VIEWPORTS.tabletPortrait;
});

function Draft({ onMount }) {
  const [n, setN] = useState(0);
  return (
    <form>
      <input data-testid="draft" defaultValue="" ref={onMount} />
      <button type="button" data-testid="count" onClick={() => setN(n + 1)}>
        {n}
      </button>
    </form>
  );
}

const modeOf = () => document.querySelector('[data-geek-sheet="root"]')?.getAttribute('data-geek-sheet-mode');

describe('GeekSheet rotation', () => {
  it('keeps the same children mounted when the breakpoint is crossed', () => {
    installMatchMedia();
    const mounts = vi.fn();
    const onClose = vi.fn();
    mount(
      <GeekSheet open onClose={onClose} title="Edit" backToClose={false} initialFocus="input">
        <Draft onMount={(el) => el && mounts(el)} />
      </GeekSheet>
    );
    expect(modeOf()).toBe('sheet');
    const input = document.querySelector('[data-testid="draft"]');
    expect(input).toBeTruthy();

    // Type (uncontrolled), bump component state, take focus, select a range.
    act(() => {
      input.focus();
      input.value = 'half a thought';
      input.setSelectionRange(2, 5);
      document.querySelector('[data-testid="count"]').click();
    });
    expect(document.activeElement).toBe(input);

    rotate(VIEWPORTS.tabletLandscape);
    expect(modeOf()).toBe('dialog');
    const after = document.querySelector('[data-testid="draft"]');
    expect(after).toBe(input);
    expect(after.value).toBe('half a thought');
    expect(document.querySelector('[data-testid="count"]').textContent).toBe('1');
    expect(document.querySelector('[data-geek-sheet="body"]').contains(after)).toBe(true);
    expect(document.activeElement).toBe(after);
    expect([after.selectionStart, after.selectionEnd]).toEqual([2, 5]);

    rotate(VIEWPORTS.tabletPortrait);
    expect(modeOf()).toBe('sheet');
    expect(document.querySelector('[data-testid="draft"]')).toBe(input);
    expect(input.value).toBe('half a thought');
    expect(document.activeElement).toBe(input);

    // One mount of the child element, ever.
    expect(new Set(mounts.mock.calls.map((c) => c[0])).size).toBe(1);
  });

  it('Escape typed inside the children still closes the sheet, in both modes', () => {
    installMatchMedia();
    const onClose = vi.fn();
    mount(
      <GeekSheet open onClose={onClose} title="Edit" backToClose={false}>
        <input data-testid="draft" />
      </GeekSheet>
    );
    const press = () =>
      act(() => {
        document
          .querySelector('[data-testid="draft"]')
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
    press();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose.mock.calls[0][1]).toBe('escapeKeyDown');
    rotate(VIEWPORTS.tabletLandscape);
    press();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('unmounts the children when the sheet closes', async () => {
    installMatchMedia();
    function Host({ open }) {
      return (
        <GeekSheet open={open} onClose={() => {}} title="Edit" backToClose={false}>
          <input data-testid="draft" />
        </GeekSheet>
      );
    }
    mount(<Host open />);
    expect(document.querySelector('[data-testid="draft"]')).toBeTruthy();
    act(() => root.render(<Host open={false} />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(document.querySelector('[data-testid="draft"]')).toBeNull();
  });
});

describe('GeekSheet reopened', () => {
  it('shows its children again when a bottom sheet is closed and reopened', async () => {
    installMatchMedia();
    viewport = VIEWPORTS.tabletPortrait;
    const render = (open) => (
      <GeekSheet open={open} onClose={() => {}} title="Draft" mode="sheet">
        <Draft />
      </GeekSheet>
    );
    mount(render(true));
    expect(document.querySelector('[data-testid="draft"]')).not.toBeNull();
    vi.useFakeTimers();
    try {
      act(() => root.render(render(false)));
      act(() => vi.advanceTimersByTime(1000));
      act(() => root.render(render(true)));
      act(() => vi.advanceTimersByTime(1000));
    } finally {
      vi.useRealTimers();
    }
    expect(document.querySelector('[data-geek-sheet="body"] [data-testid="draft"]')).not.toBeNull();
  });
});
