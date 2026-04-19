import React from 'react';
import { Box, Button, IconButton, CircularProgress, Tooltip, useTheme } from '@mui/material';
import { Save, DeleteOutline, Edit, Visibility, Check } from '@mui/icons-material';

/**
 * NoteActions — Save, delete, edit/view toggle.
 *
 * Design:
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
  isSaving = false,
  saveStatus = '',
  canDelete = true,
  canToggleEdit = false,
  isEditMode = true,
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
              bgcolor: theme.palette.glow.soft,
            },
            '&:focus-visible': {
              boxShadow: `0 0 0 3px ${theme.palette.glow.ring}`,
            },
          }}
        >
          <DeleteOutline fontSize="small" />
        </IconButton>
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
        {canToggleEdit && <ToggleEditButton />}
        {isEditMode && <SaveButton />}
        {canDelete && <DeleteButton />}
      </Box>
    );
  }

  // ── Inline layout (desktop) — rendered as fragments, parent aligns them
  return (
    <>
      {canToggleEdit && <ToggleEditButton />}
      {isEditMode && <SaveButton />}
      {canDelete && <DeleteButton />}
    </>
  );
}

export default NoteActions;
