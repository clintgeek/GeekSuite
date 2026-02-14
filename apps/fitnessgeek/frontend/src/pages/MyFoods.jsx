import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  List,
  Alert,
  CircularProgress,
  TextField
} from '@mui/material';
import {
  Restaurant as FoodIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useFoodManagement } from '../hooks/useFoodManagement.js';
import FoodListItem from '../components/MyFoods/FoodListItem.jsx';
import FoodEditDialog from '../components/MyFoods/FoodEditDialog.jsx';
import FoodDeleteDialog from '../components/MyFoods/FoodDeleteDialog.jsx';

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

  const handleEditFood = (food) => {
    setEditingFood(food);
    setEditForm({
      name: food.name,
      brand: food.brand || '',
      calories_per_serving: food.nutrition.calories_per_serving,
      protein_grams: food.nutrition.protein_grams,
      carbs_grams: food.nutrition.carbs_grams,
      fat_grams: food.nutrition.fat_grams,
      fiber_grams: food.nutrition.fiber_grams || 0,
      sugar_grams: food.nutrition.sugar_grams || 0,
      sodium_mg: food.nutrition.sodium_mg || 0,
      serving_size: food.serving?.size || 100,
      serving_unit: food.serving?.unit || 'g'
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
    const success = await updateFood(editingFood._id, {
      name: editForm.name,
      brand: editForm.brand,
      nutrition: {
        calories_per_serving: editForm.calories_per_serving,
        protein_grams: editForm.protein_grams,
        carbs_grams: editForm.carbs_grams,
        fat_grams: editForm.fat_grams,
        fiber_grams: editForm.fiber_grams,
        sugar_grams: editForm.sugar_grams,
        sodium_mg: editForm.sodium_mg
      },
      serving: {
        size: editForm.serving_size,
        unit: editForm.serving_unit
      }
    });

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
    const success = await deleteFood(deletingFood._id);

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
      food.name.toLowerCase().includes(query) ||
      (food.brand && food.brand.toLowerCase().includes(query)) ||
      food.source.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600, mb: 0.5, color: 'text.primary' }}>
          My Foods
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your saved foods and custom entries
        </Typography>
      </Box>

      {/* Success/Error Messages */}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={clearSuccess}>
          {successMessage}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* Search */}
      <TextField
        fullWidth
        placeholder="Search your foods..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        InputProps={{
          startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
        }}
        sx={{
          mb: 2,
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#fafafa',
            border: '1px solid #e0e0e0',
            borderRadius: 1
          }
        }}
      />

      {/* Foods List */}
      <Card sx={{ width: '100%', backgroundColor: '#fafafa', border: '1px solid #e0e0e0' }}>
        <CardContent sx={{ p: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
            Saved Foods ({filteredFoods.length})
          </Typography>

          {filteredFoods.length > 0 ? (
            <List sx={{ p: 0 }}>
              {filteredFoods.map((food) => (
                <FoodListItem
                  key={food._id}
                  food={food}
                  onEdit={handleEditFood}
                  onDelete={handleDeleteFood}
                />
              ))}
            </List>
          ) : (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <FoodIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {searchQuery ? 'No foods match your search.' : 'No saved foods yet. Start by searching and adding foods!'}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

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