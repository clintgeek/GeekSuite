import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Fab,
  useTheme
} from '@mui/material';
import {
  Add as AddIcon,
  MonitorWeight as WeightIcon
} from '@mui/icons-material';
import { getTodayLocal } from '../../utils/dateUtils.js';

const QuickAddWeight = ({ onAdd, unit = 'lbs' }) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(getTodayLocal());
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  const handleSubmit = async () => {
    if (!value || !date) return;

    setLoading(true);
    try {
      await onAdd({
        value: parseFloat(value),
        date: date
      });

      setValue('');
      setDate(getTodayLocal());
      setOpen(false);
    } catch (error) {
      console.error('Error adding weight:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <>
      {/* Floating Action Button for mobile */}
      <Fab
        color="primary"
        aria-label="add weight"
        onClick={() => setOpen(true)}
        sx={{
          position: 'fixed',
          bottom: 80, // Above bottom navigation
          right: 16,
          zIndex: 1000,
          backgroundColor: 'primary.main',
          '&:hover': {
            backgroundColor: 'primary.dark'
          }
        }}
      >
        <AddIcon />
      </Fab>

      {/* Quick Add Card for desktop */}
      <Card sx={{
        width: '100%',
        display: { xs: 'none', md: 'block' },
        backgroundColor: 'background.paper',
        borderRadius: 2,
        boxShadow: 1,
        border: 'none'
      }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              label={`Weight (${unit})`}
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyPress={handleKeyPress}
              size="small"
              sx={{ flexGrow: 1 }}
              inputProps={{
                step: "0.1",
                min: "0",
                max: "1000"
              }}
              InputProps={{
                endAdornment: unit
              }}
            />
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!value || loading}
            >
              Add
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <WeightIcon sx={{ mr: 1 }} />
            Log Weight
          </Box>
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={`Weight (${unit})`}
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyPress={handleKeyPress}
            sx={{ mb: 2, mt: 1 }}
            inputProps={{
              step: "0.1",
              min: "0",
              max: "1000"
            }}
            InputProps={{
              endAdornment: unit
            }}
            helperText="Enter weight to one decimal place (e.g., 150.4)"
            autoFocus
          />
          <TextField
            fullWidth
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!value || loading}
          >
            Log Weight
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default QuickAddWeight;