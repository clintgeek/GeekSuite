import { useCallback, useEffect, useMemo, useState } from 'react';

export const noteKey = (note) => String(note?.id || note?._id || '');

/**
 * Types Compose cannot read (spec §4 C2): their content is not prose.
 * Locked / encrypted notes are never sent to a model either.
 */
const UNCOMPOSABLE_TYPES = new Set(['handwritten', 'mindmap']);

/** Why the gateway will leave this note out of a compose, if it will. */
export function composeSkipReason(note) {
  if (!note) return null;
  if (note.isLocked || note.isEncrypted) return 'locked';
  if (UNCOMPOSABLE_TYPES.has(note.type)) return 'unsupported_type';
  return null;
}

/**
 * Select mode for a list of NoteRows (spec COMPOSE_MANY_AND_ARCHIVE U1) —
 * the one copy every list uses: Home, All notes, a tag page, search and the
 * Archived view.
 *
 * The selection holds the NOTES, not just ids: the action bar counts what
 * Compose will skip from their types, Compose orders them, and its skip
 * message names them. It lives in the page's state, so it survives scrolling
 * and is gone when you leave the page. `resetKey` drops it when the same
 * component starts showing a different list (one tag page to another).
 *
 * Esc exits — unless something above the list (a dialog, a menu) took the
 * key first, which MUI does by stopping it.
 */
export function useNoteSelection({ resetKey } = {}) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState(() => new Map());

  const exit = useCallback(() => {
    setActive(false);
    setSelected(new Map());
  }, []);

  const enter = useCallback((note) => {
    setActive(true);
    if (note) {
      setSelected((prev) => {
        const next = new Map(prev);
        next.set(noteKey(note), note);
        return next;
      });
    }
  }, []);

  const toggle = useCallback((note) => {
    const key = noteKey(note);
    if (!key) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, note);
      return next;
    });
  }, []);

  /** Drop ids that left the list (archived, restored) without leaving the mode. */
  const remove = useCallback((ids) => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const id of ids || []) next.delete(String(id));
      return next;
    });
  }, []);

  useEffect(() => { exit(); }, [resetKey, exit]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, exit]);

  return useMemo(() => {
    const notes = [...selected.values()];
    return {
      active,
      count: selected.size,
      ids: [...selected.keys()],
      notes,
      skipCount: notes.filter((n) => composeSkipReason(n)).length,
      isSelected: (note) => selected.has(noteKey(note)),
      enter,
      toggle,
      exit,
      remove,
    };
  }, [active, selected, enter, toggle, exit, remove]);
}

/**
 * The props a NoteRow needs to take part in select mode. Spread onto each
 * row: `<NoteRow note={n} {...rowSelectProps(selection, n)} />`.
 */
export function rowSelectProps(selection, note) {
  if (!selection) return {};
  return selection.active
    ? { selectMode: true, selected: selection.isSelected(note), onToggleSelect: selection.toggle }
    : { onLongPress: selection.enter };
}

export default useNoteSelection;
