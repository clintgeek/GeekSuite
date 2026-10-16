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
import PremiumDialog from '../primitives/PremiumDialog.jsx';

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
const FoodEditDialog = ({ open, food, form, onChange, onClose, onSave, loading }) => {
  return (
    <PremiumDialog
      open={open}
      onClose={onClose}
      eyebrow="My Foods"
      title={food ? `Edit ${food.name ?? 'food'}` : 'Create a food'}
      maxWidth="sm"
      primaryAction={
        <Button onClick={onSave} variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={20} /> : (food ? 'Save' : 'Create')}
        </Button>
      }
      secondaryAction={<Button onClick={onClose}>Cancel</Button>}
    >
      <Box sx={{ pt: 1 }}>
          <TextField
            fullWidth
            label="Name"
            value={form.name || ''}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            label="Brand"
            value={form.brand || ''}
            onChange={(e) => onChange({ ...form, brand: e.target.value })}
            sx={{ mb: 2 }}
          />

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <DecimalField
              fullWidth
              label="Calories"
              value={form.calories_per_serving}
              onValue={(n) => onChange({ ...form, calories_per_serving: n })}
              InputProps={{
                endAdornment: <InputAdornment position="end">cal</InputAdornment>
              }}
            />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 2, mb: 2 }}>
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

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 2, mb: 2 }}>
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

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
            <DecimalField
              fullWidth
              label="Serving Size"
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
