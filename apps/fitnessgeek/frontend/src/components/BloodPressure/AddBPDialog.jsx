import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  MonitorHeart as BPIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { getTodayLocal } from '../../utils/dateUtils.js';

const AddBPDialog = ({ open, onClose, onAdd, existingTodayBP = null }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [date, setDate] = useState(getTodayLocal());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!systolic || !diastolic) {
      setError('Please enter both systolic and diastolic values');
      return;
    }

    const systolicNum = parseInt(systolic);
    const diastolicNum = parseInt(diastolic);
    const pulseNum = pulse ? parseInt(pulse) : null;

    if (isNaN(systolicNum) || isNaN(diastolicNum)) {
      setError('Please enter valid numbers');
      return;
    }

    if (systolicNum < 70 || systolicNum > 200) {
      setError('Systolic should be between 70-200 mmHg');
      return;
    }

    if (diastolicNum < 40 || diastolicNum > 130) {
      setError('Diastolic should be between 40-130 mmHg');
      return;
    }

    if (systolicNum <= diastolicNum) {
      setError('Systolic should be higher than diastolic');
      return;
    }

    if (pulse && (pulseNum < 40 || pulseNum > 200)) {
      setError('Pulse should be between 40-200 bpm');
      return;
    }

    setLoading(true);
    try {
      await onAdd({
        systolic: systolicNum,
        diastolic: diastolicNum,
        pulse: pulseNum,
        date: date
      });

      // Reset form and close dialog
      setSystolic('');
      setDiastolic('');
      setPulse('');
      setDate(getTodayLocal());
      setError('');
      onClose();
    } catch (error) {
      setError(error.message || 'Failed to add blood pressure reading');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSystolic('');
    setDiastolic('');
    setPulse('');
    setDate(getTodayLocal());
    setError('');
    onClose();
  };

  const getBPStatus = () => {
    if (!systolic || !diastolic) return null;

    const sys = parseInt(systolic);
    const dia = parseInt(diastolic);

    if (isNaN(sys) || isNaN(dia)) return null;

    // BP Categories based on American Heart Association guidelines
    if (sys < 120 && dia < 80) return { status: 'Normal', color: theme.palette.success.main };
    if (sys < 130 && dia < 80) return { status: 'Elevated', color: theme.palette.warning.main };
    if (sys < 140 && dia < 90) return { status: 'High Normal', color: theme.palette.warning.main };
    if (sys < 160 && dia < 100) return { status: 'Stage 1', color: theme.palette.error.main };
    if (sys < 180 && dia < 110) return { status: 'Stage 2', color: theme.palette.error.dark };
    return { status: 'Crisis', color: '#b71c1c' };
  };

  const bpStatus = getBPStatus();

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : 2
        }
      }}
    >
      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pb: 1
      }}>
        <BPIcon sx={{ color: theme.palette.primary.main }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Add Blood Pressure Reading
        </Typography>
      </DialogTitle>

      <DialogContent>
        {existingTodayBP && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              You already have a reading for today: <strong>{existingTodayBP.systolic}/{existingTodayBP.diastolic}</strong>
              {existingTodayBP.pulse && ` (pulse: ${existingTodayBP.pulse})`}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
              Adding a new reading will replace the existing one.
            </Typography>
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Systolic"
              type="number"
              value={systolic}
              onChange={(e) => setSystolic(e.target.value)}
              InputProps={{
                endAdornment: <Typography variant="caption">mmHg</Typography>
              }}
              size="medium"
            />

            <TextField
              fullWidth
              label="Diastolic"
              type="number"
              value={diastolic}
              onChange={(e) => setDiastolic(e.target.value)}
              InputProps={{
                endAdornment: <Typography variant="caption">mmHg</Typography>
              }}
              size="medium"
            />

            <TextField
              fullWidth
              label="Pulse (optional)"
              type="number"
              value={pulse}
              onChange={(e) => setPulse(e.target.value)}
              InputProps={{
                endAdornment: <Typography variant="caption">bpm</Typography>
              }}
              size="medium"
            />

            <TextField
              fullWidth
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              size="medium"
            />

            {/* BP Status indicator */}
            {bpStatus && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2">
                  Status:
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    color: bpStatus.color,
                    backgroundColor: `${bpStatus.color}20`,
                    px: 1,
                    py: 0.5,
                    borderRadius: 1
                  }}
                >
                  {bpStatus.status}
                </Typography>
              </Box>
            )}

            {error && (
              <Alert severity="error">
                {error}
              </Alert>
            )}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          startIcon={<AddIcon />}
          disabled={loading}
        >
          {loading ? 'Adding...' : 'Add Reading'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddBPDialog;