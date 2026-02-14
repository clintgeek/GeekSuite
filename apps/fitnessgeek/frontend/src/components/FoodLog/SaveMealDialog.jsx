import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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

const SaveMealDialog = ({
  open,
  onClose,
  onSave,
  mealType,
  logs,
  loading = false
}) => {
  const [mealName, setMealName] = useState('');

  const handleSave = () => {
    if (mealName.trim() && logs.length > 0) {
      const mealData = {
        name: mealName.trim(),
        meal_type: mealType,
        food_items: logs.map(log => {
          const food = log.food_item || log.food_item_id || {};
          const rawId = log.food_item_id || food._id;
          const foodId = typeof rawId === 'object' ? rawId?._id : rawId;
          const servings = log.servings || 1;
          if (foodId) {
            return { food_item_id: foodId, servings };
          }
          // Fallback payload to allow creating a custom food when no id exists
          return {
            servings,
            food_item_payload: {
              name: food.name,
              brand: food.brand,
              barcode: food.barcode,
              source: food.source || 'custom',
              source_id: food.source_id,
              nutrition: {
                calories_per_serving: food.nutrition?.calories_per_serving || 0,
                protein_grams: food.nutrition?.protein_grams || 0,
                carbs_grams: food.nutrition?.carbs_grams || 0,
                fat_grams: food.nutrition?.fat_grams || 0,
                fiber_grams: food.nutrition?.fiber_grams || 0,
                sugar_grams: food.nutrition?.sugar_grams || 0,
                sodium_mg: food.nutrition?.sodium_mg || 0
              },
              serving: {
                size: food.serving?.size || food.serving_size || 100,
                unit: food.serving?.unit || food.serving_unit || 'g'
              }
            }
          };
        })
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
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        Save {mealTypeName} Meal
      </DialogTitle>
      <DialogContent>
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
                    backgroundColor: '#f5f5f5',
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
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!mealName.trim() || loading}
        >
          {loading ? 'Saving...' : 'Save Meal'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaveMealDialog;