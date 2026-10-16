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
import { useBackToClose } from './useBackToClose.js';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const mealLabel = (meal) => meal.charAt(0).toUpperCase() + meal.slice(1);
const round = (v, p = 1) => Math.round((Number(v) || 0) * 10 ** p) / 10 ** p;
const STEP = { serving: 0.25, oz: 0.5, 'fl oz': 1, cup: 0.25 };
// What a person can be part-way through typing: "", "0", "0.", ".5", "1.25".
const PARTIAL_NUMBER = /^\d*[.,]?\d*$/;
const parseAmount = (raw) => Number.parseFloat(String(raw ?? '').replace(',', '.'));

/**
 * The second tap, for the adds that need one.
 *
 * Tapping a row logs it at the sensible default; this is where you go when the
 * default is wrong. It replaces `AddFoodModal` (446 lines, rendered behind a
 * `modalFood` state nothing ever set) with the two controls that actually get
 * used: how many, and which meal. "How many" can be servings or, when the
 * food has a weight or volume, oz / fl oz / cups.
 *
 * THE AMOUNT IS KEPT AS TYPED (REVIEW_2026-10 B11). It used to be parsed on
 * every keystroke, so the "0" of "0.5" parsed to nothing and blanked the
 * field — half a serving could not be typed — and an empty field then logged
 * one serving. Now the box holds exactly what was typed, the number is read
 * from it when it's used, and Log it waits for an amount above zero. It is a
 * text box with a decimal keypad rather than `type="number"`, because a
 * number input reports "" for a half-typed "0." and that is the same bug.
 */
const ServingSheet = ({ open, food, defaultMealType = 'snack', onClose, onConfirm }) => {
  const theme = useTheme();
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState('serving');
  const [mealType, setMealType] = useState(defaultMealType);

  useEffect(() => {
    if (!open) return;
    const requested = Number(food?.requestedQuantity);
    setAmount(String(requested > 0 ? requested : 1));
    setUnit('serving');
    setMealType(defaultMealType);
  }, [open, food, defaultMealType]);

  // Back closes this sheet, not the page (and not the add sheet under it).
  useBackToClose(Boolean(open && food), onClose);

  if (!food) return null;

  const nutrition = food.nutrition || {};
  const serving = {
    size: food.serving?.size ?? food.serving_size,
    unit: food.serving?.unit ?? food.serving_unit
  };
  const units = usLogUnits(serving);
  const servingText = formatServing(serving.size, serving.unit);
  const parsed = parseAmount(amount);
  const hasAmount = Number.isFinite(parsed) && parsed > 0;
  const servings = hasAmount ? (amountToServings(parsed, unit, serving) || 0) : 0;
  const canLog = hasAmount && servings > 0;
  const stepBy = STEP[unit] || 0.25;
  const step = (delta) => setAmount((prev) => {
    const current = parseAmount(prev);
    return String(Math.max(stepBy, round((Number.isFinite(current) ? current : 0) + delta, 2)));
  });
  const total = (key, places = 0) => round((nutrition[key] || 0) * servings, places);
  const switchUnit = (next) => {
    if (!next || next === unit) return;
    const converted = convertAmount(hasAmount ? parsed : 1, unit, next, serving);
    setAmount(String(converted ? round(converted, next === 'serving' ? 2 : 1) : 1));
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
            disabled={!hasAmount || parsed <= stepBy}
            sx={{ width: 44, height: 44 }}
            aria-label={unit === 'serving' ? 'Fewer servings' : `Less (${unit})`}
          >
            <MinusIcon />
          </IconButton>
          <TextField
            value={amount}
            onChange={(e) => {
              const next = e.target.value.trim();
              if (PARTIAL_NUMBER.test(next)) setAmount(next);
            }}
            // Read on the way out: "0.50" becomes 0.5, "2." becomes 2. Left
            // empty (or 0) it stays that way, and Log it stays off.
            onBlur={() => { if (hasAmount) setAmount(String(round(parsed, 3))); }}
            inputProps={{
              inputMode: 'decimal',
              autoComplete: 'off',
              style: { textAlign: 'center', fontWeight: 700 }
            }}
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
          disabled={!canLog}
          onClick={() => { if (canLog) onConfirm?.({ ...food, servings: round(servings, 3) }, mealType); }}
        >
          Log it
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ServingSheet;
