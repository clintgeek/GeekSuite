import React, { useState } from 'react';
import { Box, Typography, Alert, Snackbar, CircularProgress } from '@mui/material';
import { useWeight } from '../hooks/useWeight.js';
import {
  WeightGoalWizard,
  WeightTimeline,
  WeightProgress,
  QuickAddWeight,
  WeightLogList
} from '../components/Weight';
import { settingsService } from '../services/settingsService.js';
import { SectionLabel, DisplayHeading } from '../components/primitives';

const Weight = () => {
  const [showGoalWizard, setShowGoalWizard] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);

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

  const handleSaveGoal = async (goalData) => {
    setSavingGoal(true);
    try {
      await settingsService.updateSettings({
        weight_goal: goalData
      });

      // Reload weight data to get updated goal
      await loadWeightData();
      setShowGoalWizard(false);
    } catch (error) {
      console.error('Failed to save weight goal:', error);
      alert('Failed to save goal: ' + error.message);
    } finally {
      setSavingGoal(false);
    }
  };

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
          Track your weight and reach your goals. Goal editing lives on the progress card below.
        </Typography>
      </Box>

      {/* Progress Card */}
      <Box sx={{ mb: 3 }}>
        <WeightProgress
          weightLogs={weightLogs}
          goal={weightGoal}
          currentWeight={currentWeight}
          unit="lbs"
          onEditGoal={() => setShowGoalWizard(true)}
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

      {/* Goal Wizard Dialog */}
      <WeightGoalWizard
        open={showGoalWizard}
        onClose={() => setShowGoalWizard(false)}
        onSave={handleSaveGoal}
        currentWeight={currentWeight}
        existingGoal={weightGoal}
        unit="lbs"
      />

      {/* Success/Error Messages */}
      <Snackbar
        open={!!success}
        autoHideDuration={4000}
        onClose={clearSuccessMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={clearSuccessMessage}
          severity="success"
          sx={{
            width: '100%',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
          }}
        >
          {success}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!error}
        autoHideDuration={4000}
        onClose={clearErrorMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={clearErrorMessage}
          severity="error"
          sx={{
            width: '100%',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
          }}
        >
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Weight;