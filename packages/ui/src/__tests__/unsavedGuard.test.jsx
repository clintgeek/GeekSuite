// @vitest-environment jsdom
/**
 * useUnsavedGuard (plan 2.4): a dirty form asks "Discard changes?" before
 * Back / Escape / backdrop / close take it away; a clean one is untouched.
 * Run against the real GeekDialog / GeekSheet, the shared back stack and
 * react-router's BrowserRouter, including a route-driven sheet that passes
 * backToClose={false}.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { BACK_STATE_KEY, resetBackStackForTests } from '../hooks/backStack.js';
import { GEEK_DRAFT_PREFIX, GeekDialog, GeekSheet, readGeekDraft, useUnsavedGuard } from '../index.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root = null;
let host = null;
const mount = async (ui) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(ui));
};
const tick = (ms = 10) => act(() => new Promise((r) => setTimeout(r, ms)));
const waitFor = async (cond, ms = 1500) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await tick();
  }
};
const $ = (sel) => document.body.querySelector(sel);
const click = (el) => act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const back = () => act(async () => window.history.back());
const backIds = () => window.history.state?.[BACK_STATE_KEY];
const promptOpen = () => Boolean($('[data-geek-unsaved="discard"]'));

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  root = null;
  await tick(150);
  resetBackStackForTests();
  try {
    window.localStorage.clear();
  } catch {
    /* none */
  }
  document.body.innerHTML = '';
});

let guardRef = null;

/** A dialog-or-sheet editor: open, a text field, dirty when it differs. */
function Editor({ surface = 'dialog', onDiscard = () => {}, startOpen = true, draftKey, guardOff = false, keepTextOnDiscard = false }) {
  const [open, setOpen] = useState(startOpen);
  const [text, setText] = useState('');
  const dirty = text !== '';
  const guard = useUnsavedGuard({
    dirty: guardOff ? false : dirty,
    enabled: open,
    draftKey,
    draftValue: text,
    onDiscard: (event, reason) => {
      onDiscard(event, reason);
      setOpen(false);
      if (!keepTextOnDiscard) setText('');
    },
  });
  guardRef = guard;
  const body = (
    <>
      <input data-testid="field" value={text} onChange={(e) => setText(e.target.value)} />
      <button data-testid="type" onClick={() => setText('hello')} />
      <button data-testid="save" onClick={() => { setText(''); setOpen(false); }} />
    </>
  );
  return (
    <div>
      <span data-testid="state">{open ? 'open' : 'closed'}</span>
      <button data-testid="restore" onClick={() => setText(guard.draft ?? '')} />
      {surface === 'dialog' ? (
        <GeekDialog open={open} onClose={guard.requestClose} title="Edit" mode="window">
          {body}
        </GeekDialog>
      ) : (
        <GeekSheet open={open} onClose={guard.requestClose} title="Edit" mode="sheet">
          {body}
        </GeekSheet>
      )}
      {guard.prompt}
    </div>
  );
}
const state = () => $('[data-testid="state"]').textContent;

describe('useUnsavedGuard — clean is invisible', () => {
  it('a clean close goes straight through, pushes nothing extra and arms no unload prompt', async () => {
    const onDiscard = vi.fn();
    await mount(<Editor onDiscard={onDiscard} />);
    expect(backIds()).toHaveLength(1); // the dialog's own entry only
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    await click($('[data-geek-dialog="close"]'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onDiscard.mock.calls[0][1]).toBe('closeClick');
    expect(promptOpen()).toBe(false);
    expect(state()).toBe('closed');
  });

  it('Back on a clean dialog just closes it', async () => {
    const onDiscard = vi.fn();
    await mount(<Editor onDiscard={onDiscard} />);
    await back();
    await waitFor(() => state() === 'closed');
    expect(onDiscard.mock.calls[0][1]).toBe('backButton');
  });
});

describe('useUnsavedGuard — dirty asks first', () => {
  it('GeekDialog ✕: asks; Keep editing keeps the form; Discard closes with the original reason', async () => {
    const onDiscard = vi.fn();
    await mount(<Editor onDiscard={onDiscard} />);
    await click($('[data-testid="type"]'));
    await click($('[data-geek-dialog="close"]'));
    expect(promptOpen()).toBe(true);
    expect(onDiscard).not.toHaveBeenCalled();
    expect($('[data-geek-unsaved="prompt"] [role="alertdialog"], [role="alertdialog"]')).toBeTruthy();

    await click($('[data-geek-unsaved="keep"]'));
    await waitFor(() => !guardRef.confirming);
    expect(state()).toBe('open');
    expect($('[data-testid="field"]').value).toBe('hello');

    await click($('[data-geek-dialog="close"]'));
    await click($('[data-geek-unsaved="discard"]'));
    await waitFor(() => onDiscard.mock.calls.length > 0);
    expect(onDiscard.mock.calls[0][1]).toBe('closeClick');
    await waitFor(() => state() === 'closed');
    await tick(150);
    expect(backIds()).toBeUndefined(); // no entry left behind
  });

  it('GeekSheet Escape and backdrop ask too', async () => {
    const onDiscard = vi.fn();
    await mount(<Editor surface="sheet" onDiscard={onDiscard} />);
    await click($('[data-testid="type"]'));
    const paper = $('[data-geek-sheet="paper"]');
    await act(async () =>
      paper.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(promptOpen()).toBe(true);
    expect(onDiscard).not.toHaveBeenCalled();
    await click($('[data-geek-unsaved="keep"]'));
    await waitFor(() => !guardRef.confirming);

    await act(async () => guardRef.requestClose({}, 'backdropClick'));
    expect(guardRef.confirming).toBe(true);
    await click($('[data-geek-unsaved="discard"]'));
    await waitFor(() => onDiscard.mock.calls.length > 0);
    expect(onDiscard.mock.calls[0][1]).toBe('backdropClick');
  });

  it('Back asks instead of closing, and the guard owns an entry above the surface', async () => {
    window.history.replaceState(null, '', '/notes');
    const onDiscard = vi.fn();
    await mount(<Editor onDiscard={onDiscard} />);
    await click($('[data-testid="type"]'));
    expect(backIds()).toHaveLength(2); // dialog + guard

    await back();
    await waitFor(() => promptOpen());
    expect(onDiscard).not.toHaveBeenCalled();
    expect(state()).toBe('open');
    // The entry comes back, so the next Back is still caught.
    await waitFor(() => backIds()?.length === 2);

    await click($('[data-geek-unsaved="discard"]'));
    await waitFor(() => onDiscard.mock.calls.length > 0);
    expect(onDiscard.mock.calls[0][1]).toBe('backButton');
    await waitFor(() => state() === 'closed');
    await tick(150);
    expect(backIds()).toBeUndefined();
    expect(window.location.pathname).toBe('/notes');
  });

  it('Back while the prompt shows means Keep editing', async () => {
    const onDiscard = vi.fn();
    await mount(<Editor onDiscard={onDiscard} />);
    await click($('[data-testid="type"]'));
    await back();
    await waitFor(() => guardRef.confirming);
    await waitFor(() => backIds()?.length === 2);
    await back();
    await waitFor(() => !guardRef.confirming);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(state()).toBe('open');
    await waitFor(() => backIds()?.length === 2);
  });

  it('saving (clean + closed in one commit) leaves no entry behind', async () => {
    await mount(<Editor />);
    await click($('[data-testid="type"]'));
    expect(backIds()).toHaveLength(2);
    await click($('[data-testid="save"]'));
    await tick(150);
    expect(backIds()).toBeUndefined();
    expect(promptOpen()).toBe(false);
  });

  it('guards reload / tab close while dirty, and stops when clean', async () => {
    await mount(<Editor />);
    await click($('[data-testid="type"]'));
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    await click($('[data-testid="save"]'));
    const ev2 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(false);
  });
});

// ── a route-driven sheet: backToClose={false}, the route IS the open state ──
function NoteRoute({ onDiscard }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const guard = useUnsavedGuard({
    dirty: text !== '',
    onDiscard: (event, reason) => {
      onDiscard?.(event, reason);
      navigate(-1);
    },
  });
  guardRef = guard;
  return (
    <>
      <GeekSheet open onClose={guard.requestClose} title="Note" mode="sheet" backToClose={false}>
        <button data-testid="type" onClick={() => setText('x')} />
      </GeekSheet>
      {guard.prompt}
    </>
  );
}
function Path() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}
function GoTo() {
  const navigate = useNavigate();
  return <button data-testid="go" onClick={() => navigate('/notes/1')} />;
}
const path = () => $('[data-testid="path"]').textContent;

describe('useUnsavedGuard — route-driven sheet (backToClose={false})', () => {
  const App = ({ onDiscard }) => (
    <BrowserRouter>
      <Path />
      <Routes>
        <Route path="/notes" element={<GoTo />} />
        <Route path="/notes/:id" element={<NoteRoute onDiscard={onDiscard} />} />
      </Routes>
    </BrowserRouter>
  );

  it('clean: Back is the route change it always was', async () => {
    window.history.replaceState(null, '', '/notes');
    await mount(<App />);
    await click($('[data-testid="go"]'));
    expect(path()).toBe('/notes/1');
    await back();
    await waitFor(() => path() === '/notes');
  });

  it('dirty: Back asks and the route stays; Discard then leaves to the list', async () => {
    window.history.replaceState(null, '', '/notes');
    // Where history stood when onDiscard ran: the guard's entry must be gone
    // already, so the caller's navigate(-1) goes back from the note.
    const seen = [];
    const onDiscard = vi.fn(() => seen.push({ ids: backIds(), path: window.location.pathname }));
    await mount(<App onDiscard={onDiscard} />);
    await click($('[data-testid="go"]'));
    await click($('[data-testid="type"]'));
    await back();
    await waitFor(() => promptOpen());
    await tick(150);
    expect(path()).toBe('/notes/1');
    expect(window.location.pathname).toBe('/notes/1');

    await click($('[data-geek-unsaved="discard"]'));
    await waitFor(() => path() === '/notes');
    expect(onDiscard.mock.calls[0][1]).toBe('backButton');
    expect(seen[0]).toEqual({ ids: undefined, path: '/notes/1' });
    expect(window.location.pathname).toBe('/notes');
    expect(backIds()).toBeUndefined();
  });
});

describe('useUnsavedGuard — local draft', () => {
  it('writes the draft while dirty, offers it on the next mount, and clears it on Discard', async () => {
    await mount(<Editor draftKey="note:1" />);
    await click($('[data-testid="type"]'));
    await tick(500);
    expect(readGeekDraft('note:1')).toBe('hello');
    expect(window.localStorage.getItem(`${GEEK_DRAFT_PREFIX}note:1`)).toContain('hello');

    // The app is killed and comes back: the draft is offered.
    await act(async () => root.unmount());
    root = null;
    await tick(150);
    resetBackStackForTests();
    await mount(<Editor draftKey="note:1" />);
    expect(guardRef.draft).toBe('hello');
    await click($('[data-testid="restore"]'));
    expect($('[data-testid="field"]').value).toBe('hello');

    await click($('[data-geek-dialog="close"]'));
    await click($('[data-geek-unsaved="discard"]'));
    await waitFor(() => state() === 'closed');
    expect(readGeekDraft('note:1')).toBeNull();
  });

  it('Discard clears the draft even when the caller keeps the text in state', async () => {
    await mount(<Editor draftKey="note:5" keepTextOnDiscard />);
    await click($('[data-testid="type"]'));
    await tick(500);
    expect(readGeekDraft('note:5')).toBe('hello');
    await click($('[data-geek-dialog="close"]'));
    await click($('[data-geek-unsaved="discard"]'));
    await waitFor(() => state() === 'closed');
    await tick(600); // past the debounce: nothing writes it back
    expect(readGeekDraft('note:5')).toBeNull();
  });

  it('writes at once when the page is hidden (no waiting for the debounce)', async () => {
    await mount(<Editor draftKey="note:2" />);
    await click($('[data-testid="type"]'));
    expect(readGeekDraft('note:2')).toBeNull();
    await act(async () => window.dispatchEvent(new Event('pagehide')));
    expect(readGeekDraft('note:2')).toBe('hello');
  });

  it('a save (dirty -> clean) clears the draft', async () => {
    await mount(<Editor draftKey="note:3" />);
    await click($('[data-testid="type"]'));
    await tick(500);
    expect(readGeekDraft('note:3')).toBe('hello');
    await click($('[data-testid="save"]'));
    expect(readGeekDraft('note:3')).toBeNull();
  });

  it('storage that throws means no draft, not a crash', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      await mount(<Editor draftKey="note:4" />);
      expect(guardRef.draft).toBeNull();
      await click($('[data-testid="type"]'));
      await tick(500);
      await act(async () => window.dispatchEvent(new Event('pagehide')));
      expect(state()).toBe('open');
    } finally {
      spy.mockRestore();
      get.mockRestore();
    }
  });
});
