import React from 'react';
import {
  Button,
  Typography,
  CircularProgress
} from '@mui/material';
import { useGeekDialogFullScreen } from '@geeksuite/ui';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import { thumbSaveProps } from '../BloodPressure/thumbSave.jsx';

const FoodDeleteDialog = ({ open, food, onClose, onConfirm, loading }) => {
  const fullScreen = useGeekDialogFullScreen();
  return (
    <PremiumDialog
      open={open}
      onClose={onClose}
      title="Delete this food?"
      maxWidth="xs"
      // The confirm sits in the footer under the thumb on a phone (B8).
      {...thumbSaveProps({
        fullScreen,
        save: (
          // Destructive is text in the error colour, never a filled red
          // block (review 2026-11-27); the same as Remove in Edit entry.
          <Button
            onClick={onConfirm}
            color="error"
            disabled={loading}
            sx={{ fontWeight: 700 }}
          >
            {loading ? <CircularProgress size={20} color="inherit" /> : 'Delete'}
          </Button>
        ),
        cancel: <Button onClick={onClose}>Cancel</Button>,
      })}
    >
      <Typography>
        “{food?.name}” leaves your foods. Days you already logged it keep it,
        and you can search for it again any time.
      </Typography>
    </PremiumDialog>
  );
};

export default FoodDeleteDialog;
