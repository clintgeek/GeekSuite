import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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

const FoodEditDialog = ({ open, food, form, onChange, onClose, onSave, loading }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Edit {food?.name}
      </DialogTitle>
      <DialogContent>
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
            <TextField
              fullWidth
              label="Calories"
              type="number"
              value={form.calories_per_serving || ''}
              onChange={(e) => onChange({ ...form, calories_per_serving: parseFloat(e.target.value) || 0 })}
              InputProps={{
                endAdornment: <InputAdornment position="end">cal</InputAdornment>
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              fullWidth
              label="Protein"
              type="number"
              value={form.protein_grams || ''}
              onChange={(e) => onChange({ ...form, protein_grams: parseFloat(e.target.value) || 0 })}
              InputProps={{
                endAdornment: <InputAdornment position="end">g</InputAdornment>
              }}
            />
            <TextField
              fullWidth
              label="Carbs"
              type="number"
              value={form.carbs_grams || ''}
              onChange={(e) => onChange({ ...form, carbs_grams: parseFloat(e.target.value) || 0 })}
              InputProps={{
                endAdornment: <InputAdornment position="end">g</InputAdornment>
              }}
            />
            <TextField
              fullWidth
              label="Fat"
              type="number"
              value={form.fat_grams || ''}
              onChange={(e) => onChange({ ...form, fat_grams: parseFloat(e.target.value) || 0 })}
              InputProps={{
                endAdornment: <InputAdornment position="end">g</InputAdornment>
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              fullWidth
              label="Fiber"
              type="number"
              value={form.fiber_grams || ''}
              onChange={(e) => onChange({ ...form, fiber_grams: parseFloat(e.target.value) || 0 })}
              InputProps={{
                endAdornment: <InputAdornment position="end">g</InputAdornment>
              }}
            />
            <TextField
              fullWidth
              label="Sugar"
              type="number"
              value={form.sugar_grams || ''}
              onChange={(e) => onChange({ ...form, sugar_grams: parseFloat(e.target.value) || 0 })}
              InputProps={{
                endAdornment: <InputAdornment position="end">g</InputAdornment>
              }}
            />
            <TextField
              fullWidth
              label="Sodium"
              type="number"
              value={form.sodium_mg || ''}
              onChange={(e) => onChange({ ...form, sodium_mg: parseFloat(e.target.value) || 0 })}
              InputProps={{
                endAdornment: <InputAdornment position="end">mg</InputAdornment>
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="Serving Size"
              type="number"
              value={form.serving_size || ''}
              onChange={(e) => onChange({ ...form, serving_size: parseFloat(e.target.value) || 100 })}
            />
            <FormControl fullWidth>
              <InputLabel>Unit</InputLabel>
              <Select
                value={form.serving_unit || 'g'}
                onChange={(e) => onChange({ ...form, serving_unit: e.target.value })}
                label="Unit"
              >
                <MenuItem value="g">grams (g)</MenuItem>
                <MenuItem value="ml">milliliters (ml)</MenuItem>
                <MenuItem value="oz">ounces (oz)</MenuItem>
                <MenuItem value="cup">cups</MenuItem>
                <MenuItem value="tbsp">tablespoons</MenuItem>
                <MenuItem value="tsp">teaspoons</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onSave}
          variant="contained"
          disabled={loading}
        >
          {loading ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FoodEditDialog;
