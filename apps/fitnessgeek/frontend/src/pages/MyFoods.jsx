import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  List,
  CircularProgress,
  TextField
} from '@mui/material';
import {
  Restaurant as FoodIcon,
  Search as SearchIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { useToast } from '@geeksuite/ui';
import { useFoodManagement } from '../hooks/useFoodManagement.js';
import FoodListItem from '../components/MyFoods/FoodListItem.jsx';
import FoodEditDialog from '../components/MyFoods/FoodEditDialog.jsx';
import RecipeBuilderDialog from '../components/MyFoods/RecipeBuilderDialog.jsx';
import { foodService } from '../services/foodService.js';
import { errorMessage } from '../utils/errorMessage.js';
import FoodDeleteDialog from '../components/MyFoods/FoodDeleteDialog.jsx';
import { Surface, SectionLabel, EmptyState, SurfaceSkeleton } from '../components/primitives';

const EMPTY_FOOD_FORM = {
  name: '',
  brand: '',
  calories_per_serving: '',
  protein_grams: '',
  carbs_grams: '',
  fat_grams: '',
  serving_size: 1,
  serving_unit: 'oz'
};

const MyFoods = () => {
  const {
    foods,
    loading,
    error,
    successMessage,
    loadFoods,
    updateFood,
    deleteFood,
    clearError,
    clearSuccess
  } = useFoodManagement();
  const { notify } = useToast();

  // successMessage/error come from useFoodManagement's own auto-clearing
  // state; forward each to the shared toast stack in place of the local
  // Alert pair, then clear the source so a re-render doesn't re-fire it.
  useEffect(() => {
    if (!successMessage) return;
    notify(successMessage, { tone: 'success' });
    clearSuccess();
  }, [successMessage, notify, clearSuccess]);

  useEffect(() => {
    if (!error) return;
    notify(error, { tone: 'error' });
    clearError();
  }, [error, notify, clearError]);

  const [searchQuery, setSearchQuery] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingFood, setEditingFood] = useState(null);
  const [deletingFood, setDeletingFood] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    loadFoods();
  }, []);

  // Recipe builder: open for a new recipe, or pre-filled for a saved one.
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderFood, setBuilderFood] = useState(null);
  // "New food": the same custom-food form the search page uses.
  const [createForm, setCreateForm] = useState(null);
  const [creating, setCreating] = useState(false);

  const openBuilder = (food = null) => {
    setBuilderFood(food);
    setBuilderOpen(true);
  };

  const handleCreateFood = async () => {
    if (!createForm?.name?.trim()) return;
    setCreating(true);
    try {
      await foodService.create({
        name: createForm.name.trim(),
        brand: createForm.brand?.trim() || undefined,
        nutrition: {
          calories_per_serving: Number(createForm.calories_per_serving) || 0,
          protein_grams: Number(createForm.protein_grams) || 0,
          carbs_grams: Number(createForm.carbs_grams) || 0,
          fat_grams: Number(createForm.fat_grams) || 0
        },
        serving: {
          size: Number(createForm.serving_size) || 1,
          unit: createForm.serving_unit || 'oz'
        }
      });
      notify(`Saved ${createForm.name.trim()}`, { tone: 'success' });
      setCreateForm(null);
      loadFoods();
    } catch (err) {
      notify(errorMessage(err, 'Couldn’t save that food. Try again.'), { tone: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleEditFood = (food) => {
    if (food.recipe) {
      openBuilder(food);
      return;
    }
    const nutrition = food.nutrition || {};
    setEditingFood(food);
    setEditForm({
      name: food.name,
      brand: food.brand || '',
      calories_per_serving: nutrition.calories_per_serving ?? 0,
      protein_grams: nutrition.protein_grams ?? 0,
      carbs_grams: nutrition.carbs_grams ?? 0,
      fat_grams: nutrition.fat_grams ?? 0,
      fiber_grams: nutrition.fiber_grams || 0,
      sugar_grams: nutrition.sugar_grams || 0,
      sodium_mg: nutrition.sodium_mg || 0,
      serving_size: food.serving_size || 100,
      serving_unit: food.serving_unit || 'g'
    });
    setEditDialogOpen(true);
  };

  const handleDeleteFood = (food) => {
    setDeletingFood(food);
    setDeleteDialogOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editingFood) return;

    setEditLoading(true);

    // Gateway shape: `id`, not `_id` — the GraphQL row never carries the
    // latter. Falling back to `_id` only guards a REST-shaped caller.
    const foodId = editingFood.id ?? editingFood._id;

    // `FitnessFoodInput` declares `name`/`serving_size`/`serving_unit` as
    // required, so those three always go out with their current-or-edited
    // value. Nutrition is the genuinely partial part: `updateFitnessFood`
    // merges it as dot paths for exactly the keys it receives (BURN_REVIEW
    // #19), so only the macros the dialog actually changed are included —
    // the rest are left alone instead of round-tripping today's value.
    const patch = {
      name: editForm.name,
      brand: editForm.brand,
      serving_size: editForm.serving_size,
      serving_unit: editForm.serving_unit
    };

    const currentNutrition = editingFood.nutrition || {};
    const nutritionKeys = [
      'calories_per_serving',
      'protein_grams',
      'carbs_grams',
      'fat_grams',
      'fiber_grams',
      'sugar_grams',
      'sodium_mg'
    ];
    const nutritionPatch = {};
    nutritionKeys.forEach((key) => {
      const before = currentNutrition[key] || 0;
      const after = editForm[key];
      if (after !== before) nutritionPatch[key] = after;
    });
    if (Object.keys(nutritionPatch).length) patch.nutrition = nutritionPatch;

    const success = await updateFood(foodId, patch);

    setEditLoading(false);
    if (success) {
      setEditDialogOpen(false);
      setEditingFood(null);
      setEditForm({});
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingFood) return;

    setDeleteLoading(true);
    // Gateway shape: `id`, not `_id` — see handleEditSubmit.
    const success = await deleteFood(deletingFood.id ?? deletingFood._id);

    setDeleteLoading(false);
    if (success) {
      setDeleteDialogOpen(false);
      setDeletingFood(null);
    }
  };

  const filteredFoods = foods.filter(food => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      // Every field optional-chained: `source` was never sent before
      // 2026-10-13, and `.toLowerCase()` on it crashed on the first keystroke.
      food.name?.toLowerCase().includes(query) ||
      food.brand?.toLowerCase().includes(query) ||
      food.source?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 900, mx: 'auto' }}>
        <Box sx={{ mb: 3 }}>
        </Box>
        <SurfaceSkeleton rows={5} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 900, mx: 'auto' }}>
      {/* Editorial header */}
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ color: 'text.secondary', fontSize: '1.0625rem' }}>
          Your custom entries and everything you’ve saved for quick access.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => openBuilder(null)}>
          New recipe
        </Button>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setCreateForm({ ...EMPTY_FOOD_FORM })}>
          New food
        </Button>
      </Box>

      {/* Search — theme-aware, no hardcoded colors */}
      <TextField
        fullWidth
        size="small"
        placeholder="Search your foods…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        InputProps={{
          startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
        }}
        sx={{ mb: 2 }}
      />

      {/* Foods list or empty state */}
      {filteredFoods.length === 0 ? (
        <EmptyState
          icon={FoodIcon}
          title={searchQuery ? 'Nothing matches that' : 'No foods yet'}
          copy={
            searchQuery
              ? 'Try a different word, or clear the search to see everything in your library.'
              : 'Foods you create, and foods you log often, show up here. + New food makes one now.'
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
            <SectionLabel count={filteredFoods.length}>Your foods</SectionLabel>
          </Box>
          <List sx={{ p: 0 }}>
            {filteredFoods.map((food) => (
              <FoodListItem
                key={food.id ?? food._id}
                food={food}
                onEdit={handleEditFood}
                onDelete={handleDeleteFood}
              />
            ))}
          </List>
        </Surface>
      )}

      {/* Edit Dialog */}
      <FoodEditDialog
        open={editDialogOpen}
        food={editingFood}
        form={editForm}
        onChange={setEditForm}
        onClose={() => setEditDialogOpen(false)}
        onSave={handleEditSubmit}
        loading={editLoading}
      />

      {/* Recipe builder (new, or editing a recipe row) */}
      <RecipeBuilderDialog
        open={builderOpen}
        food={builderFood}
        onClose={() => setBuilderOpen(false)}
        onSaved={() => loadFoods()}
      />

      {/* New food */}
      <FoodEditDialog
        open={Boolean(createForm)}
        food={null}
        form={createForm || EMPTY_FOOD_FORM}
        onChange={setCreateForm}
        onClose={() => setCreateForm(null)}
        onSave={handleCreateFood}
        loading={creating}
      />

      {/* Delete Dialog */}
      <FoodDeleteDialog
        open={deleteDialogOpen}
        food={deletingFood}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
      />
    </Box>
  );
};

export default MyFoods;