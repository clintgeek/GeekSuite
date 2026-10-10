/**
 * PrivacyContext — which private tasks are showing their words, on a desktop.
 *
 * Chef (2026-10-01): "if you're sharing your screen and accidentally share the
 * wrong screen and one of the todos is 'Fire Jane' … you probably don't want
 * that shared to the team at large."
 *
 * ## Where it applies
 * Only on a DESKTOP: at or above the app's `md` breakpoint (the shell's own
 * switch, AppShell / TodayPage) AND with a fine pointer. A phone is not
 * screen-shared to a meeting, so a private task there shows its words, with a
 * small mark that says it is private. Off a desktop, `hides` is false and
 * nothing here does anything.
 *
 * ## Hidden by default, revealed one task at a time
 * `reveal(id)` shows one task's words in place. It goes hidden again when:
 *   - it is hidden on purpose (`hide(id)` — the row's eye button),
 *   - Escape is pressed anywhere,
 *   - the window loses focus or the page is hidden (`blur`,
 *     `visibilitychange`) — that is the moment someone switches away to
 *     start a screen share, so EVERY revealed task goes,
 *   - REVEAL_MS after it was revealed.
 * An open editor counts as revealed while it is open (PenRow decides that;
 * the editor holds the words in its fields). While the window is away the
 * row blurs an open private editor too (`away`), rather than closing it and
 * losing the edit.
 *
 * Nothing is stored. A reload starts with everything hidden.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

export const REVEAL_MS = 60 * 1000;
export const PRIVATE_LABEL = 'Private task';
export const HIDDEN_LABEL = 'Private task, hidden. Activate to show.';

const PrivacyContext = createContext(null);

/** True on a desktop: md and up, with a mouse or trackpad. */
export function useHidesPrivate() {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const fine = useMediaQuery('(pointer: fine)');
  return wide && fine;
}

export function PrivacyProvider({ children }) {
  const hides = useHidesPrivate();
  const [revealed, setRevealed] = useState(() => new Set());
  const [away, setAway] = useState(false);
  const timers = useRef(new Map());

  const clearTimer = (id) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  };

  const hide = useCallback((id) => {
    const key = String(id);
    clearTimer(key);
    setRevealed((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const hideAll = useCallback(() => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    setRevealed((prev) => (prev.size ? new Set() : prev));
  }, []);

  const reveal = useCallback((id) => {
    const key = String(id);
    clearTimer(key);
    timers.current.set(key, setTimeout(() => hide(key), REVEAL_MS));
    setRevealed((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, [hide]);

  // Leaving the window hides everything — that is the screen-share moment.
  useEffect(() => {
    if (!hides) return undefined;
    // The window's own blur/focus, not an element's (those do not bubble here,
    // and the guard makes sure of it).
    const isElement = (e) => Boolean(e.target && e.target.nodeType === 1);
    const onBlur = (e) => {
      if (isElement(e)) return;
      setAway(true);
      hideAll();
    };
    const onFocus = (e) => {
      if (isElement(e)) return;
      setAway(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setAway(true);
        hideAll();
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') hideAll(); };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKey);
    };
  }, [hides, hideAll]);

  // Off a desktop (or after a resize down to one) nothing stays revealed.
  useEffect(() => { if (!hides) { hideAll(); setAway(false); } }, [hides, hideAll]);

  useEffect(() => () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
  }, []);

  const value = useMemo(() => ({
    hides,
    away: hides && away,
    isRevealed: (id) => revealed.has(String(id)),
    reveal,
    hide,
    hideAll,
  }), [hides, away, revealed, reveal, hide, hideAll]);

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

/**
 * The privacy state. Outside a provider it FAILS SAFE: on a desktop a private
 * task is hidden and cannot be revealed, rather than shown.
 */
export function usePrivacy() {
  const ctx = useContext(PrivacyContext);
  const hides = useHidesPrivate();
  const fallback = useMemo(() => ({
    hides, away: false, isRevealed: () => false, reveal: () => {}, hide: () => {}, hideAll: () => {},
  }), [hides]);
  return ctx || fallback;
}

export default PrivacyProvider;
