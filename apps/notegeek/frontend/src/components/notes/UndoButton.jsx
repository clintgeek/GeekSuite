import React from 'react';
import { Button } from '@mui/material';

/**
 * The Undo in an "acted at once" toast (Archive, Delete): one look, one
 * 44px target, wherever a reversible action offers it back.
 */
export default function UndoButton({ onClick }) {
  return (
    <Button
      color="inherit"
      size="small"
      onClick={onClick}
      sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, minWidth: 44 }}
    >
      Undo
    </Button>
  );
}
