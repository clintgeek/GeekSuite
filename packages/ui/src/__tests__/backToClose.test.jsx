// @vitest-environment jsdom
/**
 * useBackToClose / backStack (review 3.27): Android Back closes the open
 * overlay instead of leaving the page.
 *
 * Two layers:
 *   - the stack against a FAKE history that behaves like a browser's
 *     (push truncates the forward list; go/back are async and fire popstate
 *     with the landed entry's state), so every ordering is deterministic;
 *   - the hook and the wired primitives in jsdom with react-router's real
 *     BrowserRouter, so "the router keeps working" is checked against the
 *     router, not a mock of it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode, act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';

import { BACK_STATE_KEY, createBackStack, resetBackStackForTests } from '../hooks/backStack.js';
import { useBackToClose } from '../hooks/useBackToClose.js';
import { GeekSheet } from '../surfaces/GeekSheet.jsx';
import { GeekDialog } from '../surfaces/GeekDialog.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── a browser-shaped history ───────────────────────────────────────────────
function fakeWindow(initialState = { usr: null, key: 'default', idx: 0 }) {
  const listeners = new Set();
  const entries = [{ state: initialState, url: '/' }];
  let index = 0;
  const traversals = [];
  const win = {
    addEventListener: (type, fn) => type === 'popstate' && listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
    history: {
      get state() {
        return entries[index].state;
      },
      get length() {
        return entries.length;
      },
      pushState(state, _title, url) {
        entries.splice(index + 1);
        entries.push({ state, url: url ?? entries[index].url });
        index += 1;
      },
      replaceState(state) {
        entries[index] = { ...entries[index], state };
      },
      go(delta) {
        // Async, like a real traversal: the target is resolved when it runs.
        traversals.push(delta);
        setTimeout(() => {
          const next = Math.max(0, Math.min(entries.length - 1, index + delta));
          if (next === index) return;
          index = next;
          const event = { type: 'popstate', state: entries[index].state };
          for (const fn of [...listeners]) fn(event);
        }, 0);
      },
      back() {
        this.go(-1);
      },
    },
    get index() {
      return index;
    },
    get url() {
      return entries[index].url;
    },
    traversals,
  };
  return win;
}

// Let microtasks, then queued traversals (and the popstates they cause), run.
const settle = () => new Promise((r) => setTimeout(r, 5));
const settleAll = async (n = 4) => {
  for (let i = 0; i < n; i += 1) await settle();
};

describe('backStack against a browser-shaped history', () => {
  it('open pushes one same-URL entry that keeps the router state', () => {
    const win = fakeWindow();
    const stack = createBackStack(win);
    stack.register(null, () => {});
    expect(win.index).toBe(1);
    expect(win.history.state).toMatchObject({ key: 'default', idx: 0, [BACK_STATE_KEY]: ['b1'] });
  });

  it('Back closes the overlay and pops only its entry', async () => {
    const win = fakeWindow();
    const stack = createBackStack(win);
    const onClose = vi.fn();
    const id = stack.register(null, onClose);
    win.history.back();
    await settle();
    expect(onClose).toHaveBeenCalledTimes(1);
    // The hook releases when React re-renders with open=false.
    stack.release(id);
    await settleAll();
    expect(win.index).toBe(0);
    expect(win.traversals).toEqual([-1]); // the user's Back, nothing of ours
  });

  it('closing by other means takes its entry back off without calling onClose', async () => {
    const win = fakeWindow();
    const stack = createBackStack(win);
    const onClose = vi.fn();
    const id = stack.register(null, onClose);
    stack.release(id);
    await settleAll();
    expect(win.index).toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('nested overlays: each Back closes only the top one', async () => {
    const win = fakeWindow();
    const stack = createBackStack(win);
    const closeA = vi.fn();
    const closeB = vi.fn();
    const a = stack.register(null, closeA);
    const b = stack.register(null, closeB);
    expect(win.history.state[BACK_STATE_KEY]).toEqual([a, b]);

    win.history.back();
    await settle();
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
    stack.release(b);
    await settleAll();
    expect(win.index).toBe(1);

    win.history.back();
    await settle();
    expect(closeA).toHaveBeenCalledTimes(1);
    stack.release(a);
    await settleAll();
    expect(win.index).toBe(0);
  });

  it('a parent and child closing in one commit go back once, by two', async () => {
    const win = fakeWindow();
    const stack = createBackStack(win);
    const a = stack.register(null, () => {});
    const b = stack.register(null, () => {});
    stack.release(b);
    stack.release(a);
    await settleAll();
    expect(win.traversals).toEqual([-2]);
    expect(win.index).toBe(0);
  });

  it('closing the inner overlay by button leaves the outer one open and on top', async () => {
    const win = fakeWindow();
    const stack = createBackStack(win);
    const closeA = vi.fn();
    const a = stack.register(null, closeA);
    const b = stack.register(null, () => {});
    stack.release(b);
    await settleAll();
    expect(win.index).toBe(1);
    expect(win.history.state[BACK_STATE_KEY]).toEqual([a]);
    expect(closeA).not.toHaveBeenCalled();
  });

  it('close-then-navigate: no back over the navigation, and one Back returns to the page', async () => {
    const win = fakeWindow();
    const stack = createBackStack(win);
    const onClose = vi.fn();
    const a = stack.register(null, onClose);
    // onClose(); navigate('/x') in one handler: the router pushes before
    // React commits the close.
    win.history.pushState({ usr: null, key: 'x', idx: 1 }, '', '/x');
    stack.release(a);
    await settleAll();
    expect(win.url).toBe('/x'); // the navigation stands
    expect(win.traversals).toEqual([]);

    // One Back: lands on the orphaned overlay entry, which is skipped.
    win.history.back();
    await settleAll();
    expect(win.index).toBe(0);
    expect(win.url).toBe('/');
    expect(win.traversals).toEqual([-1, -1]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a navigation from inside a still-open overlay: Back returns to the overlay, not past it', async () => {
    const win = fakeWindow();
    const stack = createBackStack(win);
    const onClose = vi.fn();
    stack.register(null, onClose);
    win.history.pushState({ usr: null, key: 'x', idx: 1 }, '', '/x');
    win.history.back();
    await settleAll();
    expect(win.index).toBe(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('landing on a page entry (navigate(-2) and the like) closes every open overlay', async () => {
    const win = fakeWindow();
    const stack = createBackStack(win);
    const closeA = vi.fn();
    const closeB = vi.fn();
    stack.register(null, closeA);
    stack.register(null, closeB);
    win.history.go(-2);
    await settle();
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).toHaveBeenCalledTimes(1);
    expect(closeB.mock.invocationCallOrder[0]).toBeLessThan(closeA.mock.invocationCallOrder[0]);
  });

  it('StrictMode cleanup-then-rerun reuses the entry instead of stacking a second', async () => {
    const win = fakeWindow();
    const stack = createBackStack(win);
    const first = stack.register(null, () => {});
    stack.release(first);
    const again = stack.register(first, () => {});
    await settleAll();
    expect(again).toBe(first);
    expect(win.index).toBe(1);
    expect(win.traversals).toEqual([]);
  });

  it('a vetoed close (onClose keeps it open) re-pushes, so the next Back still lands on it', async () => {
    const win = fakeWindow();
    const stack = createBackStack(win, { vetoRecheckMs: 1 });
    const onClose = vi.fn(); // never releases
    stack.register(null, onClose);
    win.history.back();
    await settleAll();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(win.index).toBe(1);
    win.history.back();
    await settleAll();
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

// ── the hook and the primitives, in jsdom with react-router ────────────────
let root = null;
let host = null;
const mount = async (ui) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(ui));
};
const waitFor = async (cond, ms = 1000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await act(() => new Promise((r) => setTimeout(r, 10)));
  }
};
const flushTraversals = () => act(() => new Promise((r) => setTimeout(r, 60)));

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  root = null;
  await flushTraversals();
  resetBackStackForTests();
});

function Overlay({ initiallyOpen = false, closeAndGo = null }) {
  const [open, setOpen] = useState(initiallyOpen);
  const navigate = useNavigate();
  const location = useLocation();
  useBackToClose(open, () => setOpen(false));
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="state">{open ? 'open' : 'closed'}</span>
      <button data-testid="open" onClick={() => setOpen(true)} />
      <button data-testid="close" onClick={() => setOpen(false)} />
      <button
        data-testid="close-and-go"
        onClick={() => {
          setOpen(false);
          navigate(closeAndGo);
        }}
      />
    </div>
  );
}
const q = (id) => host.querySelector(`[data-testid="${id}"]`);
const click = (id) => act(async () => q(id).dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('useBackToClose with react-router', () => {
  it('Back closes the overlay and the route stays put', async () => {
    window.history.replaceState(null, '', '/notes');
    await mount(<BrowserRouter><Overlay /></BrowserRouter>);
    await click('open');
    expect(window.history.state[BACK_STATE_KEY]).toHaveLength(1);
    await act(async () => window.history.back());
    await waitFor(() => q('state').textContent === 'closed');
    expect(q('path').textContent).toBe('/notes');
    expect(window.location.pathname).toBe('/notes');
  });

  it('closing with a button leaves no entry behind', async () => {
    window.history.replaceState(null, '', '/a');
    await mount(<BrowserRouter><Overlay /></BrowserRouter>);
    await click('open');
    expect(window.history.state[BACK_STATE_KEY]).toHaveLength(1);
    await click('close');
    await waitFor(() => !window.history.state?.[BACK_STATE_KEY]);
    expect(q('path').textContent).toBe('/a');
  });

  it('close-then-navigate keeps the navigation, and one Back returns to the page', async () => {
    window.history.replaceState(null, '', '/list');
    await mount(<BrowserRouter><Overlay closeAndGo="/settings" /></BrowserRouter>);
    await click('open');
    await click('close-and-go');
    await flushTraversals();
    expect(window.location.pathname).toBe('/settings');
    expect(q('path').textContent).toBe('/settings');
    await act(async () => window.history.back());
    await flushTraversals();
    await flushTraversals();
    expect(window.location.pathname).toBe('/list');
    expect(q('path').textContent).toBe('/list');
    // And it is the original entry, not the overlay's orphan.
    expect(window.history.state?.[BACK_STATE_KEY]).toBeUndefined();
  });

  it('works under StrictMode (one entry, not two)', async () => {
    window.history.replaceState(null, '', '/s');
    // Mounted open: StrictMode double-runs effects on mount only.
    await mount(<StrictMode><BrowserRouter><Overlay initiallyOpen /></BrowserRouter></StrictMode>);
    await flushTraversals();
    // A second push would read [b1, b2].
    expect(window.history.state[BACK_STATE_KEY]).toHaveLength(1);
    await act(async () => window.history.back());
    await waitFor(() => q('state').textContent === 'closed');
    await flushTraversals();
    expect(window.location.pathname).toBe('/s');
    expect(window.history.state?.[BACK_STATE_KEY]).toBeUndefined();
  });
});

describe('the wired primitives', () => {
  it('GeekSheet: Back calls onClose with reason "backButton"', async () => {
    const onClose = vi.fn();
    await mount(<GeekSheet open onClose={onClose} title="Pick" mode="sheet">x</GeekSheet>);
    expect(window.history.state?.[BACK_STATE_KEY]).toHaveLength(1);
    await act(async () => window.history.back());
    await waitFor(() => onClose.mock.calls.length > 0);
    expect(onClose.mock.calls[0][1]).toBe('backButton');
  });

  it('GeekSheet backToClose={false} pushes nothing', async () => {
    window.history.replaceState(null, '', '/plain');
    await mount(<GeekSheet open onClose={() => {}} title="Pick" mode="dialog" backToClose={false}>x</GeekSheet>);
    await flushTraversals();
    expect(window.history.state?.[BACK_STATE_KEY]).toBeUndefined();
  });

  it('GeekDialog: Back calls onClose with reason "backButton"', async () => {
    const onClose = vi.fn();
    await mount(<GeekDialog open onClose={onClose} title="Edit">x</GeekDialog>);
    expect(window.history.state?.[BACK_STATE_KEY]).toHaveLength(1);
    await act(async () => window.history.back());
    await waitFor(() => onClose.mock.calls.length > 0);
    expect(onClose.mock.calls[0][1]).toBe('backButton');
  });

  it('GeekDialog disableClose: Back is swallowed and the entry comes back', async () => {
    const onClose = vi.fn();
    await mount(<GeekDialog open onClose={onClose} title="Saving" disableClose>x</GeekDialog>);
    await act(async () => window.history.back());
    await waitFor(() => Array.isArray(window.history.state?.[BACK_STATE_KEY]), 1500);
    expect(onClose).not.toHaveBeenCalled();
  });
});
