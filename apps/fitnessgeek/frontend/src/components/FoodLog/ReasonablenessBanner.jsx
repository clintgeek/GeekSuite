import React from 'react';
import { Alert } from '@mui/material';

// Very simple plausibility check using calories per gram
// Typical ranges: watery foods ~0.2–1 cal/g, lean proteins ~1–2 cal/g, carbs ~3–4 cal/g, fats/oils ~9 cal/g
// We flag values <0.2 or >7 cal/g as suspicious (unless explicitly oil/butter)

const isOilLike = (name = '') => /oil|butter|lard|olive|canola|avocado/.test(String(name).toLowerCase());

const ReasonablenessBanner = ({ name, calories, grams }) => {
  const g = Number(grams) || 0;
  const c = Number(calories) || 0;
  if (g <= 0) return null;
  const cpg = c / g; // cal per gram
  const high = cpg > 7 && !isOilLike(name);
  const low = cpg < 0.2;
  if (!high && !low) return null;
  const severity = high ? 'warning' : 'info';
  const msg = high ? 'This looks unusually calorie-dense for the amount. Consider lowering the serving.' : 'This looks very low for the amount. Confirm the serving size.';
  return (
    <Alert severity={severity} sx={{ mt: 1 }}>{msg}</Alert>
  );
};

export default ReasonablenessBanner;


