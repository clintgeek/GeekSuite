import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  TextField,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
  IconButton,
  Chip,
  Divider
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Close as CloseIcon,
  TrendingDown as LoseIcon,
  TrendingUp as GainIcon,
  TrendingFlat as MaintainIcon,
  Flag as GoalIcon
} from '@mui/icons-material';
import { addWeeks, differenceInDays, format } from 'date-fns';

const RATE_OPTIONS = [
  { value: 0.5, label: '0.5', safe: true, description: 'Very gradual' },
  { value: 1, label: '1', safe: true, description: 'Moderate' },
  { value: 1.5, label: '1.5', safe: true, description: 'Aggressive' },
  { value: 2, label: '2', safe: true, description: 'Very aggressive' },
  { value: 2.5, label: '2.5', safe: false, description: 'Extreme (risky)' },
  { value: 3, label: '3', safe: false, description: 'Maximum (risky)' }
];

const WeightGoalWizard = ({ open, onClose, onSave, currentWeight, existingGoal, unit = 'lbs' }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [goalType, setGoalType] = useState('lose'); // 'lose', 'gain', 'maintain'
  const [targetWeight, setTargetWeight] = useState('');
  const [ratePerWeek, setRatePerWeek] = useState(1);
  const [startWeight, setStartWeight] = useState('');
  const [goalDate, setGoalDate] = useState(null);
  const [errors, setErrors] = useState({});

  // Initialize form when dialog opens
  useEffect(() => {
    if (open) {
      if (existingGoal && existingGoal.enabled) {
        // Edit existing goal - use CURRENT weight as new starting point
        setStartWeight(currentWeight || existingGoal.startWeight || '');
        setTargetWeight(existingGoal.targetWeight || '');
        setRatePerWeek(Math.abs(existingGoal.ratePerWeek || 1));

        // Determine goal type based on current weight vs target
        const current = parseFloat(currentWeight || existingGoal.startWeight);
        const target = parseFloat(existingGoal.targetWeight);
        if (target > current) {
          setGoalType('gain');
        } else if (target < current) {
          setGoalType('lose');
        } else {
          setGoalType('maintain');
        }
      } else {
        // New goal
        setStartWeight(currentWeight || '');
        setTargetWeight('');
        setRatePerWeek(1);
        setGoalType('lose');
      }
      setErrors({});
    }
  }, [open, existingGoal, currentWeight]);

  // Calculate goal date whenever inputs change
  useEffect(() => {
    if (startWeight && targetWeight && ratePerWeek > 0) {
      const start = parseFloat(startWeight);
      const target = parseFloat(targetWeight);
      const rate = parseFloat(ratePerWeek);

      if (!isNaN(start) && !isNaN(target) && !isNaN(rate)) {
        const weightDifference = Math.abs(target - start);
        const weeksToGoal = weightDifference / rate;
        const calculatedDate = addWeeks(new Date(), weeksToGoal);
        setGoalDate(calculatedDate);
      } else {
        setGoalDate(null);
      }
    } else {
      setGoalDate(null);
    }
  }, [startWeight, targetWeight, ratePerWeek]);

  const handleGoalTypeChange = (event, newType) => {
    if (newType !== null) {
      setGoalType(newType);
      setTargetWeight(''); // Reset target when changing type
    }
  };

  const handleRateChange = (event, newRate) => {
    if (newRate !== null) {
      setRatePerWeek(newRate);
    }
  };

  const validate = () => {
    const newErrors = {};
    const start = parseFloat(startWeight);
    const target = parseFloat(targetWeight);

    if (!startWeight || isNaN(start) || start <= 0) {
      newErrors.startWeight = 'Please enter a valid starting weight';
    }

    if (!targetWeight || isNaN(target) || target <= 0) {
      newErrors.targetWeight = 'Please enter a valid target weight';
    }

    if (start && target) {
      if (goalType === 'lose' && target >= start) {
        newErrors.targetWeight = 'Target must be less than starting weight';
      }
      if (goalType === 'gain' && target <= start) {
        newErrors.targetWeight = 'Target must be greater than starting weight';
      }
      if (goalType === 'maintain' && target !== start) {
        newErrors.targetWeight = 'Target should equal starting weight for maintenance';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;

    const start = parseFloat(startWeight);
    const target = parseFloat(targetWeight);
    const rate = parseFloat(ratePerWeek);

    // Determine sign of rate based on goal type
    const signedRate = goalType === 'gain' ? rate : -rate;

    const goalData = {
      enabled: true,
      startWeight: start,
      startDate: format(new Date(), 'yyyy-MM-dd'),
      targetWeight: target,
      ratePerWeek: signedRate,
      goalDate: goalDate ? format(goalDate, 'yyyy-MM-dd') : null,
      lastRecalculated: format(new Date(), 'yyyy-MM-dd'),
      unit: unit
    };

    onSave(goalData);
  };

  const handleCancel = () => {
    setErrors({});
    onClose();
  };

  const weightDifference = targetWeight && startWeight
    ? Math.abs(parseFloat(targetWeight) - parseFloat(startWeight))
    : 0;

  const weeksToGoal = weightDifference && ratePerWeek
    ? Math.ceil(weightDifference / ratePerWeek)
    : 0;

  const daysToGoal = goalDate
    ? differenceInDays(goalDate, new Date())
    : 0;

  const selectedRate = RATE_OPTIONS.find(opt => opt.value === ratePerWeek);

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '24px',
          boxShadow: '0 24px 48px rgba(15, 23, 42, 0.15)'
        }
      }}
    >
      <DialogTitle sx={{
        pb: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 48,
            height: 48,
            borderRadius: '12px',
            backgroundColor: theme.palette.primary.main,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <GoalIcon sx={{ color: '#ffffff', fontSize: 24 }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
              {existingGoal?.enabled ? 'Edit Weight Goal' : 'Set Weight Goal'}
            </Typography>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              Track your progress with a personalized plan
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={handleCancel} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {/* Goal Type Selection */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: theme.palette.text.primary }}>
            What's your goal?
          </Typography>
          <ToggleButtonGroup
            value={goalType}
            exclusive
            onChange={handleGoalTypeChange}
            fullWidth
            sx={{
              '& .MuiToggleButton-root': {
                borderRadius: '12px',
                py: 1.5,
                textTransform: 'none',
                fontWeight: 600,
                '&.Mui-selected': {
                  backgroundColor: theme.palette.primary.main,
                  color: theme.palette.primary.contrastText,
                  '&:hover': {
                    backgroundColor: theme.palette.primary.dark
                  }
                }
              }
            }}
          >
            <ToggleButton value="lose">
              <LoseIcon sx={{ mr: 1, fontSize: 20 }} />
              Lose Weight
            </ToggleButton>
            <ToggleButton value="gain">
              <GainIcon sx={{ mr: 1, fontSize: 20 }} />
              Gain Weight
            </ToggleButton>
            <ToggleButton value="maintain">
              <MaintainIcon sx={{ mr: 1, fontSize: 20 }} />
              Maintain
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Weight Inputs */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <TextField
            label="Starting Weight"
            type="number"
            value={startWeight}
            onChange={(e) => setStartWeight(e.target.value)}
            error={!!errors.startWeight}
            helperText={errors.startWeight}
            fullWidth
            InputProps={{
              endAdornment: <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>{unit}</Typography>
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '12px',
                '&.Mui-focused fieldset': {
                  borderColor: theme.palette.primary.main,
                  borderWidth: 2
                }
              }
            }}
          />
          <TextField
            label="Target Weight"
            type="number"
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
            error={!!errors.targetWeight}
            helperText={errors.targetWeight}
            fullWidth
            InputProps={{
              endAdornment: <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>{unit}</Typography>
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '12px',
                '&.Mui-focused fieldset': {
                  borderColor: theme.palette.primary.main,
                  borderWidth: 2
                }
              }
            }}
          />
        </Box>

        {/* Rate Selection */}
        {goalType !== 'maintain' && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: theme.palette.text.primary }}>
              {goalType === 'lose' ? 'Weight Loss' : 'Weight Gain'} Rate (per week)
            </Typography>
            <ToggleButtonGroup
              value={ratePerWeek}
              exclusive
              onChange={handleRateChange}
              fullWidth
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 1,
                mb: 2,
                '& .MuiToggleButtonGroup-grouped': {
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: '12px !important',
                  margin: 0,
                  '&.Mui-selected': {
                    backgroundColor: theme.palette.primary.main,
                    color: theme.palette.primary.contrastText,
                    borderColor: theme.palette.primary.main,
                    '&:hover': {
                      backgroundColor: theme.palette.primary.dark
                    }
                  }
                }
              }}
            >
              {RATE_OPTIONS.map((option) => (
                <ToggleButton
                  key={option.value}
                  value={option.value}
                  sx={{
                    py: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                    textTransform: 'none'
                  }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {option.label}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.7rem', opacity: 0.8 }}>
                    {unit}/week
                  </Typography>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            {/* Rate Description */}
            {selectedRate && (
              <Box sx={{ mb: 3 }}>
                <Chip
                  label={selectedRate.description}
                  size="small"
                  sx={{
                    backgroundColor: selectedRate.safe ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    color: selectedRate.safe ? '#059669' : '#dc2626',
                    fontWeight: 600,
                    border: `1px solid ${selectedRate.safe ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                    borderRadius: '999px'
                  }}
                />
                {!selectedRate.safe && (
                  <Alert severity="warning" sx={{ mt: 2, borderRadius: '12px' }}>
                    This rate may be unsafe for most people. Consult a healthcare professional.
                  </Alert>
                )}
              </Box>
            )}
          </>
        )}

        <Divider sx={{ my: 3 }} />

        {/* Goal Summary */}
        {goalDate && weightDifference > 0 && (
          <Box sx={{
            p: 3,
            borderRadius: '16px',
            background: isDark
              ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(8, 145, 178, 0.15))'
              : 'linear-gradient(135deg, rgba(6, 182, 212, 0.05), rgba(8, 145, 178, 0.05))',
            border: '2px solid rgba(6, 182, 212, 0.2)'
          }}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700, color: theme.palette.text.primary }}>
              Your Goal Summary
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  Total {goalType === 'lose' ? 'loss' : 'gain'} needed:
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
                  {weightDifference.toFixed(1)} {unit}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  Estimated duration:
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
                  {weeksToGoal} weeks ({daysToGoal} days)
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  Projected goal date:
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: theme.palette.primary.main }}>
                  {format(goalDate, 'MMM dd, yyyy')}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0 }}>
        <Button
          onClick={handleCancel}
          sx={{
            borderRadius: '999px',
            px: 3,
            textTransform: 'none',
            fontWeight: 600,
            color: theme.palette.text.secondary
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!goalDate || Object.keys(errors).length > 0}
          sx={{
            borderRadius: '999px',
            px: 4,
            textTransform: 'none',
            fontWeight: 700,
          }}
        >
          {existingGoal?.enabled ? 'Update Goal' : 'Set Goal'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WeightGoalWizard;
