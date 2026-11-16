/**
 * useUnsavedGuard — "Discard changes?" before a dirty form goes away (plan
 * 2.4). Invisible while the form is clean.
 *
 *   const [open, setOpen] = useState(false);
 *   const guard = useUnsavedGuard({ dirty, enabled: open, onDiscard: () => setOpen(false) });
 *   <GeekSheet open={open} onClose={guard.requestClose} …>…</GeekSheet>
 *   {guard.prompt}
 *
 * What it guards, while `enabled && dirty`:
 *
 *   - **Escape, backdrop, the ✕, Cancel** — anything wired to
 *     `guard.requestClose` (pass it as the surface's `onClose`). Clean, it
 *     calls `onDiscard(event, reason)` straight away; dirty, it asks first.
 *   - **Android Back** — the guard owns ONE history entry of its own on the
 *     shared back stack (`./backStack.js`), at the same URL, on top of the
 *     surface's. Back pops the guard's entry, not the surface's or the
 *     route's, and the question is asked. This is what makes it work for a
 *     route-driven sheet that passes `backToClose={false}` (and for a plain
 *     editor page): without the entry, Back would have changed the route
 *     before anything could ask.
 *   - **Reload / closing the tab** — a `beforeunload` prompt (the browser's
 *     own wording; it cannot be customised).
 *
 * The answer:
 *   - **Keep editing** (also Escape or the backdrop on the prompt, or Back
 *     while it shows) closes the prompt and leaves everything as it was —
 *     the guard's history entry goes back on top, so the next Back asks again.
 *   - **Discard** takes the guard's entry off first and only then calls
 *     `onDiscard(event, reason)` with the reason of the close that was asked
 *     about ('backButton', 'escapeKeyDown', 'backdropClick', …). So a
 *     route-driven caller can `navigate(-1)` (or `navigate('/list')`) in
 *     `onDiscard` and land where Back meant to go, with no stray entry.
 *     After a discard the guard stays down until the form is clean again or
 *     `enabled` turns false — it never asks twice about the same edit.
 *
 * Saving: call your own close, not `requestClose`; a save that makes the form
 * clean (or closes the surface, so `enabled` goes false) takes the guard's
 * entry off in the same commit as the surface's.
 *
 * Optional local draft (`draftKey` + `draftValue`): while dirty the value is
 * written to localStorage under `geek-draft:<draftKey>` (debounced, and at
 * once when the page is hidden or unloading — a phone kills a backgrounded
 * PWA without warning). `guard.draft` is what was stored when the hook
 * mounted (or null): offer to restore it. The draft is removed on Discard,
 * when the form goes from dirty to clean (a save), and by `guard.clearDraft()`.
 * Every storage call is wrapped: a private window or a full quota only means
 * no draft. Values must be JSON-serialisable.
 *
 * Known limit: an in-app link or `navigate()` from elsewhere while dirty is
 * not intercepted (react-router v6's BrowserRouter has no blocker); the draft
 * is the safety net there.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { geekLayout } from '../designTokens.js';
import { BACK_STATE_KEY, getBackStack } from './backStack.js';

export const GEEK_DRAFT_PREFIX = 'geek-draft:';
/** How long Discard waits for the guard's entry to leave before giving up. */
const DISCARD_WAIT_MS = 600;

const storage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export function readGeekDraft(key) {
  if (!key) return null;
  try {
    const raw = storage()?.getItem(GEEK_DRAFT_PREFIX + key);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && 'value' in parsed ? parsed.value : null;
  } catch {
    return null;
  }
}

export function writeGeekDraft(key, value) {
  if (!key) return;
  try {
    storage()?.setItem(GEEK_DRAFT_PREFIX + key, JSON.stringify({ value, savedAt: Date.now() }));
  } catch {
    /* quota, private mode, unserialisable: no draft, no crash */
  }
}

export function clearGeekDraft(key) {
  if (!key) return;
  try {
    storage()?.removeItem(GEEK_DRAFT_PREFIX + key);
  } catch {
    /* nothing to do */
  }
}

const topBackId = () => {
  if (typeof window === 'undefined') return undefined;
  const ids = window.history?.state?.[BACK_STATE_KEY];
  return Array.isArray(ids) ? ids[ids.length - 1] : undefined;
};

/**
 * @param {{
 *   dirty: boolean,
 *   onDiscard: (event?: unknown, reason?: string) => void,
 *   enabled?: boolean,
 *   guardBack?: boolean,
 *   guardUnload?: boolean,
 *   title?: import('react').ReactNode,
 *   message?: import('react').ReactNode,
 *   discardLabel?: string,
 *   keepLabel?: string,
 *   draftKey?: string,
 *   draftValue?: unknown,
 *   draftDelayMs?: number,
 * }} options
 */
export function useUnsavedGuard({
  dirty,
  onDiscard,
  enabled = true,
  guardBack = true,
  guardUnload = true,
  title = 'Discard changes?',
  message = "Your changes haven't been saved.",
  discardLabel = 'Discard',
  keepLabel = 'Keep editing',
  draftKey,
  draftValue,
  draftDelayMs = 400,
} = {}) {
  const promptId = useId();
  const [confirm, setConfirm] = useState(null); // { event, reason } while asking
  const [discarded, setDiscarded] = useState(false);
  const onDiscardRef = useRef(onDiscard);
  onDiscardRef.current = onDiscard;
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  const isDirty = Boolean(dirty);
  const active = Boolean(enabled) && isDirty && !discarded;

  // A discard holds until there is nothing left to discard.
  useEffect(() => {
    if (discarded && (!isDirty || !enabled)) setDiscarded(false);
  }, [discarded, isDirty, enabled]);
  // Nothing to ask about any more (saved, or the surface closed): drop the prompt.
  useEffect(() => {
    if (!active && confirm) setConfirm(null);
  }, [active, confirm]);

  // ── Back: the guard's own entry on the shared stack ───────────────────────
  const idRef = useRef(null);
  const backActive = active && guardBack !== false;
  useEffect(() => {
    if (!backActive) return undefined;
    const stack = getBackStack();
    if (!stack) return undefined;
    // Not releasing in here is the veto: the stack puts the entry back.
    const id = stack.register(idRef.current, (event) => {
      if (confirmRef.current) setConfirm(null); // Back on the prompt = keep editing
      else setConfirm({ event, reason: 'backButton' });
    });
    idRef.current = id;
    return () => stack.release(id);
  }, [backActive]);

  // ── Reload / tab close ────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || guardUnload === false || typeof window === 'undefined') return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      // Chrome < 119 and Safari still want returnValue set.
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active, guardUnload]);

  // ── Draft ─────────────────────────────────────────────────────────────────
  const [draft] = useState(() => readGeekDraft(draftKey));
  // Written only while the guard is up: not after a Discard, not once the
  // surface has closed (`enabled` false) with stale text still in state.
  const draftRef = useRef({ key: draftKey, value: draftValue, live: active });
  draftRef.current = { key: draftKey, value: draftValue, live: active };
  const draftTimer = useRef(null);

  const clearDraft = useCallback(() => {
    clearTimeout(draftTimer.current);
    draftTimer.current = null;
    clearGeekDraft(draftRef.current.key);
  }, []);

  useEffect(() => {
    if (!draftKey || !active) return undefined;
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      writeGeekDraft(draftKey, draftValue);
    }, draftDelayMs);
    return () => clearTimeout(draftTimer.current);
  }, [draftKey, draftValue, active, draftDelayMs]);

  // Write at once when the page goes away: the debounce may never fire.
  useEffect(() => {
    if (!draftKey || typeof window === 'undefined') return undefined;
    const flush = () => {
      const { key, value, live } = draftRef.current;
      if (live && draftTimer.current) {
        clearTimeout(draftTimer.current);
        draftTimer.current = null;
        writeGeekDraft(key, value);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [draftKey]);

  // Dirty -> clean (a save): the draft has done its job.
  const wasDirty = useRef(isDirty);
  useEffect(() => {
    if (wasDirty.current && !isDirty) clearDraft();
    wasDirty.current = isDirty;
  }, [isDirty, clearDraft]);

  // ── The close path ────────────────────────────────────────────────────────
  const activeRef = useRef(active);
  activeRef.current = active;

  const requestClose = useCallback((event, reason) => {
    if (!activeRef.current) {
      onDiscardRef.current?.(event, reason);
      return;
    }
    if (confirmRef.current) return; // already asking
    setConfirm({ event, reason });
  }, []);

  const keepEditing = useCallback(() => setConfirm(null), []);

  const waitRef = useRef(null);
  useEffect(() => () => waitRef.current?.(), []);

  const discard = useCallback(() => {
    const asked = confirmRef.current ?? {};
    const ourEntryOnTop = idRef.current != null && topBackId() === idRef.current;
    setConfirm(null);
    setDiscarded(true);
    clearDraft();
    const finish = () => onDiscardRef.current?.(asked.event, asked.reason);
    if (!ourEntryOnTop || typeof window === 'undefined') {
      finish();
      return;
    }
    // The release (next commit) takes our entry off with history.go(-1);
    // call onDiscard once that traversal has landed, so a navigate(-1) in it
    // goes back from the right place.
    let timer = null;
    const done = () => {
      window.removeEventListener('popstate', done);
      clearTimeout(timer);
      waitRef.current = null;
      finish();
    };
    window.addEventListener('popstate', done);
    timer = setTimeout(done, DISCARD_WAIT_MS);
    waitRef.current = () => {
      window.removeEventListener('popstate', done);
      clearTimeout(timer);
    };
  }, [clearDraft]);

  const prompt = (
    <Dialog
      open={Boolean(confirm)}
      onClose={keepEditing}
      maxWidth="xs"
      fullWidth
      role="alertdialog"
      aria-labelledby={`${promptId}-title`}
      aria-describedby={message ? `${promptId}-message` : undefined}
      disablePortal={typeof document === 'undefined'}
      data-geek-unsaved="prompt"
    >
      <DialogTitle id={`${promptId}-title`}>{title}</DialogTitle>
      {message ? (
        <DialogContent>
          <DialogContentText id={`${promptId}-message`} sx={{ color: 'text.secondary' }}>
            {message}
          </DialogContentText>
        </DialogContent>
      ) : null}
      <DialogActions
        sx={{
          px: 3,
          pb: 2,
          '& .MuiButton-root': { minHeight: geekLayout.minClickTarget, minWidth: geekLayout.minClickTarget },
        }}
      >
        <Button onClick={keepEditing} autoFocus data-geek-unsaved="keep">
          {keepLabel}
        </Button>
        <Button onClick={discard} color="error" data-geek-unsaved="discard">
          {discardLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );

  return {
    requestClose,
    prompt,
    confirming: Boolean(confirm),
    keepEditing,
    discard,
    draft,
    clearDraft,
  };
}

export default useUnsavedGuard;
