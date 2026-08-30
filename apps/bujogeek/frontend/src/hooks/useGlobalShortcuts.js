import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * useGlobalShortcuts — app-wide keyboard shortcuts.
 *
 * Chords (two-key sequences within 800ms):
 *   g → t   navigate to /today
 *   g → r   navigate to /review
 *   g → p   navigate to /plan
 *   g → s   navigate to /search
 *   g → l   navigate to /collections (lists)
 *   g → h   navigate to /habits
 *
 * `g → c` would read better for Collections, but a bare `c` is already the
 * task-list "toggle cancelled" key in useKeyboardNav — which listens on window
 * ahead of this hook and would strike the focused task on the way past. `l`
 * for "lists" is free everywhere, and so is `h` (useKeyboardNav claims only
 * j/k/x/e/c/d/Escape).
 *
 * Single keys:
 *   Cmd/Ctrl+N   focus the quick-add input (data-quickadd attribute)
 *   ?            show keyboard shortcut help (optional onShowHelp callback)
 *
 * Suppressed when typing in inputs, textareas, or when inside a dialog.
 */
const CHORD_TIMEOUT = 800;

const CHORD_MAP = {
  t: '/today',
  r: '/review',
  p: '/plan',
  s: '/search',
  l: '/collections',
  h: '/habits',
};

const useGlobalShortcuts = ({ onShowHelp } = {}) => {
  const navigate = useNavigate();
  const chordPrefixRef = useRef(null);
  const chordTimerRef = useRef(null);

  const clearChord = useCallback(() => {
    chordPrefixRef.current = null;
    if (chordTimerRef.current) {
      clearTimeout(chordTimerRef.current);
      chordTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      // Don't intercept when typing
      const tag = e.target.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        e.target.isContentEditable ||
        e.target.closest('[role="dialog"]')
      ) {
        return;
      }

      // Cmd/Ctrl+N → focus quick-add
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const quickAdd = document.querySelector('[data-quickadd]');
        if (quickAdd) {
          quickAdd.focus();
          quickAdd.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        clearChord();
        return;
      }

      // Don't process chords if modifier keys are held
      if (e.metaKey || e.ctrlKey || e.altKey) {
        clearChord();
        return;
      }

      // ? → show help
      if (e.key === '?' && !e.shiftKey) {
        // shift+/ on US keyboards = ?. Let's also check for the literal '?'
        onShowHelp?.();
        clearChord();
        return;
      }
      if (e.shiftKey && e.key === '?') {
        onShowHelp?.();
        clearChord();
        return;
      }

      // Chord handling
      if (chordPrefixRef.current === 'g') {
        // We're in "g" mode — check for second key
        const route = CHORD_MAP[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          navigate(route);
        }
        clearChord();
        return;
      }

      // Start a chord with 'g'
      if (e.key === 'g') {
        chordPrefixRef.current = 'g';
        chordTimerRef.current = setTimeout(clearChord, CHORD_TIMEOUT);
        return;
      }

      // Any other key outside a chord — clear
      clearChord();
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      clearChord();
    };
  }, [navigate, onShowHelp, clearChord]);
};

export default useGlobalShortcuts;
