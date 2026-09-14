import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, IconButton, TextField, MenuItem
} from '@mui/material';
import { Remove as MinusIcon, Add as PlusIcon } from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const mealLabel = (meal) => meal.charAt(0).toUpperCase() + meal.slice(1);
const round = (v, p = 1) => Math.round((Number(v) || 0) * 10 ** p) / 10 ** p;

/**
 * The second tap, for the adds that need one.
 *
 * Tapping a row logs it at the sensible default; this is where you go when the
 * default is wrong. It replaces `AddFoodModal` (446 lines, rendered behind a
 * `modalFood` state nothing ever set) with the two controls that actually get
 * used: how many, and which meal.
 */
const ServingSheet = ({ open, food, defaultMealType = 'snack', onClose, onConfirm }) => {
  const theme = useTheme();
  const [servings, setServings] = useState(1);
  const [mealType, setMealType] = useState(defaultMealType);

  useEffect(() => {
    if (!open) return;
    const requested = Number(food?.requestedQuantity);
    setServings(requested > 0 ? requested : 1);
    setMealType(defaultMealType);
  }, [open, food, defaultMealType]);

  if (!food) return null;

  const nutrition = food.nutrition || {};
  const step = (delta) => setServings((prev) => Math.max(0.25, round(prev + delta, 2)));
  const total = (key, places = 0) => round((nutrition[key] || 0) * servings, places);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography sx={{ fontSize: '1.0625rem', fontWeight: 700 }}>{food.name}</Typography>
        {food.brand && (
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{food.brand}</Typography>
        )}
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, my: 2 }}>
          <IconButton
            onClick={() => step(-0.25)}
            disabled={servings <= 0.25}
            sx={{ width: 44, height: 44 }}
            aria-label="Fewer servings"
          >
            <MinusIcon />
          </IconButton>
          <TextField
            value={servings}
            onChange={(e) => {
              const next = Number.parseFloat(e.target.value);
              setServings(Number.isFinite(next) && next > 0 ? next : '');
            }}
            onBlur={() => { if (!servings) setServings(1); }}
            type="number"
            inputProps={{ step: 0.25, min: 0.25, style: { textAlign: 'center', fontWeight: 700 } }}
            sx={{ width: 110 }}
            label="Servings"
          />
          <IconButton onClick={() => step(0.25)} sx={{ width: 44, height: 44 }} aria-label="More servings">
            <PlusIcon />
          </IconButton>
        </Box>

        <TextField
          select
          fullWidth
          label="Meal"
          value={mealType}
          onChange={(e) => setMealType(e.target.value)}
          sx={{ mb: 2 }}
        >
          {MEAL_TYPES.map((meal) => (
            <MenuItem key={meal} value={meal}>{mealLabel(meal)}</MenuItem>
          ))}
        </TextField>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            p: 1.5,
            borderRadius: 2,
            backgroundColor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.07),
            fontFamily: "'JetBrains Mono', monospace"
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>{total('calories_per_serving')} cal</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
            P{total('protein_grams', 1)} · C{total('carbs_grams', 1)} · F{total('fat_grams', 1)}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: 'text.secondary' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => onConfirm?.({ ...food, servings: Number(servings) || 1 }, mealType)}
        >
          Log it
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ServingSheet;
