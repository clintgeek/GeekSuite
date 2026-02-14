import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Typography,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider
} from '@mui/material';
import {
  Search as SearchIcon,
  Close as CloseIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { fitnessGeekService } from '../../services/fitnessGeekService';
import BarcodeScanner from '../BarcodeScanner/BarcodeScanner.jsx';

const getSourceName = (source) => {
  switch (source?.toLowerCase()) {
    case 'usda':
      return 'USDA';
    case 'nutritionix':
      return 'Nutritionix';
    case 'openfoodfacts':
      return 'Open Food Facts';
    case 'custom':
      return 'My Foods';
    case 'meal':
      return 'Saved Meal';
    default:
      return source || 'Unknown';
  }
};

const FoodSearch = ({
  onFoodSelect,
  placeholder = "Search for foods...",
  showRecent = true,
  maxResults = 25,
  autoSearch = true,
  disableDialog = false,
  className
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [recentFoods, setRecentFoods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);
  const [servings, setServings] = useState(1);
  const [nutrition, setNutrition] = useState({
    calories_per_serving: 0,
    protein_grams: 0,
    carbs_grams: 0,
    fat_grams: 0
  });

  // Debounced search effect
  useEffect(() => {
    if (!autoSearch || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      searchFoods();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, autoSearch]);

  // Load recent foods on mount
  useEffect(() => {
    if (showRecent) {
      loadRecentFoods();
    }
  }, [showRecent]);

  const searchFoods = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [foods, meals] = await Promise.all([
        fitnessGeekService.searchFoods(searchQuery, maxResults),
        fitnessGeekService.getMeals(null, searchQuery)
      ]);

      const mappedMeals = (meals || []).map((m) => {
        const totalCals = (m.food_items || []).reduce((sum, it) => {
          const f = it.food_item_id || it.food_item || {};
          const c = f?.nutrition?.calories_per_serving || 0;
          return sum + (c * (it.servings || 1));
        }, 0);
        return {
          _id: m._id,
          name: m.name,
          source: 'meal',
          type: 'meal',
          nutrition: { calories_per_serving: Math.round(totalCals) }
        };
      });

      // Show saved meals first
      setSearchResults([...(mappedMeals || []), ...(foods || [])]);
    } catch (err) {
      setError(err.message);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRecentFoods = async () => {
    try {
      const recent = await fitnessGeekService.getRecentLogs();
      if (recent && recent.length > 0) {
        // Get unique foods from recent logs
        const uniqueFoods = recent.reduce((acc, log) => {
          const food = log.food_item || log.food_item_id;
          if (food && !acc.find(f => f.id === food.id)) {
            acc.push(food);
          }
          return acc;
        }, []);
        setRecentFoods(uniqueFoods.slice(0, 10));
      }
    } catch (err) {
      console.error('Failed to load recent foods:', err);
    }
  };

  const handleFoodClick = (food) => {
    if (disableDialog) {
      onFoodSelect(food);
    } else {
      setSelectedFood(food);
      setServings(1);
      setNutrition(food.nutrition || {
        calories_per_serving: 0,
        protein_grams: 0,
        carbs_grams: 0,
        fat_grams: 0
      });
    }
  };

  const handleAddFood = () => {
    if (!selectedFood) return;

    const foodWithServings = {
      ...selectedFood,
      servings: servings,
      nutrition: nutrition
    };
    onFoodSelect(foodWithServings);
    setSelectedFood(null);
    setServings(1);
    setNutrition({
      calories_per_serving: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0
    });
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    searchFoods();
  };

  const renderFoodItem = (food) => {
    return (
        <ListItem
        key={food._id || food.id}
        onClick={() => handleFoodClick(food)}
        sx={{
          cursor: 'pointer',
          '&:hover': {
            backgroundColor: '#f5f5f5'
          },
          borderBottom: '1px solid #f0f0f0',
          '&:last-child': {
            borderBottom: 'none'
          }
        }}
          component="div"
      >
        <ListItemText
          primary={
            <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box sx={{ flex: 1 }}>
                <Box component="span" sx={{ fontWeight: 500, fontSize: '1rem' }}>
                  {food.name}
                </Box>
                {food.brand && (
                <Box component="span" sx={{ color: '#666', fontSize: '0.875rem' }}>
                    {food.brand}
                </Box>
                )}
              </Box>
              <Box sx={{ textAlign: 'right', ml: 2 }}>
                <Box component="span" sx={{ color: '#4caf50', fontWeight: 600, fontSize: '0.875rem' }}>
                  {Math.round(food.nutrition?.calories_per_serving || 0)} cal
                </Box>
                <Box component="span" sx={{ color: '#666', fontSize: '0.75rem', display: 'block' }}>
                  {getSourceName(food.source)}
                </Box>
              </Box>
            </Box>
          }
          secondary={
            <Box component="span" sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
              <Box component="span" sx={{ color: '#666', fontSize: '0.875rem' }}>
                P: {food.nutrition?.protein_grams || 0}g
              </Box>
              <Box component="span" sx={{ color: '#666', fontSize: '0.875rem' }}>
                C: {food.nutrition?.carbs_grams || 0}g
              </Box>
              <Box component="span" sx={{ color: '#666', fontSize: '0.875rem' }}>
                F: {food.nutrition?.fat_grams || 0}g
              </Box>
            </Box>
          }
        />
      </ListItem>
    );
  };

  return (
    <Box className={className}>
      {/* Search Input */}
      <Box component="form" onSubmit={handleSearchSubmit} sx={{ mb: 2 }}>
        <TextField
          fullWidth
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: '#666' }} />,
            endAdornment: loading && (
              <CircularProgress size={20} sx={{ mr: 2 }} />
            )
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              backgroundColor: '#fff'
            }
          }}
        />
      </Box>

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Search Results */}
      {searchQuery.length >= 2 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, color: '#666' }}>
            Search Results
          </Typography>
          <List sx={{ p: 0, bgcolor: '#fff', borderRadius: 2, border: '1px solid #e0e0e0' }} component="div">
            {searchResults.length > 0 ? (
              searchResults.map(renderFoodItem)
            ) : (
              <ListItem sx={{ py: 3, textAlign: 'center' }} component="div">
                <ListItemText
                  primary={<Box component="span" sx={{ color: '#666', fontSize: '0.875rem' }}>No foods found</Box>}
                />
              </ListItem>
            )}
          </List>
        </Box>
      )}

      {/* Recent Foods */}
      {showRecent && recentFoods.length > 0 && searchQuery.length < 2 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1, color: '#666' }}>
            Recent Foods
          </Typography>
          <List sx={{ p: 0, bgcolor: '#fff', borderRadius: 2, border: '1px solid #e0e0e0' }} component="div">
            {recentFoods.map(renderFoodItem)}
          </List>
        </Box>
      )}

      {/* Simple Add Food Dialog */}
      {!disableDialog && (
        <Dialog
          open={!!selectedFood}
          onClose={() => setSelectedFood(null)}
          maxWidth="xs"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: { xs: 0, sm: 2 },
              margin: { xs: 0, sm: 2 },
              maxHeight: { xs: '100vh', sm: '90vh' },
              width: { xs: '100%', sm: 'auto' }
            }
          }}
        >
          <DialogTitle sx={{ pb: 2, px: { xs: 3, sm: 4 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Add Food
              </Typography>
              <IconButton
                onClick={() => setSelectedFood(null)}
                size="small"
              >
                <CloseIcon />
              </IconButton>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ px: { xs: 3, sm: 4 } }}>
            {selectedFood && (
              <Box sx={{ p: 2 }}>
                {/* Selected Food Display */}
                <Box sx={{ mb: 3, p: 2, bgcolor: '#f8f9fa', borderRadius: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    {selectedFood.name}
                  </Typography>
                  {selectedFood.brand && (
                    <Typography variant="body2" sx={{ color: '#666', mb: 1 }}>
                      {selectedFood.brand}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: '#666' }}>
                      {Math.round(nutrition.calories_per_serving)} cal
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#666' }}>
                      P: {nutrition.protein_grams}g
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#666' }}>
                      C: {nutrition.carbs_grams}g
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#666' }}>
                      F: {nutrition.fat_grams}g
                    </Typography>
                  </Box>
                </Box>

                {/* Servings Slider */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="body1" sx={{ fontWeight: 600, mb: 2 }}>
                    Servings: {servings}
                  </Typography>
                  <Slider
                    value={servings}
                    onChange={(e, newValue) => setServings(newValue)}
                    min={0.25}
                    max={10}
                    step={0.25}
                    marks={[
                      { value: 0.25, label: '0.25' },
                      { value: 1, label: '1' },
                      { value: 2, label: '2' },
                      { value: 5, label: '5' },
                      { value: 10, label: '10' }
                    ]}
                    sx={{
                      '& .MuiSlider-markLabel': {
                        fontSize: '0.75rem'
                      }
                    }}
                  />
                </Box>

                {/* Total Preview */}
                <Box sx={{ p: 2, bgcolor: '#f8f9fa', borderRadius: 2 }}>
                  <Typography variant="body1" sx={{ fontWeight: 600, mb: 1 }}>
                    Total ({servings} serving{servings !== 1 ? 's' : ''}):
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600, color: '#4caf50' }}>
                      {Math.round(nutrition.calories_per_serving * servings)} cal
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#666' }}>
                      P: {Math.round(nutrition.protein_grams * servings * 10) / 10}g
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#666' }}>
                      C: {Math.round(nutrition.carbs_grams * servings * 10) / 10}g
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#666' }}>
                      F: {Math.round(nutrition.fat_grams * servings * 10) / 10}g
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{
            px: { xs: 3, sm: 4 },
            pb: { xs: 3, sm: 4 },
            gap: 2,
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: 'stretch'
          }}>
            <Button
              onClick={() => setSelectedFood(null)}
              variant="text"
              size="large"
              sx={{ color: '#666' }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddFood}
              variant="contained"
              startIcon={<AddIcon />}
              size="large"
              sx={{
                bgcolor: '#4caf50',
                '&:hover': {
                  bgcolor: '#45a049'
                }
              }}
            >
              Add Food
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Barcode Scanner Dialog */}
      <BarcodeScanner
        open={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onBarcodeScanned={(food) => {
          handleFoodClick(food);
          setShowBarcodeScanner(false);
        }}
      />
    </Box>
  );
};

export default FoodSearch;