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
  Grid
} from '@mui/material';
import {
  Add as AddIcon,
  MonitorHeart as BPIcon
} from '@mui/icons-material';
import { useGeekPrimaryAction } from '@geeksuite/ui';
import { localDateString } from '@geeksuite/utils';
import AddBPDialog from './AddBPDialog.jsx';
import DateField from '../primitives/DateField.jsx';
import { categorizeBP } from '../../utils/bpUtils.js';
import { nowLocalTime, combineDateTimeToISO } from './bpTimeUtils.js';

// Mirrors `bloodPressureBounds` in `@geeksuite/schemas/fitnessgeek/bloodPressure.js`.
// See AddBPDialog.jsx's copy of this comment — same reason, same numbers.
const SYS_BOUNDS = { min: 60, max: 300 };
const DIA_BOUNDS = { min: 30, max: 200 };
const PULSE_BOUNDS = { min: 30, max: 250 };

/**
 * QuickAddBP — the desktop inline "add" card, plus the mobile FAB → dialog.
 *
 * `existingTodayBP` is gone. It warned about a restriction — one reading per
 * calendar day — that the backend no longer enforces (see AddBPDialog.jsx's
 * header): a home cuff is read morning and evening, and the old warning
 * would fire on exactly that normal second entry.
 */
const QuickAddBP = ({ onAdd, unit = "mmHg" }) => {
  const theme = useTheme();
  const [showDialog, setShowDialog] = useState(false);
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [date, setDate] = useState(localDateString());
  // Defaults to right now, same as the mobile dialog — see AddBPDialog.jsx's
  // `blankForm`. The common case (log a reading just taken) never touches
  // date or time at all.
  const [time, setTime] = useState(nowLocalTime());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // The page's thumb-zone action. `GeekFab` (mounted by the shell) reads the
  // bottom-nav inset and the safe area; the old `bottom: 80` guessed at both.
  useGeekPrimaryAction({
    label: 'Log blood pressure',
    icon: <AddIcon />,
    onClick: () => setShowDialog(true)
  });

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

    if (systolicNum < SYS_BOUNDS.min || systolicNum > SYS_BOUNDS.max) {
      setError(`Systolic should be between ${SYS_BOUNDS.min}-${SYS_BOUNDS.max} mmHg`);
      return;
    }

    if (diastolicNum < DIA_BOUNDS.min || diastolicNum > DIA_BOUNDS.max) {
      setError(`Diastolic should be between ${DIA_BOUNDS.min}-${DIA_BOUNDS.max} mmHg`);
      return;
    }

    if (systolicNum <= diastolicNum) {
      setError('Systolic should be higher than diastolic');
      return;
    }

    if (pulse && (pulseNum < PULSE_BOUNDS.min || pulseNum > PULSE_BOUNDS.max)) {
      setError(`Pulse should be between ${PULSE_BOUNDS.min}-${PULSE_BOUNDS.max} bpm`);
      return;
    }

    setLoading(true);
    try {
      await onAdd({
        systolic: systolicNum,
        diastolic: diastolicNum,
        pulse: pulseNum,
        date,
        measured_at: combineDateTimeToISO(date, time),
      });

      // Reset form
      setSystolic('');
      setDiastolic('');
      setPulse('');
      setDate(localDateString());
      setTime(nowLocalTime());
    } catch (err) {
      setError(err.message || 'Failed to add blood pressure reading');
    } finally {
      setLoading(false);
    }
  };

  const getBPStatus = () => {
    if (!systolic || !diastolic) return null;

    const sys = parseInt(systolic);
    const dia = parseInt(diastolic);

    if (isNaN(sys) || isNaN(dia)) return null;

    // The one shared categoriser — same bands, same order, as the saved row
    // will get once it lands in BPLogList/BPInsights/BPReport. No local
    // "High Normal" band here; that band never existed in the AHA guidelines
    // and let the live-typing category disagree with what got saved.
    const category = categorizeBP(sys, dia);
    return { status: category.stage, color: category.color };
  };

  const bpStatus = getBPStatus();

  return (
    <>
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

              <Grid xs={12} sm={2}>
                <DateField fullWidth value={date} onChange={setDate} size="small" />
              </Grid>

              <Grid xs={12} sm={2}>
                <TextField
                  fullWidth
                  label="Time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ step: 60 }}
                />
              </Grid>

              <Grid xs={12} sm={2}>
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
      />
    </>
  );
};

export default QuickAddBP;
