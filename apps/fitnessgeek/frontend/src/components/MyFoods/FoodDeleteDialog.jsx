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
          <Button
            onClick={onConfirm}
            variant="contained"
            color="error"
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : 'Delete'}
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
