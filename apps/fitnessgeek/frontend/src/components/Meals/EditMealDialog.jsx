import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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

const EditMealDialog = ({ open, onClose, meal, onSave, loading = false }) => {
  const [form, setForm] = useState({ name: '', meal_type: 'breakfast', food_items: [] });

  useEffect(() => {
    if (meal) {
      setForm({
        name: meal.name || '',
        meal_type: meal.meal_type || 'breakfast',
        food_items: (meal.food_items || []).map((it) => ({
          food_item_id: (it.food_item_id && it.food_item_id._id) || it.food_item_id,
          displayName: it.food_item_id?.name || it.food_item?.name || 'Unknown',
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit Meal</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
          <TextField
            label="Meal Name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <FormControl>
            <InputLabel>Meal Type</InputLabel>
            <Select
              value={form.meal_type}
              label="Meal Type"
              onChange={(e) => setForm((p) => ({ ...p, meal_type: e.target.value }))}
            >
              <MenuItem value="breakfast">Breakfast</MenuItem>
              <MenuItem value="lunch">Lunch</MenuItem>
              <MenuItem value="dinner">Dinner</MenuItem>
              <MenuItem value="snack">Snack</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>Items</Typography>
        {(form.food_items || []).map((it, idx) => (
          <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="body2" sx={{ flex: 1 }}>{it.displayName}</Typography>
            <TextField
              label="Servings"
              type="number"
              size="small"
              value={it.servings}
              onChange={(e) => handleChangeItemServings(idx, e.target.value)}
              sx={{ width: 120 }}
            />
            <IconButton color="error" onClick={() => handleRemoveItem(idx)}>
              <DeleteIcon />
            </IconButton>
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!canSave}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditMealDialog;


