import React from 'react';
import {
  Button,
  Typography,
  CircularProgress
} from '@mui/material';
import PremiumDialog from '../primitives/PremiumDialog.jsx';

const FoodDeleteDialog = ({ open, food, onClose, onConfirm, loading }) => {
  return (
    <PremiumDialog
      open={open}
      onClose={onClose}
      title="Delete this food?"
      maxWidth="xs"
      primaryAction={
        <Button
          onClick={onConfirm}
          variant="contained"
          color="error"
          disabled={loading}
        >
          {loading ? <CircularProgress size={20} /> : 'Delete'}
        </Button>
      }
      secondaryAction={<Button onClick={onClose}>Cancel</Button>}
    >
      <Typography>
        “{food?.name}” leaves your foods. Days you already logged it keep it,
        and you can search for it again any time.
      </Typography>
    </PremiumDialog>
  );
};

export default FoodDeleteDialog;
