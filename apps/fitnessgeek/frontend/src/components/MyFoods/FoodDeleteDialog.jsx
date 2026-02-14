import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress
} from '@mui/material';

const FoodDeleteDialog = ({ open, food, onClose, onConfirm, loading }) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Delete Food?</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete "{food?.name}"?
          This will remove it from your saved foods but preserve any historical logs.
          You can always search for it again to re-add it.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color="error"
          disabled={loading}
        >
          {loading ? <CircularProgress size={20} /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FoodDeleteDialog;
