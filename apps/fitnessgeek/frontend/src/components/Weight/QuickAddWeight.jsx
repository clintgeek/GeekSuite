import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button
} from '@mui/material';
import {
  Add as AddIcon,
  MonitorWeight as WeightIcon
} from '@mui/icons-material';
import { getTodayLocal } from '../../utils/dateUtils.js';
import { useRegisterPrimaryAction } from '../Layout/primaryAction.js';
import PremiumDialog from '../primitives/PremiumDialog.jsx';

const QuickAddWeight = ({ onAdd, unit = 'lbs' }) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(getTodayLocal());
  const [loading, setLoading] = useState(false);

  // The page's thumb-zone action. `GeekFab` (mounted by the shell) reads the
  // bottom-nav inset and the safe area, so the old hardcoded `bottom: 80` —
  // which also rendered on desktop, beside the Quick Add card — is gone.
  useRegisterPrimaryAction({
    label: 'Log weight',
    icon: <AddIcon />,
    onClick: () => setOpen(true)
  });

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
      <PremiumDialog
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Tracking"
        title="Log Weight"
        icon={WeightIcon}
        maxWidth="sm"
        primaryAction={
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!value || loading}
          >
            Save
          </Button>
        }
        secondaryAction={<Button onClick={() => setOpen(false)}>Cancel</Button>}
      >
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
      </PremiumDialog>
    </>
  );
};

export default QuickAddWeight;