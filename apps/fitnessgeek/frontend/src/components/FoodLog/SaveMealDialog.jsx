import React, { useState } from 'react';
import {
  Button,
  TextField,
  Box,
  Typography,
  Chip,
  Divider
} from '@mui/material';
import {
  Restaurant as FoodIcon
} from '@mui/icons-material';
import PremiumDialog from '../primitives/PremiumDialog.jsx';

const SaveMealDialog = ({
  open,
  onClose,
  onSave,
  mealType,
  logs,
  loading = false
}) => {
  const [mealName, setMealName] = useState('');

  // `log.food_item_id` is the gateway's populated FoodLog row — a flat
  // FitnessFood object with `id`, never `_id`. Without the `.id` read, a
  // logged item fell through to "no id".
  //
  // There used to be a fallback here that sent `food_item_payload` inside
  // `MealItemInput` for that case. The gateway's `MealItemInput` (see
  // `apps/basegeek/packages/api/src/graphql/fitnessgeek/typeDefs.js`) only
  // ever declared `food_item_id: ID!` / `servings: Float!` — no such field
  // exists to receive it, so graphql-js would reject the whole
  // `createFitnessMeal`/`updateFitnessMeal` call the moment that branch was
  // reached, losing every other item in the meal along with it. Today's
  // `addFoodLog` always resolves a real `food_item_id` via findOrCreate, so a
  // log row with no id should not exist — but if one ever does (stale data,
  // a soft-deleted catalog row), skip it and say so rather than sending a
  // field the gateway has no home for.
  const resolveFoodId = (log) => {
    const food = log.food_item || log.food_item_id || {};
    const rawId = log.food_item_id || food._id;
    return typeof rawId === 'object' ? (rawId?.id ?? rawId?._id) : rawId;
  };

  const unresolvedCount = logs.filter(log => !resolveFoodId(log)).length;

  const handleSave = () => {
    if (mealName.trim() && logs.length > 0) {
      const food_items = logs
        .map(log => {
          const foodId = resolveFoodId(log);
          if (!foodId) return null;
          return { food_item_id: foodId, servings: log.servings || 1 };
        })
        .filter(Boolean);
      if (food_items.length === 0) return;
      const mealData = {
        name: mealName.trim(),
        meal_type: mealType,
        food_items
      };
      onSave(mealData);
    }
  };

  const handleClose = () => {
    setMealName('');
    onClose();
  };

  // Calculate meal totals
  const mealTotals = logs.reduce(
    (totals, log) => {
      const food_item = log.food_item || log.food_item_id;
      const { servings } = log;

      if (!food_item || !food_item.nutrition) {
        return totals;
      }

      const nutrition = food_item.nutrition;
      const servingsCount = typeof servings === 'string' ? parseFloat(servings) || 1 : (servings || 1);

      return {
        calories: totals.calories + ((nutrition.calories_per_serving || 0) * servingsCount),
        protein: totals.protein + ((nutrition.protein_grams || 0) * servingsCount),
        carbs: totals.carbs + ((nutrition.carbs_grams || 0) * servingsCount),
        fat: totals.fat + ((nutrition.fat_grams || 0) * servingsCount)
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const mealTypeName = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack'
  }[mealType];

  return (
    <PremiumDialog
      open={open}
      onClose={handleClose}
      eyebrow="My Meals"
      title={`Save ${mealTypeName}`}
      icon={FoodIcon}
      maxWidth="sm"
      primaryAction={
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!mealName.trim() || loading || unresolvedCount === logs.length}
        >
          {loading ? 'Saving...' : 'Save Meal'}
        </Button>
      }
      secondaryAction={
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
      }
    >
        <Box sx={{ mb: 3 }}>
          <TextField
            autoFocus
            fullWidth
            label="Meal Name"
            placeholder="e.g., El P's Ench and Marg"
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            sx={{ mb: 2 }}
          />

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            This meal contains {logs.length} item{logs.length !== 1 ? 's' : ''}:
          </Typography>

          {unresolvedCount > 0 && (
            <Typography variant="body2" color="warning.main" sx={{ mb: 1 }}>
              {unresolvedCount} item{unresolvedCount !== 1 ? 's' : ''} could not be saved to the
              meal — no catalog entry
            </Typography>
          )}

          <Box sx={{ mb: 2 }}>
            {logs.map((log, index) => {
              const food_item = log.food_item || log.food_item_id;
              const servings = log.servings || 1;

              return (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    mb: 1,
                    p: 1,
                    backgroundColor: 'action.hover',
                    borderRadius: 1
                  }}
                >
                  <FoodIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {food_item?.name || 'Unknown Food'}
                  </Typography>
                  <Chip
                    label={`${servings} serving${servings !== 1 ? 's' : ''}`}
                    size="small"
                    variant="outlined"
                  />
                </Box>
              );
            })}
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" fontWeight={600} gutterBottom>
            Total Nutrition:
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Chip label={`${Math.round(mealTotals.calories)} cal`} size="small" />
            <Chip label={`${Math.round(mealTotals.protein)}g protein`} size="small" />
            <Chip label={`${Math.round(mealTotals.carbs)}g carbs`} size="small" />
            <Chip label={`${Math.round(mealTotals.fat)}g fat`} size="small" />
          </Box>
        </Box>
    </PremiumDialog>
  );
};

export default SaveMealDialog;