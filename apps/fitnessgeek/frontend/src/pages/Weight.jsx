import React, { useEffect } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';
import { useWeight } from '../hooks/useWeight.js';
import {
  WeightTimeline,
  WeightProgress,
  QuickAddWeight,
  WeightLogList
} from '../components/Weight';
import { SectionLabel, DisplayHeading } from '../components/primitives';

const Weight = () => {
  const navigate = useNavigate();

  // Use custom hook for weight operations
  const {
    weightLogs,
    weightGoal,
    loading,
    success,
    error,
    currentWeight,
    addWeightLog,
    deleteWeightLog,
    loadWeightData,
    clearSuccessMessage,
    clearErrorMessage
  } = useWeight();
  const { notify } = useToast();

  // Success/error come from useWeight's own auto-clearing state; forward each
  // to the shared toast stack in place of the local Snackbar pair, then clear
  // the source so a re-render doesn't re-fire it.
  useEffect(() => {
    if (!success) return;
    notify(success, { tone: 'success' });
    clearSuccessMessage();
  }, [success, notify, clearSuccessMessage]);

  useEffect(() => {
    if (!error) return;
    notify(error, { tone: 'error' });
    clearErrorMessage();
  }, [error, notify, clearErrorMessage]);

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh'
      }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 960, mx: 'auto' }}>
      {/* Editorial header */}
      <Box sx={{ mb: 3 }}>
        <SectionLabel sx={{ mb: 0.75 }}>Tracking · Weight</SectionLabel>
        <DisplayHeading size="page">Weight</DisplayHeading>
        <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
          Track your weight and reach your goals.
        </Typography>
      </Box>

      {/* Progress Card */}
      <Box sx={{ mb: 3 }}>
        <WeightProgress
          weightLogs={weightLogs}
          goal={weightGoal}
          currentWeight={currentWeight}
          unit="lbs"
          onEditGoal={() => navigate('/calorie-wizard')}
        />
      </Box>

      {/* Timeline Chart */}
      <Box sx={{ mb: 3 }}>
        <WeightTimeline
          weightLogs={weightLogs}
          goal={weightGoal}
          unit="lbs"
        />
      </Box>

      {/* Quick Add Weight */}
      <Box sx={{ mb: 3 }}>
        <QuickAddWeight onAdd={addWeightLog} unit="lbs" />
      </Box>

      {/* Weight Log List */}
      <Box sx={{ mb: 3 }}>
        <WeightLogList
          logs={weightLogs}
          onDelete={deleteWeightLog}
          unit="lbs"
        />
      </Box>
    </Box>
  );
};

export default Weight;