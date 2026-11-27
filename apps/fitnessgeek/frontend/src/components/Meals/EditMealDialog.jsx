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
import { DeleteOutline as DeleteIcon } from '@mui/icons-material';
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
        // A null entry, or one whose food was deleted, is skipped rather
        // than thrown on.
        food_items: (Array.isArray(meal.food_items) ? meal.food_items : [])
          .filter((it) => it && typeof it === 'object')
          .map((it) => ({
            food_item_id: (it.food_item_id && (it.food_item_id._id || it.food_item_id.id)) || it.food_item_id,
            displayName: it.food_item_id?.name || it.food_item?.name || 'A food',
            servings: it.servings || 1,
          }))
      });
    }
  }, [meal]);

  const servingsOk = (value) => { const n = parseFloat(value); return Number.isFinite(n) && n > 0; };
  const canSave = form.name.trim().length > 0
    && form.food_items.length > 0
    && form.food_items.every((it) => servingsOk(it.servings))
    && !loading;
  // Not while a save is in flight; a failed save keeps the form as typed.
  const handleClose = () => { if (!loading) onClose(); };

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
    if (!canSave) return;
    const payload = {
      name: form.name.trim(),
      meal_type: form.meal_type,
      food_items: form.food_items
        .filter((it) => it.food_item_id)
        .map((it) => ({ food_item_id: it.food_item_id, servings: parseFloat(it.servings) || 1 }))
    };
    onSave(payload);
  };

  return (
    <PremiumDialog
      open={open}
      onClose={handleClose}
      title="Edit meal"
      maxWidth="sm"
      {...thumbSaveProps({
        fullScreen,
        save: (
          <Button onClick={handleSubmit} variant="contained" disabled={!canSave}>
            {loading ? 'Saving…' : 'Save'}
          </Button>
        ),
        cancel: <Button onClick={handleClose} disabled={loading}>Cancel</Button>,
      })}
    >
        {/* 4px theme unit: 16px between fields, 8px to clear the floating
            label under the header. */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 4, pt: 2, mb: 6 }}>
          <TextField
            label="Meal name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            inputProps={{ maxLength: 80 }}
          />
          <FormControl>
            <InputLabel id="edit-meal-which">Which meal</InputLabel>
            <Select
              labelId="edit-meal-which"
              value={MEALS.includes(form.meal_type) ? form.meal_type : 'breakfast'}
              label="Which meal"
              onChange={(e) => setForm((p) => ({ ...p, meal_type: e.target.value }))}
            >
              {MEALS.map((m) => (
                <MenuItem key={m} value={m}>{mealLabel(m)}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Typography component="h3" sx={{ m: 0, mb: 1, fontSize: '0.9375rem', fontWeight: 700, color: 'text.secondary' }}>
          Foods
        </Typography>
        {form.food_items.length === 0 && (
          <Typography role="status" sx={{ color: 'text.secondary', py: 2 }}>
            A meal needs at least one food. Close this to keep the meal as it was.
          </Typography>
        )}
        {(form.food_items || []).map((it, idx) => (
          <Box
            key={idx}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              py: 2.5,
              borderBottom: (t) => `1px solid ${t.palette.divider}`,
              '&:last-of-type': { borderBottom: 'none' },
            }}
          >
            <Typography sx={{ flex: 1, minWidth: 0, fontSize: '1rem', overflowWrap: 'anywhere' }}>{it.displayName}</Typography>
            <TextField
              label="Servings"
              type="number"
              size="small"
              value={it.servings}
              onChange={(e) => handleChangeItemServings(idx, e.target.value)}
              error={!servingsOk(it.servings)}
              inputProps={{ inputMode: 'decimal', min: 0, step: 'any' }}
              sx={{ width: 104, flexShrink: 0 }}
            />
            <IconButton aria-label={`Remove ${it.displayName}`} onClick={() => handleRemoveItem(idx)} disabled={loading} sx={{ color: 'text.secondary', flexShrink: 0, mr: -2, '&:hover, &:active': { color: 'error.main' } }}>
              <DeleteIcon />
            </IconButton>
          </Box>
        ))}
    </PremiumDialog>
  );
};

export default EditMealDialog;


