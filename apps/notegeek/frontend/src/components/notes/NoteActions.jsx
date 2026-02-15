import React from 'react';
import { Box, Button, IconButton, CircularProgress, alpha, useTheme, Tooltip } from '@mui/material';
import { Save, DeleteOutline, Edit, Visibility, Check } from '@mui/icons-material';

/**
 * NoteActions - Save, delete, edit/view toggle
 * Can be used inline (desktop) or in bottom bar (mobile)
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

  const SaveButton = () => (
    <Button
      variant="contained"
      color="primary"
      startIcon={isSaving ? null : isSaved ? <Check /> : <Save />}
      onClick={onSave}
      disabled={isSaving}
      size={isBottomBar ? 'medium' : 'small'}
      sx={{
        ...(isBottomBar ? {
          flex: 1,
          borderRadius: 2.5,
          py: 1.25,
          fontWeight: 600,
        } : {
          minWidth: 90,
          borderRadius: 2,
          fontWeight: 600,
        }),
        boxShadow: 'none',
        bgcolor: isSaved ? 'success.main' : 'primary.main',
        '&:hover': {
          boxShadow: theme.shadows[2],
          bgcolor: isSaved ? 'success.dark' : 'primary.dark',
        },
        transition: 'all 0.2s ease',
      }}
    >
      {isSaving ? (
        <CircularProgress size={20} color="inherit" />
      ) : isSaved ? 'Saved!' : 'Save'}
    </Button>
  );

  const DeleteButton = () => (
    isBottomBar ? (
      <Button
        variant="outlined"
        color="error"
        startIcon={<DeleteOutline />}
        onClick={onDelete}
        size="medium"
        sx={{
          flex: 0.6,
          borderRadius: 2.5,
          py: 1.25,
          fontWeight: 600,
          borderWidth: 1.5,
          '&:hover': {
            borderWidth: 1.5,
            bgcolor: alpha(theme.palette.error.main, 0.08),
          },
        }}
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
            bgcolor: alpha(theme.palette.error.main, 0.08),
            '&:hover': {
              bgcolor: alpha(theme.palette.error.main, 0.15),
              transform: 'scale(1.05)',
            },
            transition: 'all 0.2s ease',
          }}
        >
          <DeleteOutline fontSize="small" />
        </IconButton>
      </Tooltip>
    )
  );

  const ToggleEditButton = () => (
    <Button
      variant={isEditMode ? 'outlined' : 'contained'}
      color="primary"
      startIcon={isEditMode ? <Visibility /> : <Edit />}
      onClick={onToggleEdit}
      size={isBottomBar ? 'medium' : 'small'}
      sx={{
        ...(isBottomBar ? {
          flex: 0.8,
          borderRadius: 2.5,
          py: 1.25,
          fontWeight: 600,
        } : {
          minWidth: 90,
          borderRadius: 2,
          fontWeight: 600,
        }),
        ...(isEditMode && {
          borderWidth: 1.5,
          '&:hover': {
            borderWidth: 1.5,
          },
        }),
      }}
    >
      {isEditMode ? 'View' : 'Edit'}
    </Button>
  );

  if (isBottomBar) {
    return (
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          p: 2,
          pt: 1.5,
        }}
      >
        {canToggleEdit && <ToggleEditButton />}
        {isEditMode && <SaveButton />}
        {canDelete && <DeleteButton />}
      </Box>
    );
  }

  // Inline variant
  return (
    <>
      {canToggleEdit && <ToggleEditButton />}
      {isEditMode && <SaveButton />}
      {canDelete && <DeleteButton />}
    </>
  );
}

export default NoteActions;
