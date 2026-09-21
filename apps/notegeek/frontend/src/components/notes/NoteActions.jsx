import React from 'react';
import { Box, Button, IconButton, CircularProgress, Tooltip, useTheme } from '@mui/material';
import { glow } from '../../theme/tokens';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import Save from '@mui/icons-material/Save';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Edit from '@mui/icons-material/Edit';
import AutoAwesomeMosaic from '@mui/icons-material/AutoAwesomeMosaic';
import HistoryIcon from '@mui/icons-material/History';
import Visibility from '@mui/icons-material/Visibility';
import Check from '@mui/icons-material/Check';
import ArrowBack from '@mui/icons-material/ArrowBack';

/**
 * NoteActions — Save, delete, edit/view toggle, back.
 *
 * Design:
 *   - Back: text button with arrow icon (mobile bottom-bar only)
 *   - Save: contained primary (oxblood)
 *   - Cancel / View: text button
 *   - Delete: text button, error color, confirm dialog handled upstream
 *
 * Desktop inline: right-aligned row of compact buttons.
 * Mobile bottom-bar: full-width buttons, thumb-reachable.
 */
function NoteActions({
  onSave,
  onDelete,
  onToggleEdit,
  onBack,
  isSaving = false,
  saveStatus = '',
  canDelete = true,
  canToggleEdit = false,
  isEditMode = true,
  // Compose is offered only when the page can act on the result; no
  // handler means no button, so a note type that cannot be composed does
  // not advertise it.
  onCompose,
  isComposing = false,
  onHistory,
  variant = 'inline', // 'inline' | 'bottom-bar'
}) {
  const theme = useTheme();
  const isBottomBar = variant === 'bottom-bar';
  const isSaved = saveStatus === 'Saved';

  // ── Save ──────────────────────────────────────────────────────────────
  const SaveButton = () => (
    <Button
      variant="contained"
      color={isSaved ? 'success' : 'primary'}
      startIcon={isSaving ? null : isSaved ? <Check /> : <Save />}
      onClick={onSave}
      disabled={isSaving}
      size={isBottomBar ? 'medium' : 'small'}
      sx={{
        ...(isBottomBar
          ? { flex: 1 }
          : { minWidth: 80 }),
        boxShadow: 'none',
        '&:hover': { boxShadow: 'none' },
        transition: 'background-color 120ms ease',
      }}
    >
      {isSaving ? (
        <CircularProgress size={16} color="inherit" />
      ) : isSaved ? (
        'Saved'
      ) : (
        'Save'
      )}
    </Button>
  );

  // ── Delete ────────────────────────────────────────────────────────────
  const DeleteButton = () =>
    isBottomBar ? (
      <Button
        variant="text"
        color="error"
        startIcon={<DeleteOutline />}
        onClick={onDelete}
        size="medium"
        sx={{ flex: 0.55 }}
      >
        Delete
      </Button>
    ) : (
      <Tooltip title="Delete note" arrow>
        <IconButton
          color="error"
          onClick={onDelete}
          size="small"
          sx={{
            borderRadius: '6px',
            transition: 'background 120ms ease',
            '&:hover': {
              bgcolor: glow(theme).soft,
            },
            '&:focus-visible': {
              boxShadow: `0 0 0 3px ${glow(theme).ring}`,
            },
          }}
        >
          <DeleteOutline fontSize="small" />
        </IconButton>
      </Tooltip>
    );

  // ── History ───────────────────────────────────────────────────────────
  const HistoryButton = () => (
    <Tooltip title="Version history" arrow>
      <span>
        <IconButton
          onClick={onHistory}
          size={isBottomBar ? 'medium' : 'small'}
          aria-label="Version history"
          sx={{
            // The bottom bar is the mobile one: 44px is the tap floor the
            // harness enforces, and `medium` alone is only 40.
            ...(isBottomBar ? { minWidth: 44, minHeight: 44 } : {}),
            borderRadius: '6px',
            transition: 'background 120ms ease',
            '&:hover': { bgcolor: glow(theme).soft },
            '&:focus-visible': { boxShadow: `0 0 0 3px ${glow(theme).ring}` },
          }}
        >
          <HistoryIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );

  // ── Compose ───────────────────────────────────────────────────────────
  // Lives here rather than in one editor so every note type that can be
  // composed gets it from one implementation.
  const ComposeButton = () => (
    <Tooltip title="Compose a document from the scraps in this note" arrow>
      <span>
        <IconButton
          color="primary"
          onClick={onCompose}
          disabled={isComposing}
          size={isBottomBar ? 'medium' : 'small'}
          aria-label="Compose a document from this note"
          sx={{
            ...(isBottomBar ? { minWidth: 44, minHeight: 44 } : {}),
            borderRadius: '6px',
            transition: 'background 120ms ease',
            '&:hover': { bgcolor: glow(theme).soft },
            '&:focus-visible': { boxShadow: `0 0 0 3px ${glow(theme).ring}` },
          }}
        >
          {isComposing
            ? <CircularProgress size={16} color="inherit" />
            : <AutoAwesomeMosaic fontSize="small" />}
        </IconButton>
      </span>
    </Tooltip>
  );

  // ── Toggle edit/view ──────────────────────────────────────────────────
  const ToggleEditButton = () => (
    <Button
      variant="text"
      color="primary"
      startIcon={isEditMode ? <Visibility /> : <Edit />}
      onClick={onToggleEdit}
      size={isBottomBar ? 'medium' : 'small'}
      sx={{
        ...(isBottomBar ? { flex: 0.7 } : {}),
      }}
    >
      {isEditMode ? 'View' : 'Edit'}
    </Button>
  );

  // ── Back button ───────────────────────────────────────────────────────
  const BackButton = () => (
    <Button
      variant="text"
      color="inherit"
      startIcon={<ArrowBack />}
      onClick={onBack}
      size={isBottomBar ? 'medium' : 'small'}
      sx={{
        color: 'text.secondary',
        ...(isBottomBar ? { flex: 0.55 } : {}),
      }}
    >
      Back
    </Button>
  );

  // ── Bottom-bar layout (mobile) ────────────────────────────────────────
  if (isBottomBar) {
    return (
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          px: 2,
          py: 1.25,
        }}
      >
        {onBack && <BackButton />}
        {onHistory && <HistoryButton />}
        {onCompose && <ComposeButton />}
        {canToggleEdit && <ToggleEditButton />}
        {isEditMode && <SaveButton />}
        {canDelete && <DeleteButton />}
      </Box>
    );
  }

  // ── Inline layout (desktop) — rendered as fragments, parent aligns them
  return (
    <>
      {onBack && <BackButton />}
      {onHistory && <HistoryButton />}
      {onCompose && <ComposeButton />}
      {canToggleEdit && <ToggleEditButton />}
      {isEditMode && <SaveButton />}
      {canDelete && <DeleteButton />}
    </>
  );
}

export default NoteActions;
