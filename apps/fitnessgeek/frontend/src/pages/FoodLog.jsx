import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Stack,
  Collapse,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  People as PeopleIcon
} from '@mui/icons-material';
import NutritionSummary from '../components/FoodLog/NutritionSummary.jsx';
import CalorieSummary from '../components/FoodLog/CalorieSummary.jsx';
import MealSection from '../components/FoodLog/MealSection.jsx';
import SaveMealDialog from '../components/FoodLog/SaveMealDialog.jsx';
import EditLogDialog from '../components/FoodLog/EditLogDialog.jsx';
import CopyMealDialog from '../components/FoodLog/CopyMealDialog.jsx';
import HouseholdLogView from '../components/FoodLog/HouseholdLogView.jsx';
import QuickAddPanel from '../components/FoodLog/QuickAddPanel.jsx';
import {
  DateNavigator,
  AddFoodDialog
} from '../components/FoodLog';
import { useFoodLog } from '../hooks/useFoodLog.js';
import { fitnessGeekService } from '../services/fitnessGeekService.js';
import { settingsService } from '../services/settingsService.js';
import { goalsService } from '../services/goalsService.js';

const FoodLog = () => {
  const [selectedDate, setSelectedDate] = useState(() => fitnessGeekService.formatDate(new Date()));
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState('snack');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [updatingLog, setUpdatingLog] = useState(false);
  const [showSaveMealDialog, setShowSaveMealDialog] = useState(false);
  const [saveMealData, setSaveMealData] = useState(null);
  const [savingMeal, setSavingMeal] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  // New dialog states
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyPrefill, setCopyPrefill] = useState(null);
  const [showHouseholdDialog, setShowHouseholdDialog] = useState(false);

  // Use custom hook for food log operations
  const {
    loading,
    successMessage,
    errorMessage,
    nutritionSummary,
    refreshGoals,
    refreshLogs,
    getLogsByMealType,
    addFoodToLog,
    updateFoodLog,
    deleteFoodLog,
    saveMeal,
    clearSuccessMessage,
    clearErrorMessage
  } = useFoodLog(selectedDate);

  // Calorie goal adjustment state
  const todayCalorieGoal = useMemo(() => Math.round(nutritionSummary?.calorieGoal || 0), [nutritionSummary]);
  const [goalInput, setGoalInput] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalSavedMsg, setGoalSavedMsg] = useState('');
  const [showCaloriePanel, setShowCaloriePanel] = useState(false);
  const [baseAdd, setBaseAdd] = useState({ base: 0, add: 0 });

  useEffect(() => {
    if (todayCalorieGoal > 0) setGoalInput(String(todayCalorieGoal));
  }, [todayCalorieGoal]);

  const getMondayFirstDayIndex = (dateStr) => {
    const d = new Date(dateStr);
    // JS getDay(): Sun=0..Sat=6 → Mon=0..Sun=6
    return (d.getDay() + 6) % 7;
  };

  const handleSaveTodayGoal = async () => {
    try {
      if (!goalInput) return;
      setSavingGoal(true);
      const resp = await settingsService.getSettings();
      const data = resp?.data || resp?.data?.data || resp;
      const ng = data?.nutrition_goal || {};
      const minSafe = ng?.min_safe_calories || 1200;
      const idx = getMondayFirstDayIndex(selectedDate);
      const base = Array.isArray(ng?.weekly_schedule) && ng.weekly_schedule.length === 7
        ? [...ng.weekly_schedule]
        : new Array(7).fill(ng?.daily_calorie_target || todayCalorieGoal || 0);
      const newVal = Math.max(minSafe, Math.round(parseFloat(goalInput)) || 0);
      base[idx] = newVal;

      await settingsService.updateSettings({
        nutrition_goal: {
          ...ng,
          enabled: true,
          weekly_schedule: base
        }
      });

      setGoalSavedMsg('Today\'s calorie target updated.');
      setTimeout(() => setGoalSavedMsg(''), 3000);
      await refreshGoals();
    } catch (e) {
      console.error('Failed to update today\'s calorie goal', e);
    } finally {
      setSavingGoal(false);
    }
  };

  // Load derived macros to show base(+add)
  useEffect(() => {
    (async () => {
      try {
        const resp = await goalsService.getDerivedMacros();
        const data = resp?.data || resp?.data?.data || resp;
        if (data?.today) {
          setBaseAdd({ base: Math.round(data.today.base_calories || 0), add: Math.round(data.today.activity_add_kcal || 0) });
        }
      } catch (error) {
        console.debug('Failed to load derived macros', error);
      }
    })();
  }, [selectedDate]);

  const handleAddFood = (mealType) => {
    setSelectedMealType(mealType);
    setShowAddDialog(true);
  };

  const handleFoodSelect = async (food, meta = {}) => {
    try {
      if (food && food.type === 'meal' && food._id) {
        // Saved meal: add entire meal to the selected meal type on the selected date
        await fitnessGeekService.addMealToLog(food._id, selectedDate, selectedMealType || 'snack');
        setShowAddDialog(false);
        await refreshGoals();
        await refreshLogs();
        return;
      }

      const success = await addFoodToLog(food, selectedMealType);
      if (success) {
        if (!meta?.isBatch) {
          setShowAddDialog(false);
        }
        await refreshLogs();
      }
    } catch (e) {
      console.error('Failed to add selection to log', e);
    }
  };

  const handleEditLog = (log) => {
    setEditingLog(log);
    setShowEditDialog(true);
  };

  const handleUpdateLog = async (logId, updateData) => {
    setUpdatingLog(true);
    const success = await updateFoodLog(logId, updateData);
    if (success) {
      setShowEditDialog(false);
      setEditingLog(null);
    }
    setUpdatingLog(false);
  };

  const handleEditCancel = () => {
    setShowEditDialog(false);
    setEditingLog(null);
  };

  const handleDeleteLog = async (logId) => {
    await deleteFoodLog(logId);
  };

  const handleSaveMeal = (mealType, logs) => {
    setSaveMealData({ mealType, logs });
    setShowSaveMealDialog(true);
  };

  const handleSaveMealConfirm = async (mealData) => {
    setSavingMeal(true);
    const success = await saveMeal(mealData);
    if (success) {
      setShowSaveMealDialog(false);
      setSaveMealData(null);
    }
    setSavingMeal(false);
  };

  const handleSaveMealCancel = () => {
    setShowSaveMealDialog(false);
    setSaveMealData(null);
  };

  const goToPreviousDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const currentDate = new Date(y, (m || 1) - 1, d || 1);
    currentDate.setDate(currentDate.getDate() - 1);
    setSelectedDate(fitnessGeekService.formatDate(currentDate));
  };

  const goToNextDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const currentDate = new Date(y, (m || 1) - 1, d || 1);
    currentDate.setDate(currentDate.getDate() + 1);
    setSelectedDate(fitnessGeekService.formatDate(currentDate));
  };

  const formatDate = (dateString, short = false) => {
    // Parse YYYY-MM-DD as a local date to avoid UTC shifting the displayed day
    const [y, m, d] = (dateString || '').split('-').map(Number);
    const date = new Date(y || 0, (m || 1) - 1, d || 1);
    // Use shorter format on narrow screens
    if (short || window.innerWidth < 400) {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    }
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Date Navigation with compact calorie card */}
      <DateNavigator
        selectedDate={selectedDate}
        onPreviousDay={goToPreviousDay}
        onNextDay={goToNextDay}
        formatDate={formatDate}
        calorieCard={
          <CalorieSummary
            calories={nutritionSummary?.calories || 0}
            goal={nutritionSummary?.calorieGoal || 0}
            base={baseAdd.base}
            add={baseAdd.add}
            onSettings={() => {
              setShowCaloriePanel(prev => {
                const next = !prev;
                if (!prev && typeof window !== 'undefined') {
                  setTimeout(() => {
                    const panel = document.getElementById('calorie-goal-panel');
                    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 0);
                }
                return next;
              });
            }}
            embedded
          />
        }
      />

      {/* Quick Actions */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Tooltip title="Copy meals from another day">
          <Button
            variant="outlined"
            size="small"
            startIcon={<CopyIcon />}
            onClick={() => setShowCopyDialog(true)}
            sx={{
              minWidth: { xs: 44, sm: 'auto' },
              minHeight: { xs: 44, sm: 40 },
              px: { xs: 2, sm: 2.5 },
              borderRadius: { xs: 2, sm: 999 },
              '& .MuiButton-startIcon': {
                mr: { xs: 0, sm: 1 },
                '& > svg': { fontSize: { xs: 20, sm: 22 } }
              }
            }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Copy Meal</Box>
          </Button>
        </Tooltip>
        <Tooltip title="See what household members ate">
          <Button
            variant="outlined"
            size="small"
            startIcon={<PeopleIcon />}
            onClick={() => setShowHouseholdDialog(true)}
            sx={{
              minWidth: { xs: 44, sm: 'auto' },
              minHeight: { xs: 44, sm: 40 },
              px: { xs: 2, sm: 2.5 },
              borderRadius: { xs: 2, sm: 999 },
              '& .MuiButton-startIcon': {
                mr: { xs: 0, sm: 1 },
                '& > svg': { fontSize: { xs: 20, sm: 22 } }
              }
            }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Household</Box>
          </Button>
        </Tooltip>
      </Box>

      {/* Calorie Goal Panel (toggle) */}
      <Collapse in={showCaloriePanel} unmountOnExit>
        <Card id="calorie-goal-panel" sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">Calorie Goal Today</Typography>
                <Typography variant="h6">{todayCalorieGoal || '—'} kcal</Typography>
              </Box>
              <TextField
                label="Adjust today"
                type="number"
                size="small"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                sx={{ width: 180 }}
              />
              <Button
                variant="contained"
                onClick={handleSaveTodayGoal}
                disabled={savingGoal || !goalInput}
              >
                Save
              </Button>
            </Stack>
            {goalSavedMsg && (
              <Alert severity="success" sx={{ mt: 2 }}>{goalSavedMsg}</Alert>
            )}
          </CardContent>
        </Card>
      </Collapse>

      {/* Removed standalone top calorie card; it's now embedded under the date picker */}

      {/* Quick Add Panel (Favorites & Recent) */}
      <QuickAddPanel
        selectedMealType={selectedMealType}
        onMealTypeChange={setSelectedMealType}
        onAddFood={async (quickFood) => {
          // Directly add the food with 1 serving
          const food = quickFood.food_item;
          await addFoodToLog(
            { ...food, servings: 1 },
            quickFood.meal_type || 'snack'
          );
        }}
      />

      {/* Meal Sections */}
      {(['breakfast', 'lunch', 'dinner', 'snack']).map((mealType) => (
        <Box key={mealType} sx={{ mb: 3 }}>
          <MealSection
            mealType={mealType}
            logs={getLogsByMealType(mealType)}
            onAddFood={handleAddFood}
            onEditLog={handleEditLog}
            onDeleteLog={handleDeleteLog}
            onSaveMeal={handleSaveMeal}
            showActions={true}
          />
        </Box>
      ))}

      {/* Nutrition Summary moved to bottom for cleaner mobile layout */}
      <Box sx={{ mt: 3 }}>
        <NutritionSummary summary={nutritionSummary} showGoals={true} onCalorieSettingsClick={() => {
          setShowCaloriePanel(prev => {
            const next = !prev;
            if (!prev && typeof window !== 'undefined') {
              setTimeout(() => {
                const panel = document.getElementById('calorie-goal-panel');
                if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 0);
            }
            return next;
          });
        }} />
      </Box>

      {/* Add Food Dialog */}
      <AddFoodDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onFoodSelect={handleFoodSelect}
        mealType={selectedMealType}
        showBarcodeScanner={showBarcodeScanner}
        onShowBarcodeScanner={setShowBarcodeScanner}
        onBarcodeScanned={(food) => {
          handleFoodSelect(food);
          setShowBarcodeScanner(false);
        }}
      />

      {/* Save Meal Dialog */}
      {saveMealData && (
        <SaveMealDialog
          open={showSaveMealDialog}
          onClose={handleSaveMealCancel}
          onSave={handleSaveMealConfirm}
          mealType={saveMealData.mealType}
          logs={saveMealData.logs}
          loading={savingMeal}
        />
      )}

      {/* Edit Log Dialog */}
      {editingLog && (
        <EditLogDialog
          open={showEditDialog}
          onClose={handleEditCancel}
          onSave={handleUpdateLog}
          log={editingLog}
          loading={updatingLog}
        />
      )}

      {/* Copy Meal Dialog */}
      <CopyMealDialog
        open={showCopyDialog}
        onClose={() => {
          setShowCopyDialog(false);
          setCopyPrefill(null);
        }}
        currentDate={selectedDate}
        prefill={copyPrefill}
        onCopyComplete={(toDate) => {
          // If copied to current date, refresh logs
          if (toDate === selectedDate) {
            refreshLogs();
          }
        }}
      />

      {/* Household Log View */}
      <HouseholdLogView
        open={showHouseholdDialog}
        onClose={() => setShowHouseholdDialog(false)}
        currentDate={selectedDate}
        onCopyMeal={(copyData) => {
          // Open copy dialog with pre-filled data
          setShowHouseholdDialog(false);
          setCopyPrefill(copyData || null);
          setShowCopyDialog(true);
        }}
      />

      {/* Success/Error Messages */}
      {successMessage && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={clearSuccessMessage}>
          {successMessage}
        </Alert>
      )}
      {errorMessage && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={clearErrorMessage}>
          {errorMessage}
        </Alert>
      )}

      {/* Loading Indicator */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <CircularProgress />
        </Box>
      )}
    </Box>
  );
};

export default FoodLog;