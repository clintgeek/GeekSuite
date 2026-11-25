import React, { useCallback, useEffect, useState } from 'react';
import { IconButton, Tooltip, useTheme } from '@mui/material';
import SplitscreenOutlined from '@mui/icons-material/SplitscreenOutlined';
import { glow, tapTarget44 } from '../../theme/tokens';
import { TOUCH_TARGET_MEDIA, useNoteFormFactor } from '../../hooks/useNoteFormFactor';

/**
 * The reference note beside the one being written (DOCS/REFERENCE_PANE_SPEC.md):
 * which note, and whether the picker is up. Page state only: it is gone when
 * the note is left (out of scope: remembering the pane).
 *
 * `available` is false on a phone (decision 11): the button is not offered,
 * and a pane that was open on a window since made phone-sized closes.
 */
export function useReferenceNote() {
  const { phone } = useNoteFormFactor();
  const available = !phone;
  const [noteId, setNoteId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (available) return;
    setNoteId(null);
    setPickerOpen(false);
  }, [available]);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const close = useCallback(() => setNoteId(null), []);
  const show = useCallback((id) => {
    setPickerOpen(false);
    setNoteId(id || null);
  }, []);

  return { available, noteId: available ? noteId : null, pickerOpen: available && pickerOpen, openPicker, closePicker, show, close };
}

/** The head's "Reference" button: opens the picker. */
export function ReferenceButton({ onClick, active = false }) {
  const theme = useTheme();
  return (
    <Tooltip title="Reference: show another note above this one">
      <IconButton
        aria-label="Reference: show another note above this one"
        aria-pressed={active}
        data-testid="reference-button"
        onClick={onClick}
        size="small"
        sx={{
          color: active ? 'text.primary' : 'text.secondary',
          borderRadius: '6px',
          minWidth: 32,
          minHeight: 32,
          [TOUCH_TARGET_MEDIA]: { ...tapTarget44 },
          '&:hover': { bgcolor: glow(theme).soft, color: 'text.primary' },
          '&:focus-visible': { boxShadow: `0 0 0 3px ${glow(theme).ring}` },
        }}
      >
        <SplitscreenOutlined fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
