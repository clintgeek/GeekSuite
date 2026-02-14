import React from 'react';
import { Grid, TextField, InputAdornment } from '@mui/material';

const NutritionInputs = ({
  values = {},
  onChange,
  showAdvanced = false,
  spacing = 1.5
}) => {
  const handleChange = (field) => (e) => {
    const num = parseFloat(e.target.value);
    onChange?.(field, Number.isFinite(num) ? num : 0);
  };

  const baseFields = [
    { key: 'calories_per_serving', label: 'Calories', adorn: 'kcal' },
    { key: 'protein_grams', label: 'Protein', adorn: 'g' },
    { key: 'carbs_grams', label: 'Carbs', adorn: 'g' },
    { key: 'fat_grams', label: 'Fat', adorn: 'g' }
  ];

  const advancedFields = [
    { key: 'fiber_grams', label: 'Fiber', adorn: 'g' },
    { key: 'sugar_grams', label: 'Sugar', adorn: 'g' },
    { key: 'sodium_mg', label: 'Sodium', adorn: 'mg' }
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


