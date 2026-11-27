import React, { useEffect, useState } from 'react';
import {
  Button,
  TextField,
  Box,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress
} from '@mui/material';
import { useGeekDialogFullScreen } from '@geeksuite/ui';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import { thumbSaveProps } from '../BloodPressure/thumbSave.jsx';

const PARTIAL_NUMBER = /^\d*[.,]?\d*$/;

/**
 * A number box that keeps what's typed. The fields below used to parse every
 * keystroke and render `value || ''`, so the "0" of "0.5" blanked the box and
 * half a gram could not be typed (REVIEW_2026-10 B11). The parent still gets
 * a number; this keeps the half-typed text. Decimal keypad on phones.
 */
function DecimalField({ value, onValue, fallback = 0, ...props }) {
  const shown = (v) => (v ? String(v) : '');
  const [text, setText] = useState(() => shown(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(shown(value)); }, [value, focused]);
  return (
    <TextField
      {...props}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const next = e.target.value.trim();
        if (!PARTIAL_NUMBER.test(next)) return;
        setText(next);
        const n = Number.parseFloat(next.replace(',', '.'));
        onValue(Number.isFinite(n) ? n : fallback);
      }}
      inputProps={{ inputMode: 'decimal', autoComplete: 'off' }}
    />
  );
}

/**
 * The custom-food form. `food` absent means "create" — the search box's
 * "Can't find it? Create …" row lands here with the name prefilled, which is
 * the escape hatch the old search never had: it dead-ended at "Nothing found".
 */
const FoodEditDialog = ({ open, food, form: givenForm, onChange, onClose, onSave, loading }) => {
  // Save/Create at the bottom on a phone (UX review L9).
  const fullScreen = useGeekDialogFullScreen();
  const form = givenForm || {};
  // A food with no name can't be found again; Save waits for one instead of
  // doing nothing when tapped.
  const hasName = String(form.name || '').trim().length > 0;
  // Not while a save is in flight: a failed save keeps the form as typed.
  const handleClose = () => { if (!loading) onClose?.(); };
  const handleSave = () => { if (!loading && hasName) onSave?.(); };
  // 4px theme unit: 16px between fields, so no label touches the row above.
  const row = { display: 'grid', gap: 4, mb: 4 };
  return (
    <PremiumDialog
      open={open}
      onClose={handleClose}
      title={food ? `Edit ${food.name ?? 'food'}` : 'Create a food'}
      maxWidth="sm"
      {...thumbSaveProps({
        fullScreen,
        save: (
          <Button onClick={handleSave} variant="contained" disabled={loading || !hasName}>
            {loading ? <CircularProgress size={20} color="inherit" aria-label="Saving" /> : (food ? 'Save' : 'Save food')}
          </Button>
        ),
        cancel: <Button onClick={handleClose} disabled={loading}>Cancel</Button>,
      })}
    >
      <Box sx={{ pt: 2 }}>
          <TextField
            fullWidth
            required
            autoFocus={!food}
            label="Name"
            value={form.name || ''}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            sx={{ mb: 4 }}
          />

          <TextField
            fullWidth
            label="Brand"
            value={form.brand || ''}
            onChange={(e) => onChange({ ...form, brand: e.target.value })}
            sx={{ mb: 4 }}
          />

          <Box sx={{ ...row }}>
            <DecimalField
              fullWidth
              label="Calories per serving"
              value={form.calories_per_serving}
              onValue={(n) => onChange({ ...form, calories_per_serving: n })}
              InputProps={{
                endAdornment: <InputAdornment position="end">cal</InputAdornment>
              }}
            />
          </Box>

          <Box sx={{ ...row, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 3 }}>
            <DecimalField
              fullWidth
              label="Protein"
              value={form.protein_grams}
              onValue={(n) => onChange({ ...form, protein_grams: n })}
              InputProps={{
                endAdornment: <InputAdornment position="end">g</InputAdornment>
              }}
            />
            <DecimalField
              fullWidth
              label="Carbs"
              value={form.carbs_grams}
              onValue={(n) => onChange({ ...form, carbs_grams: n })}
              InputProps={{
                endAdornment: <InputAdornment position="end">g</InputAdornment>
              }}
            />
            <DecimalField
              fullWidth
              label="Fat"
              value={form.fat_grams}
              onValue={(n) => onChange({ ...form, fat_grams: n })}
              InputProps={{
                endAdornment: <InputAdornment position="end">g</InputAdornment>
              }}
            />
          </Box>

          <Box sx={{ ...row, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 3 }}>
            <DecimalField
              fullWidth
              label="Fiber"
              value={form.fiber_grams}
              onValue={(n) => onChange({ ...form, fiber_grams: n })}
              InputProps={{
                endAdornment: <InputAdornment position="end">g</InputAdornment>
              }}
            />
            <DecimalField
              fullWidth
              label="Sugar"
              value={form.sugar_grams}
              onValue={(n) => onChange({ ...form, sugar_grams: n })}
              InputProps={{
                endAdornment: <InputAdornment position="end">g</InputAdornment>
              }}
            />
            <DecimalField
              fullWidth
              label="Sodium"
              value={form.sodium_mg}
              onValue={(n) => onChange({ ...form, sodium_mg: n })}
              InputProps={{
                endAdornment: <InputAdornment position="end">mg</InputAdornment>
              }}
            />
          </Box>

          <Box sx={{ ...row, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 3, mb: 0 }}>
            <DecimalField
              fullWidth
              label="Serving size"
              value={form.serving_size}
              onValue={(n) => onChange({ ...form, serving_size: n })}
              fallback={1}
            />
            <FormControl fullWidth>
              <InputLabel>Unit</InputLabel>
              <Select
                value={form.serving_unit || 'oz'}
                onChange={(e) => onChange({ ...form, serving_unit: e.target.value })}
                label="Unit"
              >
                <MenuItem value="oz">ounces (oz)</MenuItem>
                <MenuItem value="lb">pounds (lb)</MenuItem>
                <MenuItem value="cup">cups</MenuItem>
                <MenuItem value="fl oz">fluid ounces (fl oz)</MenuItem>
                <MenuItem value="tbsp">tablespoons</MenuItem>
                <MenuItem value="tsp">teaspoons</MenuItem>
                <MenuItem value="g">grams (g)</MenuItem>
                <MenuItem value="ml">milliliters (ml)</MenuItem>
              </Select>
            </FormControl>
          </Box>
      </Box>
    </PremiumDialog>
  );
};

export default FoodEditDialog;
