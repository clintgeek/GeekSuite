import React, { useEffect, useState } from 'react';
import {
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  MenuItem,
  Select,
  FormControl,
  InputLabel
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { useGeekDialogFullScreen } from '@geeksuite/ui';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import { thumbSaveProps } from '../BloodPressure/thumbSave.jsx';
import { mealLabel } from '../../utils/plainWords.js';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

const EditMealDialog = ({ open, onClose, meal, onSave, loading = false }) => {
  // Save at the bottom on a phone (UX review L9).
  const fullScreen = useGeekDialogFullScreen();
  const [form, setForm] = useState({ name: '', meal_type: 'breakfast', food_items: [] });

  useEffect(() => {
    if (meal) {
      setForm({
        name: meal.name || '',
        meal_type: meal.meal_type || 'breakfast',
        food_items: (meal.food_items || []).map((it) => ({
          food_item_id: (it.food_item_id && (it.food_item_id._id || it.food_item_id.id)) || it.food_item_id,
          displayName: it.food_item_id?.name || it.food_item?.name || 'A food',
          servings: it.servings || 1,
        }))
      });
    }
  }, [meal]);

  const handleChangeItemServings = (index, value) => {
    setForm((prev) => {
      const list = [...prev.food_items];
      list[index] = { ...list[index], servings: value };
      return { ...prev, food_items: list };
    });
  };

  const handleRemoveItem = (index) => {
    setForm((prev) => ({ ...prev, food_items: prev.food_items.filter((_, i) => i !== index) }));
  };

  const handleSubmit = () => {
    const payload = {
      name: form.name.trim(),
      meal_type: form.meal_type,
      food_items: form.food_items
        .filter((it) => it.food_item_id)
        .map((it) => ({ food_item_id: it.food_item_id, servings: parseFloat(it.servings) || 1 }))
    };
    onSave(payload);
  };

  const canSave = form.name.trim().length > 0 && form.food_items.length > 0 && !loading;

  return (
    <PremiumDialog
      open={open}
      onClose={onClose}
      title="Edit meal"
      maxWidth="sm"
      {...thumbSaveProps({
        fullScreen,
        save: (
          <Button onClick={handleSubmit} variant="contained" disabled={!canSave}>
            {loading ? 'Saving…' : 'Save'}
          </Button>
        ),
        cancel: <Button onClick={onClose} disabled={loading}>Cancel</Button>,
      })}
    >
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
          <TextField
            label="Meal name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <FormControl>
            <InputLabel>Which meal</InputLabel>
            <Select
              value={form.meal_type}
              label="Which meal"
              onChange={(e) => setForm((p) => ({ ...p, meal_type: e.target.value }))}
            >
              {MEALS.map((m) => (
                <MenuItem key={m} value={m}>{mealLabel(m)}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>Foods</Typography>
        {(form.food_items || []).map((it, idx) => (
          <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="body2" sx={{ flex: 1 }}>{it.displayName}</Typography>
            <TextField
              label="Servings"
              type="number"
              size="small"
              value={it.servings}
              onChange={(e) => handleChangeItemServings(idx, e.target.value)}
              inputProps={{ inputMode: 'decimal', min: 0, step: 'any' }}
              sx={{ width: 120 }}
            />
            <IconButton color="error" aria-label={`Remove ${it.displayName}`} onClick={() => handleRemoveItem(idx)}>
              <DeleteIcon />
            </IconButton>
          </Box>
        ))}
    </PremiumDialog>
  );
};

export default EditMealDialog;


