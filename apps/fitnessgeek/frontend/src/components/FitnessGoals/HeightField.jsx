import React, { useState } from 'react';
import { Box, TextField, Typography } from '@mui/material';
import { parseHeightToInches } from './calorieCalc.js';

/**
 * Height as two number boxes, feet and inches — on a phone keyboard ' and "
 * are three taps away, and a free-text height was the field people got
 * wrong. Whatever was stored before ("5'11\"", "5 ft 11", 71) is read with the
 * wizard's own parser and shown split; a change is emitted as `5'11"`, which
 * that parser reads back.
 *
 * `onChange(value)` hears a readable height, or '' while the boxes don't
 * make one. `onBlur` fires when focus leaves the pair.
 */
const split = (value) => {
  const inches = parseHeightToInches(value);
  if (inches === null) return { ft: '', inch: '' };
  return { ft: String(Math.floor(inches / 12)), inch: String(inches % 12) };
};

const joinHeight = (ft, inch) => {
  const f = Number(ft);
  const i = inch === '' ? 0 : Number(inch);
  if (!Number.isInteger(f) || f < 3 || f > 7 || !Number.isInteger(i) || i < 0 || i > 11) return '';
  return `${f}'${i}"`;
};

export default function HeightField({ value, onChange, onBlur, label = 'Height', helperText, idPrefix = 'height', disabled = false }) {
  const [parts, setParts] = useState(() => split(value));
  const joined = joinHeight(parts.ft, parts.inch);
  const typedSomething = parts.ft !== '' || parts.inch !== '';
  const invalid = typedSomething && !joined;

  const update = (next) => {
    setParts(next);
    onChange?.(joinHeight(next.ft, next.inch));
  };

  return (
    <Box
      role="group"
      aria-labelledby={`${idPrefix}-label`}
      onBlur={(e) => {
        // Only when focus leaves the pair, not when it moves feet → inches.
        if (!e.currentTarget.contains(e.relatedTarget)) onBlur?.(joined);
      }}
    >
      <Typography id={`${idPrefix}-label`} sx={{ fontWeight: 700, fontSize: '1rem', mb: 1 }}>{label}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        <TextField
          label="Feet"
          type="number"
          value={parts.ft}
          disabled={disabled}
          onChange={(e) => update({ ...parts, ft: e.target.value })}
          inputProps={{ inputMode: 'numeric', min: 3, max: 7, 'data-testid': `${idPrefix}-feet` }}
        />
        <TextField
          label="Inches"
          type="number"
          value={parts.inch}
          disabled={disabled}
          onChange={(e) => update({ ...parts, inch: e.target.value })}
          inputProps={{ inputMode: 'numeric', min: 0, max: 11, 'data-testid': `${idPrefix}-inches` }}
        />
      </Box>
      <Typography
        variant="body2"
        role={invalid ? 'alert' : undefined}
        sx={{ color: invalid ? 'error.main' : 'text.secondary', mt: 0.75 }}
      >
        {invalid ? 'Feet from 3 to 7, inches from 0 to 11.' : helperText}
      </Typography>
    </Box>
  );
}
