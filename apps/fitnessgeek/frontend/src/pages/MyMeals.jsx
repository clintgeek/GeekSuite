import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Button,
  CircularProgress,
  Alert
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { fitnessGeekService } from '../services/fitnessGeekService.js';
import EditMealDialog from '../components/Meals/EditMealDialog.jsx';

const MyMeals = () => {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editingMeal, setEditingMeal] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMeals();
  }, []);

  const loadMeals = async () => {
    setLoading(true);
    try {
      const data = await fitnessGeekService.getMeals();
      setMeals(data || []);
    } catch (e) {
      setError('Failed to load meals');
    } finally {
      setLoading(false);
    }
  };

  const filtered = meals.filter((m) => !query || m.name.toLowerCase().includes(query.toLowerCase()));

  const handleEdit = (meal) => {
    setEditingMeal(meal);
    setEditOpen(true);
  };

  const handleDelete = async (meal) => {
    if (!window.confirm(`Delete meal "${meal.name}"?`)) return;
    try {
      await fitnessGeekService.deleteMeal(meal._id);
      await loadMeals();
    } catch (e) {
      setError('Failed to delete meal');
    }
  };

  const handleSave = async (payload) => {
    if (!editingMeal) return;
    try {
      setSaving(true);
      await fitnessGeekService.updateMeal(editingMeal._id, payload);
      setEditOpen(false);
      setEditingMeal(null);
      await loadMeals();
    } catch (e) {
      setError('Failed to save meal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>My Meals</Typography>
        <Typography variant="body2" color="text.secondary">Save and reuse full meals.</Typography>
      </Box>

      <Box sx={{ mb: 2 }}>
        <TextField placeholder="Search meals..." value={query} onChange={(e) => setQuery(e.target.value)} fullWidth />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Card>
          <CardContent>
            <Typography variant="subtitle2" sx={{ mb: 1, color: '#666' }}>Saved Meals ({filtered.length})</Typography>
            <List sx={{ p: 0 }}>
              {filtered.map((m) => (
                <ListItem key={m._id} secondaryAction={
                  <Box>
                    <IconButton onClick={() => handleEdit(m)}><EditIcon /></IconButton>
                    <IconButton color="error" onClick={() => handleDelete(m)}><DeleteIcon /></IconButton>
                  </Box>
                }>
                  <ListItemText
                    primary={<Typography variant="body1" sx={{ fontWeight: 500 }}>{m.name}</Typography>}
                    secondary={<Typography variant="caption" color="text.secondary">{m.meal_type} • {m.food_items?.length || 0} items</Typography>}
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      <EditMealDialog open={editOpen} onClose={() => setEditOpen(false)} meal={editingMeal} onSave={handleSave} loading={saving} />
    </Box>
  );
};

export default MyMeals;


