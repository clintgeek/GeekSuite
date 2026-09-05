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
      eyebrow="Confirm"
      title="Delete Food?"
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
        Are you sure you want to delete "{food?.name}"?
        This will remove it from your saved foods but preserve any historical logs.
        You can always search for it again to re-add it.
      </Typography>
    </PremiumDialog>
  );
};

export default FoodDeleteDialog;
