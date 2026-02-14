import React, { useState } from 'react';
import { Box, Typography, Alert, Snackbar, CircularProgress, Button } from '@mui/material';
import { Flag as GoalIcon } from '@mui/icons-material';
import { useWeight } from '../hooks/useWeight.js';
import {
  WeightGoalWizard,
  WeightTimeline,
  WeightProgress,
  QuickAddWeight,
  WeightLogList
} from '../components/Weight';
import { settingsService } from '../services/settingsService.js';

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
      // Get current settings
      const settingsResp = await settingsService.getSettings();
      const settingsData = settingsResp?.data || settingsResp?.data?.data || settingsResp;

      // Update weight goal
      await settingsService.updateSettings({
        ...settingsData,
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
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box sx={{
        mb: 4,
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: { xs: 2, sm: 0 }
      }}>
        <Box>
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontWeight: 700,
              mb: 0.5,
              color: 'text.primary',
              letterSpacing: '-0.02em',
              fontSize: { xs: '1.5rem', sm: '2.125rem' }
            }}
          >
            Weight Tracking
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', fontSize: { xs: '0.875rem', sm: '1.0625rem' } }}>
            Track your weight and reach your goals
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<GoalIcon />}
          onClick={() => setShowGoalWizard(true)}
          sx={{
            borderRadius: '999px',
            px: 3,
            py: { xs: 1.25, sm: 1 },
            textTransform: 'none',
            fontWeight: 700,
            alignSelf: { xs: 'stretch', sm: 'auto' },
          }}
        >
          {weightGoal?.enabled ? 'Edit Goal' : 'Set Goal'}
        </Button>
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