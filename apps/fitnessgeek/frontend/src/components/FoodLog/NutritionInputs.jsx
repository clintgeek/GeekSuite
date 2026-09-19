import React from 'react';
import { Grid, TextField, InputAdornment } from '@mui/material';

const NutritionInputs = ({
  values = {},
  onChange,
  showAdvanced = false,
  spacing = 1.5,
  // Appended to every field label. Plain "Calories" is ambiguous wherever a
  // caller might show it next to a *total* for N servings elsewhere on the
  // same screen (see EditLogDialog.jsx) — someone who remembers "that was
  // 440 total" can type 440 here while servings > 1 and silently multiply
  // the real total. Left blank by default so a caller that only ever shows
  // one number stays exactly as it read before.
  qualifier = ''
}) => {
  const handleChange = (field) => (e) => {
    const num = parseFloat(e.target.value);
    onChange?.(field, Number.isFinite(num) ? num : 0);
  };

  const baseFields = [
    { key: 'calories_per_serving', label: `Calories${qualifier}`, adorn: 'kcal' },
    { key: 'protein_grams', label: `Protein${qualifier}`, adorn: 'g' },
    { key: 'carbs_grams', label: `Carbs${qualifier}`, adorn: 'g' },
    { key: 'fat_grams', label: `Fat${qualifier}`, adorn: 'g' }
  ];

  const advancedFields = [
    { key: 'fiber_grams', label: `Fiber${qualifier}`, adorn: 'g' },
    { key: 'sugar_grams', label: `Sugar${qualifier}`, adorn: 'g' },
    { key: 'sodium_mg', label: `Sodium${qualifier}`, adorn: 'mg' }
  ];

  const fields = showAdvanced ? [...baseFields, ...advancedFields] : baseFields;

  return (
    <Grid container spacing={spacing}>
      {fields.map((f) => (
        <Grid item xs={6} sm={3} key={f.key}>
          <TextField
            label={f.label}
            type="number"
            size="small"
            value={values?.[f.key] ?? ''}
            onChange={handleChange(f.key)}
            fullWidth
            InputProps={{ endAdornment: <InputAdornment position="end">{f.adorn}</InputAdornment> }}
          />
        </Grid>
      ))}
    </Grid>
  );
};

export default NutritionInputs;


