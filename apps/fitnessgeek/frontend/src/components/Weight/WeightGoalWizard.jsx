import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
  Chip,
  Divider
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  TrendingDown as LoseIcon,
  TrendingUp as GainIcon,
  TrendingFlat as MaintainIcon,
  Flag as GoalIcon
} from '@mui/icons-material';
import { addWeeks, format } from 'date-fns';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import { shortDay } from '../../utils/dates.js';

const RATE_OPTIONS = [
  { value: 0.5, label: '0.5', safe: true, description: 'Very gradual' },
  { value: 1, label: '1', safe: true, description: 'Moderate' },
  { value: 1.5, label: '1.5', safe: true, description: 'Fast' },
  { value: 2, label: '2', safe: true, description: 'Very fast' },
  { value: 2.5, label: '2.5', safe: false, description: 'Too fast for most people' },
  { value: 3, label: '3', safe: false, description: 'Too fast for most people' }
];

const WeightGoalWizard = ({ open, onClose, onSave, currentWeight, existingGoal, unit = 'lbs' }) => {
  const unitWord = unit === 'lbs' ? 'lb' : unit;
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
      newErrors.startWeight = 'Enter your starting weight';
    }

    if (!targetWeight || isNaN(target) || target <= 0) {
      newErrors.targetWeight = 'Enter the weight you’re aiming for';
    }

    if (start && target) {
      if (goalType === 'lose' && target >= start) {
        newErrors.targetWeight = 'To lose, your goal needs to be below your starting weight';
      }
      if (goalType === 'gain' && target <= start) {
        newErrors.targetWeight = 'To gain, your goal needs to be above your starting weight';
      }
      if (goalType === 'maintain' && target !== start) {
        newErrors.targetWeight = 'To stay steady, your goal is your starting weight';
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

  const selectedRate = RATE_OPTIONS.find(opt => opt.value === ratePerWeek);

  return (
    <PremiumDialog
      open={open}
      onClose={handleCancel}
      title={existingGoal?.enabled ? 'Change your goal' : 'Set your goal'}
      subtitle="Pick a weight to aim for and a pace."
      icon={GoalIcon}
      maxWidth="sm"
      primaryAction={
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
          {existingGoal?.enabled ? 'Save' : 'Set goal'}
        </Button>
      }
      secondaryAction={
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
      }
    >
        {/* Goal Type Selection */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: theme.palette.text.primary }}>
            What’s your goal?
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
              Lose weight
            </ToggleButton>
            <ToggleButton value="gain">
              <GainIcon sx={{ mr: 1, fontSize: 20 }} />
              Gain weight
            </ToggleButton>
            <ToggleButton value="maintain">
              <MaintainIcon sx={{ mr: 1, fontSize: 20 }} />
              Stay steady
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Weight Inputs */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <TextField
            label="Starting weight"
            type="number"
            value={startWeight}
            onChange={(e) => setStartWeight(e.target.value)}
            inputProps={{ inputMode: 'decimal' }}
            error={!!errors.startWeight}
            helperText={errors.startWeight}
            fullWidth
            InputProps={{
              endAdornment: <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>{unitWord}</Typography>
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
            label="Goal"
            type="number"
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
            inputProps={{ inputMode: 'decimal' }}
            error={!!errors.targetWeight}
            helperText={errors.targetWeight}
            fullWidth
            InputProps={{
              endAdornment: <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>{unitWord}</Typography>
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
              How fast? ({unitWord} a week)
            </Typography>
            <ToggleButtonGroup
              value={ratePerWeek}
              exclusive
              onChange={handleRateChange}
              fullWidth
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
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
                  <Typography variant="caption" sx={{ fontSize: '0.75rem', opacity: 0.8 }}>
                    {unitWord}/week
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
                    This pace is too fast for most people. Check with your doctor first.
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
              Your goal in short
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  To {goalType === 'lose' ? 'lose' : 'gain'}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
                  {weightDifference.toFixed(1)} {unitWord}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  About how long
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
                  {weeksToGoal} {weeksToGoal === 1 ? 'week' : 'weeks'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  You’d get there
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: theme.palette.primary.main }}>
                  {shortDay(goalDate)}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
    </PremiumDialog>
  );
};

export default WeightGoalWizard;
