import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  Typography,
  List,
  TextField
} from '@mui/material';
import {
  Restaurant as FoodIcon,
  Search as SearchIcon,
  Add as AddIcon,
  CloudOff as FailedIcon
} from '@mui/icons-material';
import { useToast } from '@geeksuite/ui';
import { useFoodManagement } from '../hooks/useFoodManagement.js';
import FoodListItem from '../components/MyFoods/FoodListItem.jsx';
import FoodEditDialog from '../components/MyFoods/FoodEditDialog.jsx';
import RecipeBuilderDialog from '../components/MyFoods/RecipeBuilderDialog.jsx';
import Shell from './embeddedShell.jsx';
import { foodService } from '../services/foodService.js';
import { errorMessage } from '../utils/errorMessage.js';
import FoodDeleteDialog from '../components/MyFoods/FoodDeleteDialog.jsx';
import { EMPTY_FOOD_FORM, foodPayloadFromForm } from '../components/MyFoods/foodForm.js';
import { Surface, EmptyState, SurfaceSkeleton } from '../components/primitives';

const MyFoods = ({ embedded = false }) => {
  const {
    foods: loadedFoods,
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

  // One null in the list (or a list that isn't one) used to take the whole
  // page to the error boundary. Only real rows are drawn.
  const foods = useMemo(
    () => (Array.isArray(loadedFoods) ? loadedFoods : []).filter((f) => f && typeof f === 'object'),
    [loadedFoods]
  );

  // A FAILED READ IS NOT AN EMPTY LIBRARY. The hook reports a failure as a
  // message and leaves the list as it was, so a first load that failed drew
  // "No foods yet" under an error toast. With nothing loaded, an error can
  // only be the read: say so on the page, with a way to try again.
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    if (!error) return;
    if (foods.length === 0) setLoadFailed(true);
    notify(error, { tone: 'error' });
    clearError();
  }, [error, notify, clearError, foods.length]);
  useEffect(() => { if (foods.length > 0) setLoadFailed(false); }, [foods.length]);
  const retryLoad = () => {
    setLoadFailed(false);
    loadFoods();
  };

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
    // `creating` is checked as well as the button's disabled state: two taps
    // can land before the first re-render, and each would save a copy.
    if (creating || !createForm?.name?.trim()) return;
    setCreating(true);
    try {
      const payload = foodPayloadFromForm(createForm);
      await foodService.create(payload);
      notify(`Saved ${payload.name}`, { tone: 'success' });
      setCreateForm(null);
      loadFoods();
    } catch (err) {
      notify(errorMessage(err, 'Couldn’t save that food. Try again.'), { tone: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleEditFood = (food) => {
    if (!food) return;
    if (food.recipe) {
      openBuilder(food);
      return;
    }
    const nutrition = food.nutrition || {};
    setEditingFood(food);
    setEditForm({
      name: food.name || '',
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
    if (!editingFood || editLoading) return;

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
    if (!deletingFood || deleteLoading) return;

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

  const searching = Boolean(searchQuery);
  const count = filteredFoods.length;

  return (
    <Shell embedded={embedded}>
      {/* The intro and the two ways to make something, on one row from sm
          up. No card title: the tab already says "Foods". */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 4, rowGap: 3 }}>
        <Typography sx={{ color: 'text.secondary', fontSize: '1rem', flex: '1 1 240px', minWidth: 0 }}>
          Foods you made, and foods you’ve logged.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {/* One filled blue button per view: New food. New recipe is tonal. */}
          <Button variant="tonal" startIcon={<AddIcon />} onClick={() => openBuilder(null)} sx={{ minHeight: 44 }}>
            New recipe
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateForm({ ...EMPTY_FOOD_FORM })} sx={{ minHeight: 44 }}>
            New food
          </Button>
        </Box>
      </Box>

      {/* Search: only when there is something to search. */}
      {foods.length > 0 && (
        <TextField
          fullWidth
          size="small"
          placeholder="Search your foods…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          inputProps={{ 'aria-label': 'Search your foods' }}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
          }}
        />
      )}

      {/* Failed, empty, or the list. */}
      {/* The skeleton stands in for the list only, and only on a first
          load: the whole page used to be swapped for it on every re-read,
          which unmounted the open dialog in the middle of its own save. */}
      {loading && foods.length === 0 ? (
        <SurfaceSkeleton rows={5} />
      ) : loadFailed && foods.length === 0 ? (
        <EmptyState
          icon={FailedIcon}
          title="Couldn’t load your foods"
          copy="Nothing is lost. Check your connection and try again."
          action={<Button variant="contained" onClick={retryLoad}>Try again</Button>}
          data-testid="my-foods-failed"
        />
      ) : count === 0 ? (
        <EmptyState
          icon={FoodIcon}
          title={searching ? 'Nothing matches that' : 'No foods yet'}
          copy={
            searching
              ? 'Try a different word, or clear the search to see everything in your library.'
              : 'Foods you create, and foods you log often, show up here. + New food makes one now.'
          }
          action={searching ? <Button variant="tonal" onClick={() => setSearchQuery('')}>Clear search</Button> : undefined}
        />
      ) : (
        <Box>
          <Typography
            role="status"
            sx={{ fontSize: '0.875rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums', mb: 2, px: 1 }}
          >
            {searching
              ? `${count} of ${foods.length} ${foods.length === 1 ? 'food' : 'foods'}`
              : `${count} ${count === 1 ? 'food' : 'foods'}`}
          </Typography>
          <Surface sx={{ py: { xs: 1, sm: 2 } }}>
            <List sx={{ p: 0 }} aria-label="Your foods">
              {filteredFoods.map((food, index) => (
                <FoodListItem
                  key={food.id ?? food._id ?? `row-${index}`}
                  food={food}
                  onEdit={handleEditFood}
                  onDelete={handleDeleteFood}
                />
              ))}
            </List>
          </Surface>
        </Box>
      )}

      {/* Edit Dialog */}
      <FoodEditDialog
        open={editDialogOpen}
        food={editingFood}
        form={editForm}
        onChange={setEditForm}
        onClose={() => { if (!editLoading) setEditDialogOpen(false); }}
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
        onClose={() => { if (!creating) setCreateForm(null); }}
        onSave={handleCreateFood}
        loading={creating}
      />

      {/* Delete Dialog */}
      <FoodDeleteDialog
        open={deleteDialogOpen}
        food={deletingFood}
        onClose={() => { if (!deleteLoading) setDeleteDialogOpen(false); }}
        onConfirm={handleDeleteConfirm}
        loading={deleteLoading}
      />
    </Shell>
  );
};

export default MyFoods;