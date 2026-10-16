import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, IconButton, TextField, MenuItem,
  ToggleButtonGroup, ToggleButton
} from '@mui/material';
import { Remove as MinusIcon, Add as PlusIcon } from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { amountToServings } from '../../utils/recipeMath.js';
import { convertAmount, formatServing, usLogUnits } from '../../utils/units.js';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const mealLabel = (meal) => meal.charAt(0).toUpperCase() + meal.slice(1);
const round = (v, p = 1) => Math.round((Number(v) || 0) * 10 ** p) / 10 ** p;
const STEP = { serving: 0.25, oz: 0.5, 'fl oz': 1, cup: 0.25 };

/**
 * The second tap, for the adds that need one.
 *
 * Tapping a row logs it at the sensible default; this is where you go when the
 * default is wrong. It replaces `AddFoodModal` (446 lines, rendered behind a
 * `modalFood` state nothing ever set) with the two controls that actually get
 * used: how many, and which meal. "How many" can be servings or, when the
 * food has a weight or volume, oz / fl oz / cups.
 */
const ServingSheet = ({ open, food, defaultMealType = 'snack', onClose, onConfirm }) => {
  const theme = useTheme();
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState('serving');
  const [mealType, setMealType] = useState(defaultMealType);

  useEffect(() => {
    if (!open) return;
    const requested = Number(food?.requestedQuantity);
    setAmount(requested > 0 ? requested : 1);
    setUnit('serving');
    setMealType(defaultMealType);
  }, [open, food, defaultMealType]);

  if (!food) return null;

  const nutrition = food.nutrition || {};
  const serving = {
    size: food.serving?.size ?? food.serving_size,
    unit: food.serving?.unit ?? food.serving_unit
  };
  const units = usLogUnits(serving);
  const servingText = formatServing(serving.size, serving.unit);
  const servings = amountToServings(amount, unit, serving) || 0;
  const stepBy = STEP[unit] || 0.25;
  const step = (delta) => setAmount((prev) => Math.max(stepBy, round((Number(prev) || 0) + delta, 2)));
  const total = (key, places = 0) => round((nutrition[key] || 0) * servings, places);
  const switchUnit = (next) => {
    if (!next || next === unit) return;
    const converted = convertAmount(Number(amount) || 1, unit, next, serving);
    setAmount(converted ? round(converted, next === 'serving' ? 2 : 1) : 1);
    setUnit(next);
  };
  const amountLabel = unit === 'serving' ? 'Servings' : unit;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography sx={{ fontSize: '1.0625rem', fontWeight: 700 }}>{food.name}</Typography>
        {food.brand && (
          <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{food.brand}</Typography>
        )}
      </DialogTitle>

      <DialogContent>
        {units.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, mt: 1 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={unit}
              onChange={(_, next) => switchUnit(next)}
              aria-label="Log by"
            >
              <ToggleButton value="serving" sx={{ px: 2 }}>Servings</ToggleButton>
              {units.map((u) => (
                <ToggleButton key={u} value={u} sx={{ px: 2 }}>{u}</ToggleButton>
              ))}
            </ToggleButtonGroup>
            {servingText && (
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                1 serving = {servingText}
              </Typography>
            )}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, my: 2 }}>
          <IconButton
            onClick={() => step(-stepBy)}
            disabled={Number(amount) <= stepBy}
            sx={{ width: 44, height: 44 }}
            aria-label={unit === 'serving' ? 'Fewer servings' : `Less (${unit})`}
          >
            <MinusIcon />
          </IconButton>
          <TextField
            value={amount}
            onChange={(e) => {
              const next = Number.parseFloat(e.target.value);
              setAmount(Number.isFinite(next) && next > 0 ? next : '');
            }}
            onBlur={() => { if (!amount) setAmount(1); }}
            type="number"
            inputProps={{ step: stepBy, min: stepBy, style: { textAlign: 'center', fontWeight: 700 } }}
            sx={{ width: 110 }}
            label={amountLabel}
          />
          <IconButton
            onClick={() => step(stepBy)}
            sx={{ width: 44, height: 44 }}
            aria-label={unit === 'serving' ? 'More servings' : `More (${unit})`}
          >
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
            fontFamily: "inherit"
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
          onClick={() => onConfirm?.({ ...food, servings: round(servings, 3) || 1 }, mealType)}
        >
          Log it
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ServingSheet;
