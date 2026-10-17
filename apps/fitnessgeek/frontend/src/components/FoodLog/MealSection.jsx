import React from 'react';
import {
  Box,
  Typography,
  Button,
  Avatar
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Add as AddIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import FoodLogItem from './FoodLogItem.jsx';
import { mealLook, mealIcon } from './mealLook.js';
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
  const IconComponent = mealIcon(mealType);
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

  return (
    <Box sx={{
      backgroundColor: theme.palette.background.paper,
      borderRadius: '20px',
      boxShadow: theme.shadows[1],
      overflow: 'hidden',
      border: `1px solid ${theme.palette.divider}`,
      transition: 'all 0.2s ease',
      '&:hover': {
        boxShadow: theme.shadows[3],
        transform: 'translateY(-2px)'
      }
    }}>
      {/* Header */}
      <Box sx={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        p: { xs: 2, sm: 2.5 },
        pt: { xs: 2.75, sm: 3.25 },
        flexWrap: 'wrap',
        gap: 1,
        bgcolor: look.headerBg,
        // The produce edge along the top, as on Home's meal cards.
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 6,
          bgcolor: look.edge,
        },
        borderBottom: (logs.length > 0 || justAdded) ? `1px solid ${theme.palette.divider}` : 'none'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar
            sx={{
              bgcolor: look.badge,
              color: look.badgeInk,
              width: { xs: 40, sm: 44 },
              height: { xs: 40, sm: 44 },
            }}
          >
            <IconComponent sx={{ fontSize: { xs: 20, sm: 24 } }} />
          </Avatar>
          <Box>
            <Typography
              variant="body1"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1.0625rem', sm: '1.125rem' },
                color: theme.palette.text.primary,
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: theme.palette.text.secondary,
                fontSize: { xs: '0.875rem', sm: '0.9375rem' },
                fontWeight: 600
              }}
            >
              {logs.length === 0 ? 'Nothing yet' : `${Math.round(mealTotals.calories).toLocaleString('en-US')} cal`}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: { xs: 0.5, sm: 1 }, alignItems: 'center' }}>
          {/* Save as a meal — Full only, and labelled: the bare floppy disk
              read as "save my log" (UX review L15). */}
          {!simple && logs.length > 0 && onSaveMeal && (
            <Button
              onClick={handleSaveMeal}
              startIcon={<SaveIcon />}
              aria-label={`Save ${meal} as a meal`}
              sx={{ minHeight: 44, color: 'text.secondary', fontWeight: 700, textTransform: 'none' }}
            >
              Save as a meal
            </Button>
          )}

          {/* + Add — the same word as the Home meal cards. */}
          {onAddFood && (
            <Button
              onClick={handleAddFood}
              startIcon={<AddIcon />}
              aria-label={`Add to ${meal}`}
              sx={{
                minHeight: 44,
                px: 2,
                borderRadius: 999,
                color: look.badgeInk,
                bgcolor: look.badge,
                fontWeight: 800,
                textTransform: 'none',
                boxShadow: 'none',
                // Ink on the produce fill, the Home card's "+ Add" (5.4–10:1).
                '&:hover, &:active': { bgcolor: look.badge, filter: 'brightness(0.94)' }
              }}
            >
              Add
            </Button>
          )}
        </Box>
      </Box>

      {/* Content. Empty, the header already says "Nothing yet" (the
          same words as Home) and its "+ Add" is the button. */}
      {(logs.length > 0 || justAdded) && (
      <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
        {justAdded && <Box sx={{ mb: logs.length > 0 ? 1.5 : 0 }}>{justAdded}</Box>}
        {logs.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {logs.map((log) => {
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
                />
              );
            })}
          </Box>
        )}
      </Box>
      )}
    </Box>
  );
};

export default MealSection;