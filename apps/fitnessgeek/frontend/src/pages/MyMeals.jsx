import React, { useEffect, useState } from 'react';
import {
  Box,
  TextField,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Typography,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Restaurant as MealIcon,
} from '@mui/icons-material';
import { fitnessGeekService } from '../services/fitnessGeekService.js';
import EditMealDialog from '../components/Meals/EditMealDialog.jsx';
import {
  Surface,
  SectionLabel,
  DisplayHeading,
  EmptyState,
  SurfaceSkeleton,
} from '../components/primitives';

const MyMeals = () => {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editingMeal, setEditingMeal] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirmation state (replaces window.confirm)
  const [mealToDelete, setMealToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  const filtered = meals.filter(
    (m) => !query || m.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleEdit = (meal) => {
    setEditingMeal(meal);
    setEditOpen(true);
  };

  const requestDelete = (meal) => {
    setMealToDelete(meal);
  };

  const confirmDelete = async () => {
    if (!mealToDelete) return;
    try {
      setDeleting(true);
      await fitnessGeekService.deleteMeal(mealToDelete._id);
      await loadMeals();
      setMealToDelete(null);
    } catch (e) {
      setError('Failed to delete meal');
    } finally {
      setDeleting(false);
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

  const mealSummary = (m) => {
    const itemCount = m.food_items?.length || 0;
    const totalCals = (m.food_items || []).reduce((sum, it) => {
      const f = it.food_item_id || it.food_item || {};
      const c = f?.nutrition?.calories_per_serving || 0;
      return sum + c * (it.servings || 1);
    }, 0);
    return { itemCount, totalCals: Math.round(totalCals) };
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 900, mx: 'auto' }}>
      {/* Editorial header */}
      <Box sx={{ mb: 3 }}>
        <SectionLabel sx={{ mb: 0.75 }}>Library · Meals</SectionLabel>
        <DisplayHeading size="page">My Meals</DisplayHeading>
        <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
          Save your favorite combinations and reuse them in a single tap.
        </Typography>
      </Box>

      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="Search meals…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
          size="small"
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {loading ? (
        <SurfaceSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MealIcon}
          title={query ? 'Nothing matches that' : 'No meals saved yet'}
          copy={
            query
              ? 'Try a different search, or clear the filter to see everything.'
              : 'Save a meal from the Food Log when you log something worth remembering. It\'ll show up here, ready to reuse.'
          }
        />
      ) : (
        <Surface padded={false}>
          <Box
            sx={{
              px: 2.5,
              pt: 2,
              pb: 1.25,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: (theme) => `1px dashed ${theme.palette.divider}`,
            }}
          >
            <SectionLabel count={filtered.length}>Saved Meals</SectionLabel>
          </Box>
          <List sx={{ p: 0 }}>
            {filtered.map((m) => {
              const { itemCount, totalCals } = mealSummary(m);
              return (
                <ListItem
                  key={m._id}
                  sx={{
                    px: 2.5,
                    py: 1.5,
                    borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                    '&:last-child': { borderBottom: 'none' },
                  }}
                  secondaryAction={
                    <Box>
                      <IconButton
                        aria-label={`Edit ${m.name}`}
                        onClick={() => handleEdit(m)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        aria-label={`Delete ${m.name}`}
                        color="error"
                        onClick={() => requestDelete(m)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={
                      <Typography
                        sx={{ fontWeight: 600, fontSize: '1rem', color: 'text.primary' }}
                      >
                        {m.name}
                      </Typography>
                    }
                    secondary={
                      <Typography
                        component="span"
                        sx={{
                          fontSize: '0.8125rem',
                          color: 'text.secondary',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mt: 0.25,
                        }}
                      >
                        <Box
                          component="span"
                          sx={{ textTransform: 'capitalize' }}
                        >
                          {m.meal_type || 'meal'}
                        </Box>
                        <Box component="span" sx={{ opacity: 0.5 }}>·</Box>
                        <Box
                          component="span"
                          sx={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </Box>
                        {totalCals > 0 && (
                          <>
                            <Box component="span" sx={{ opacity: 0.5 }}>·</Box>
                            <Box
                              component="span"
                              sx={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {totalCals} kcal
                            </Box>
                          </>
                        )}
                      </Typography>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </Surface>
      )}

      <EditMealDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        meal={editingMeal}
        onSave={handleSave}
        loading={saving}
      />

      {/* Delete confirmation — replaces window.confirm */}
      <Dialog
        open={!!mealToDelete}
        onClose={() => !deleting && setMealToDelete(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontFamily: "'DM Serif Display', serif", fontWeight: 400 }}>
          Delete this meal?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{mealToDelete?.name}</strong> will be permanently removed from your
            saved meals library. This can't be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setMealToDelete(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={confirmDelete}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MyMeals;
