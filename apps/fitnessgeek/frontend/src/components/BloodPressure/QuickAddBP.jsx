import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  useTheme,
  Grid,
  Fab
} from '@mui/material';
import {
  Add as AddIcon,
  MonitorHeart as BPIcon
} from '@mui/icons-material';
import { getTodayLocal } from '../../utils/dateUtils.js';
import AddBPDialog from './AddBPDialog.jsx';

const QuickAddBP = ({ onAdd, unit = "mmHg", existingTodayBP = null }) => {
  const theme = useTheme();
  const [showDialog, setShowDialog] = useState(false);
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

      // Reset form
      setSystolic('');
      setDiastolic('');
      setPulse('');
      setDate(getTodayLocal());
    } finally {
      setLoading(false);
    }
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
    <>
      {/* Mobile version - Floating Action Button */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <Fab
          color="primary"
          aria-label="add blood pressure"
          onClick={() => setShowDialog(true)}
          sx={{
            position: 'fixed',
            bottom: 80,
            right: 16,
            zIndex: 1000,
            width: 56,
            height: 56
          }}
        >
          <AddIcon />
        </Fab>
      </Box>

      {/* Desktop version */}
      <Card sx={{
        width: '100%',
        display: { xs: 'none', md: 'block' },
        backgroundColor: 'background.paper',
        borderRadius: 2,
        boxShadow: 1,
        border: 'none'
      }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <BPIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              Quick Add Blood Pressure
            </Typography>
          </Box>

          {existingTodayBP && (
            <Box sx={{
              backgroundColor: theme.palette.info.light,
              borderRadius: 1,
              p: 1.5,
              mb: 2,
              border: `1px solid ${theme.palette.info.main}`
            }}>
              <Typography variant="body2" sx={{ color: theme.palette.info.contrastText, fontWeight: 500 }}>
                📝 You already have a reading for today: <strong>{existingTodayBP.systolic}/{existingTodayBP.diastolic}</strong>
                {existingTodayBP.pulse && ` (pulse: ${existingTodayBP.pulse})`}
              </Typography>
              <Typography variant="caption" sx={{ color: theme.palette.info.contrastText }}>
                Adding a new reading will replace the existing one.
              </Typography>
            </Box>
          )}

          <form onSubmit={handleSubmit}>
            <Grid container spacing={2} alignItems="center">
              <Grid xs={12} sm={2}>
                <TextField
                  fullWidth
                  label="Systolic"
                  type="number"
                  value={systolic}
                  onChange={(e) => setSystolic(e.target.value)}
                  InputProps={{
                    endAdornment: <Typography variant="caption">{unit}</Typography>
                  }}
                  size="small"
                />
              </Grid>

              <Grid xs={12} sm={2}>
                <TextField
                  fullWidth
                  label="Diastolic"
                  type="number"
                  value={diastolic}
                  onChange={(e) => setDiastolic(e.target.value)}
                  InputProps={{
                    endAdornment: <Typography variant="caption">{unit}</Typography>
                  }}
                  size="small"
                />
              </Grid>

              <Grid xs={12} sm={2}>
                <TextField
                  fullWidth
                  label="Pulse"
                  type="number"
                  value={pulse}
                  onChange={(e) => setPulse(e.target.value)}
                  InputProps={{
                    endAdornment: <Typography variant="caption">bpm</Typography>
                  }}
                  size="small"
                />
              </Grid>

              <Grid xs={12} sm={3}>
                <TextField
                  fullWidth
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  size="small"
                />
              </Grid>

              <Grid xs={12} sm={3}>
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading}
                  startIcon={<AddIcon />}
                >
                  {loading ? 'Adding...' : 'Add'}
                </Button>
              </Grid>
            </Grid>

            {/* BP Status indicator */}
            {bpStatus && (
              <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
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
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Mobile Dialog */}
      <AddBPDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onAdd={onAdd}
        existingTodayBP={existingTodayBP}
      />
    </>
  );
};

export default QuickAddBP;