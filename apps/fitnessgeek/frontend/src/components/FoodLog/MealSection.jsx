import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import FoodLogItem from './FoodLogItem.jsx';
import { LabelPanel, ListRow } from '../primitives';
import { mealLook } from './mealLook.js';
import { mealLabel, mealWord } from '../../utils/plainWords.js';

const MealSection = ({
  mealType,
  logs,
  onAddFood,
  onEditLog,
  onDeleteLog,
  onSaveMeal,
  showActions = true,
  compact = false,
  mode = 'standard',
  // Real favourite state, keyed by food id (see useFoodLog.js's
  // `favoriteFoodIds`/`toggleFavoriteId`). Both default to "nothing is
  // favourited yet" rather than undefined, so FoodLogItem never has to guess.
  favoriteFoodIds,
  onFavoriteChange,
  // Full's "Just added" strip (useJustAdded's `renderFor`), shown at the top
  // of this meal until her next action.
  justAdded = null,
  // Simple (UX review L15): the header keeps only "+ Add", and rows are the
  // plain tappable kind. Full labels "Save as a meal".
  simple = false
}) => {
  const theme = useTheme();
  const look = mealLook(mealType, theme);
  const title = mealLabel(mealType);
  const meal = mealWord(mealType);

  // Calculate meal totals
  const mealTotals = logs.reduce(
    (totals, log) => {
      // Handle both food_item and food_item_id structures
      const food_item = log.food_item || log.food_item_id;
      const { servings } = log;

      // Safety check for food_item
      if (!food_item) {
        // Missing nutrition data in meal section; skipping this item
        return totals;
      }

      // Prefer the log's stored nutrition snapshot when present
      const nutrition = (log.nutrition && Object.keys(log.nutrition || {}).length > 0)
        ? log.nutrition
        : food_item.nutrition;

      if (!nutrition) {
        return totals;
      }
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

  const handleAddFood = () => {
    if (onAddFood) {
      onAddFood(mealType);
    }
  };

  const handleSaveMeal = () => {
    if (onSaveMeal && (logs.length > 0)) {
      onSaveMeal(mealType, logs);
    }
  };

  const hasRows = logs.length > 0;
  const calories = hasRows ? `${Math.round(mealTotals.calories).toLocaleString('en-US')} cal` : 'Nothing yet';

  return (
    <LabelPanel
      title={
        <>
          <Box
            component="span"
            aria-hidden
            sx={{ display: 'inline-block', width: 12, height: 12, bgcolor: look.badge, mr: 1, verticalAlign: 'baseline' }}
          />
          {title}
        </>
      }
      action={
        <Typography component="span" sx={{ fontSize: '1.0625rem', fontWeight: hasRows ? 700 : 400, color: hasRows ? 'text.primary' : 'text.secondary' }}>
          {calories}
        </Typography>
      }
    >
      {/* Empty, the title row already says "Nothing yet" (the same words as
          Home) and "+ Add" below is the way in. */}
      {justAdded && <Box sx={{ py: 1 }}>{justAdded}</Box>}
      {hasRows && (
        <Box>
          {logs.map((log, i) => {
            const food_item = log.food_item || log.food_item_id;
            const foodId = food_item?._id || food_item?.id;
            return (
              <FoodLogItem
                key={log.id || log._id || `${food_item?.name}-${log.meal_type}`}
                log={log}
                onEdit={onEditLog}
                onDelete={onDeleteLog}
                showActions={showActions}
                compact={compact}
                mode={mode}
                isFavorite={Boolean(foodId && favoriteFoodIds?.has(String(foodId)))}
                onFavoriteChange={onFavoriteChange}
                simple={simple}
                first={i === 0 && !justAdded}
              />
            );
          })}
        </Box>
      )}

      {/* The foot: "+ Add" in the meal's own colour of ink, and (Full only,
          labelled: the bare floppy disk read as "save my log") Save as a meal. */}
      {(onAddFood || (!simple && hasRows && onSaveMeal)) && (
        <ListRow first={!hasRows && !justAdded} sx={{ minHeight: 48 }}>
          {onAddFood ? (
            <Button
              onClick={handleAddFood}
              aria-label={`Add to ${meal}`}
              sx={{ minHeight: 44, px: 0, justifyContent: 'flex-start', color: look.text, fontWeight: 700, fontSize: '1rem', textTransform: 'none', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
            >
              + Add
            </Button>
          ) : <span />}
          {!simple && hasRows && onSaveMeal && (
            <Button
              onClick={handleSaveMeal}
              aria-label={`Save ${meal} as a meal`}
              sx={{ minHeight: 44, px: 0, color: 'text.primary', fontWeight: 400, fontSize: '0.875rem', textTransform: 'none', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
            >
              Save as a meal
            </Button>
          )}
        </ListRow>
      )}
    </LabelPanel>
  );
};

export default MealSection;
