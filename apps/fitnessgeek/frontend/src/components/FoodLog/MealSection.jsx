import React from 'react';
import {
  Box,
  Typography,
  Button,
  Avatar,
  Chip,
  IconButton
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Add as AddIcon,
  Save as SaveIcon,
  Coffee as BreakfastIcon,
  Restaurant as LunchIcon,
  DinnerDining as DinnerIcon,
  Cookie as SnackIcon
} from '@mui/icons-material';
import FoodLogItem from './FoodLogItem.jsx';

// Meal type configuration with modern cyan theme
const MEAL_CONFIG = {
  breakfast: {
    title: 'Breakfast',
    icon: BreakfastIcon,
    emoji: '🌅',
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    lightBg: 'rgba(245, 158, 11, 0.08)',
    darkBg: 'rgba(245, 158, 11, 0.15)'
  },
  lunch: {
    title: 'Lunch',
    icon: LunchIcon,
    emoji: '☀️',
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    lightBg: 'rgba(16, 185, 129, 0.08)',
    darkBg: 'rgba(16, 185, 129, 0.15)'
  },
  dinner: {
    title: 'Dinner',
    icon: DinnerIcon,
    emoji: '🌙',
    gradient: 'linear-gradient(135deg, #0D9488, #0F766E)',
    lightBg: 'rgba(13, 148, 136, 0.08)',
    darkBg: 'rgba(13, 148, 136, 0.15)'
  },
  snack: {
    title: 'Snacks',
    icon: SnackIcon,
    emoji: '🍎',
    gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    lightBg: 'rgba(139, 92, 246, 0.08)',
    darkBg: 'rgba(139, 92, 246, 0.15)'
  }
};

const MealSection = ({
  mealType,
  logs,
  onAddFood,
  onEditLog,
  onDeleteLog,
  onSaveMeal,
  showActions = true,
  compact = false
}) => {
  const theme = useTheme();
  const config = MEAL_CONFIG[mealType];
  const IconComponent = config.icon;

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
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        p: { xs: 2, sm: 2.5 },
        background: theme.palette.mode === 'dark' ? config.darkBg : config.lightBg,
        borderBottom: `1px solid ${theme.palette.divider}`
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar
            sx={{
              background: config.gradient,
              color: '#ffffff',
              width: { xs: 40, sm: 44 },
              height: { xs: 40, sm: 44 },
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
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
                display: 'flex',
                alignItems: 'center',
                gap: 0.5
              }}
            >
              <span>{config.emoji}</span>
              {config.title}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: theme.palette.text.secondary,
                fontSize: { xs: '0.875rem', sm: '0.9375rem' },
                fontWeight: 600
              }}
            >
              {Math.round(mealTotals.calories)} cal
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: { xs: 0.5, sm: 1 }, alignItems: 'center' }}>
          {/* Save Meal Button */}
          {logs.length > 0 && onSaveMeal && (
            <IconButton
              onClick={handleSaveMeal}
              sx={{
                color: theme.palette.text.secondary,
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : theme.palette.background.default,
                border: `1px solid ${theme.palette.divider}`,
                width: { xs: 32, sm: 40 },
                height: { xs: 32, sm: 40 },
                '&:hover': {
                  backgroundColor: theme.palette.action.hover,
                  borderColor: theme.palette.divider
                }
              }}
              size="small"
            >
              <SaveIcon sx={{ fontSize: { xs: 16, sm: 20 } }} />
            </IconButton>
          )}

          {/* Add Food Button */}
          {onAddFood && (
            <IconButton
              onClick={handleAddFood}
              sx={{
                color: 'white',
                background: config.gradient,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                width: { xs: 32, sm: 40 },
                height: { xs: 32, sm: 40 },
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  transform: 'scale(1.05)'
                },
                transition: 'all 0.2s ease'
              }}
              size="small"
            >
              <AddIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
        {logs.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {logs.map((log) => (
              <FoodLogItem
                key={log.id || log._id || `${log.food_item?.name || log.food_item_id?.name}-${log.meal_type}`}
                log={log}
                onEdit={onEditLog}
                onDelete={onDeleteLog}
                showActions={showActions}
                compact={compact}
              />
            ))}
          </Box>
        ) : (
          <Box sx={{
            textAlign: 'center',
            py: { xs: 3, sm: 4 },
            color: theme.palette.text.disabled
          }}>
            <Typography variant="body2" sx={{ mb: 1.5, fontSize: '0.9375rem' }}>
              No foods logged yet
            </Typography>
            {onAddFood && (
              <Button
                onClick={handleAddFood}
                startIcon={<AddIcon />}
                variant="outlined"
                size="small"
                sx={{
                  borderRadius: '999px',
                  borderColor: theme.palette.divider,
                  color: theme.palette.text.secondary,
                  fontWeight: 600,
                  textTransform: 'none',
                  px: 2,
                  '&:hover': {
                    borderColor: theme.palette.divider,
                    backgroundColor: theme.palette.action.hover
                  }
                }}
              >
                Add Food
              </Button>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default MealSection;