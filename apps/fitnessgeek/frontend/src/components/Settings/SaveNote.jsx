import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';

/**
 * "Saved", said where the person is looking.
 *
 * Settings has no Save button: every setting saves as it changes. A toast at
 * the foot of the screen was the only sign of it, and a failed switch just
 * flicked back. So each control gets a small line of its own: a quiet
 * "Saved" for a moment after a save, or the failure in words until the next
 * try.
 *
 *   const note = useSaveNote();
 *   note.saved('garmin');                 // after a save
 *   note.failed('garmin', 'Couldn’t…');   // after a failure
 *   <SaveNote note={note} for="garmin" />
 *
 * One note per hook: a newer save replaces an older "Saved", which is what a
 * person changing two things in a row should see.
 */
export const SAVED_FOR_MS = 2500;

export function useSaveNote(ms = SAVED_FOR_MS) {
  const [current, setCurrent] = useState(null); // { key, kind: 'saved' | 'error', message }
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const saved = useCallback((key) => {
    clearTimeout(timer.current);
    setCurrent({ key, kind: 'saved' });
    timer.current = setTimeout(() => setCurrent((c) => (c?.kind === 'saved' && c.key === key ? null : c)), ms);
  }, [ms]);
  const failed = useCallback((key, message) => {
    clearTimeout(timer.current);
    setCurrent({ key, kind: 'error', message });
  }, []);
  const clear = useCallback((key) => setCurrent((c) => (c && (key === undefined || c.key === key) ? null : c)), []);

  return {
    current,
    saved,
    failed,
    clear,
    isSaved: (key) => current?.key === key && current.kind === 'saved',
    errorFor: (key) => (current?.key === key && current.kind === 'error' ? current.message : null),
  };
}

/** The words alone, for a text field's helper line. */
export function SavedWords() {
  return (
    <Box component="span" role="status" data-testid="saved-note" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: 'text.secondary', fontWeight: 600 }}>
      <CheckIcon aria-hidden sx={{ fontSize: 16, color: 'success.main' }} />
      Saved
    </Box>
  );
}

/** A line under a switch, a set of choices or a select. Draws nothing at rest. */
export default function SaveNote({ note, for: key, sx }) {
  const error = note.errorFor(key);
  if (error) {
    return (
      <Box role="alert" data-testid="save-error" sx={{ fontSize: '0.875rem', lineHeight: 1.4, fontWeight: 600, color: 'error.main', mt: 1, ...sx }}>
        {error}
      </Box>
    );
  }
  if (!note.isSaved(key)) return null;
  return (
    <Box sx={{ fontSize: '0.875rem', lineHeight: 1.4, mt: 1, ...sx }}>
      <SavedWords />
    </Box>
  );
}
