import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Avatar,
  Typography,
  Box,
  TextField,
  Slider,
  Tabs,
  Tab,
  InputAdornment,
  Grid,
  MenuItem,
  IconButton
} from '@mui/material';
import {
  Add as AddIcon,
  Restaurant as FoodIcon,
  QrCodeScanner as BarcodeIcon,
  Edit as EditIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { UnifiedFoodSearch } from '../FoodSearch';
import { fitnessGeekService } from '../../services/fitnessGeekService.js';
import BarcodeScanner from '../BarcodeScanner/BarcodeScanner.jsx';

const AddFoodDialog = ({
  open,
  onClose,
  onFoodSelect,   // Legacy single-item callback (still used by Barcode / Custom tabs)
  onCommitBatch,  // New: batch commit for Search tab's staging tray
  mealType,
  showBarcodeScanner,
  onShowBarcodeScanner,
  mode = 'standard',
  netCarbLimit = 20,
}) => {
  const theme = useTheme();
  const primaryGradient = `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`;
  const subtleSurface = alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.08);
  const mutedText = theme.palette.text.secondary;
  const successColor = theme.palette.success.main;
  const [selectedFood, setSelectedFood] = useState(null);
  const [servings, setServings] = useState(1);
  const [nutrition, setNutrition] = useState({
    calories_per_serving: 0,
    protein_grams: 0,
    carbs_grams: 0,
    fat_grams: 0
  });
  // Default to Search tab
  const [activeTab, setActiveTab] = useState(0);

  // Custom food state
  const [customFood, setCustomFood] = useState({
    name: '',
    brand: '',
    barcode: '',
    serving: { size: 100, unit: 'g' },
    nutrition: {
      calories_per_serving: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0,
      fiber_grams: 0,
      sugar_grams: 0,
      sodium_mg: 0
    }
  });
  const [customServings, setCustomServings] = useState(1);

  const handleFoodSelect = (food) => {
    setSelectedFood(food);
    setServings(1);
    setNutrition(food.nutrition || {
      calories_per_serving: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0
    });
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

  const handleClose = () => {
    setSelectedFood(null);
    setServings(1);
    setNutrition({
      calories_per_serving: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0
    });
    setActiveTab(0);
    onClose();
  };

  const setNutritionField = (field, value) => {
    const num = parseFloat(value);
    setNutrition((prev) => ({
      ...prev,
      [field]: Number.isFinite(num) ? num : 0
    }));
  };

  const setCustomField = (field, value) => {
    setCustomFood((prev) => ({ ...prev, [field]: value }));
  };

  const setCustomNutritionField = (field, value) => {
    const num = parseFloat(value);
    setCustomFood((prev) => ({
      ...prev,
      nutrition: {
        ...prev.nutrition,
        [field]: Number.isFinite(num) ? num : 0
      }
    }));
  };

  const setCustomServingField = (field, value) => {
    const numMaybe = parseFloat(value);
    setCustomFood((prev) => ({
      ...prev,
      serving: {
        ...prev.serving,
        [field]: field === 'size' ? (Number.isFinite(numMaybe) ? numMaybe : 0) : value
      }
    }));
  };

  const handleCreateCustomAndAdd = async () => {
    try {
      if (!customFood.name || (customFood.nutrition.calories_per_serving || 0) <= 0) return;
      const payload = {
        name: customFood.name.trim(),
        brand: customFood.brand.trim() || undefined,
        barcode: customFood.barcode.trim() || undefined,
        nutrition: customFood.nutrition,
        serving: customFood.serving,
        source: 'custom'
      };
      const resp = await fitnessGeekService.createCustomFood(payload);
      const created = resp?.data || resp;
      if (created) {
        onFoodSelect({
          ...(created.data || created),
          nutrition: customFood.nutrition,
          servings: customServings
        });
      }
    } catch (e) {
      console.error('Failed to create custom food', e);
    }
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    setSelectedFood(null);
    setServings(1);
    setNutrition({
      calories_per_serving: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0
    });
  };

  const handleBarcodeTabClick = () => {
    onShowBarcodeScanner(true);
  };

  // Note: Do not auto-open scanner on dialog open; launch only on explicit user click

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: { xs: 0, sm: 3 },
            margin: { xs: 0, sm: 2 },
            maxHeight: { xs: '100vh', sm: '90vh' },
            width: { xs: '100%', sm: 'auto' }
          }
        }}
      >
        <DialogTitle sx={{
          pb: 2,
          px: { xs: 3, sm: 4 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{
              background: primaryGradient,
              width: 40,
              height: 40
            }}>
              <FoodIcon />
            </Avatar>
            <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
              Add Food to {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
            </Typography>
          </Box>
          <IconButton
            onClick={handleClose}
            size="small"
            sx={{
              color: mutedText,
              '&:hover': {
                backgroundColor: alpha(mutedText, 0.15),
                color: theme.palette.text.primary
              }
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ px: { xs: 2, sm: 4 } }}>
          {/* Tabs - Simplified: Search (with AI), Barcode, Custom */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              sx={{ minHeight: 48 }}
              variant="fullWidth"
            >
              <Tab
                label={<Box sx={{ display: { xs: 'none', sm: 'block' } }}>Search</Box>}
                icon={<FoodIcon />}
                iconPosition="start"
                sx={{ minHeight: 48, minWidth: { xs: 'auto', sm: 90 } }}
                aria-label="Search"
              />
              <Tab
                label={<Box sx={{ display: { xs: 'none', sm: 'block' } }}>Barcode</Box>}
                icon={<BarcodeIcon />}
                iconPosition="start"
                sx={{ minHeight: 48, minWidth: { xs: 'auto', sm: 90 } }}
                aria-label="Barcode"
                onClick={() => {
                  handleBarcodeTabClick();
                }}
              />
              <Tab
                label={<Box sx={{ display: { xs: 'none', sm: 'block' } }}>Custom</Box>}
                icon={<EditIcon />}
                iconPosition="start"
                sx={{ minHeight: 48, minWidth: { xs: 'auto', sm: 90 } }}
                aria-label="Custom"
              />
            </Tabs>
          </Box>

          {/* Tab Content — Search uses the staging tray model */}
          {activeTab === 0 && (
            <Box sx={{ minHeight: 400 }}>
              <UnifiedFoodSearch
                mode="dialog"
                defaultMealType={mealType}
                showRecent={true}
                showBarcode={false}
                onCommitBatch={async (items) => {
                  const result = await onCommitBatch?.(items);
                  // On full success, close the dialog
                  if (result && result.fail === 0) {
                    handleClose();
                  }
                  return result;
                }}
                placeholder="Search foods or describe your meal…"
                maxResults={25}
                ketoMode={mode === 'keto'}
                netCarbLimit={netCarbLimit}
              />
            </Box>
          )}

          {activeTab === 2 && (
            <Box sx={{ mt: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={8}>
                  <TextField
                    label="Food Name"
                    value={customFood.name}
                    onChange={(e) => setCustomField('name', e.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Brand (optional)"
                    value={customFood.brand}
                    onChange={(e) => setCustomField('brand', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Barcode (optional)"
                    value={customFood.barcode}
                    onChange={(e) => setCustomField('barcode', e.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    label="Serving Size"
                    type="number"
                    value={customFood.serving.size}
                    onChange={(e) => setCustomServingField('size', e.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    label="Unit"
                    select
                    value={customFood.serving.unit}
                    onChange={(e) => setCustomServingField('unit', e.target.value)}
                    fullWidth
                  >
                    {['g','ml','oz','cup','tbsp','tsp','piece'].map((u) => (
                      <MenuItem key={u} value={u}>{u}</MenuItem>
                    ))}
                  </TextField>
                </Grid>

                {/* Nutrition Grid */}
                <Grid item xs={6} sm={3}>
                  <TextField
                    label="Calories"
                    type="number"
                    value={customFood.nutrition.calories_per_serving}
                    onChange={(e) => setCustomNutritionField('calories_per_serving', e.target.value)}
                    fullWidth
                    InputProps={{ endAdornment: <InputAdornment position="end">kcal</InputAdornment> }}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    label="Protein"
                    type="number"
                    value={customFood.nutrition.protein_grams}
                    onChange={(e) => setCustomNutritionField('protein_grams', e.target.value)}
                    fullWidth
                    InputProps={{ endAdornment: <InputAdornment position="end">g</InputAdornment> }}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    label="Carbs"
                    type="number"
                    value={customFood.nutrition.carbs_grams}
                    onChange={(e) => setCustomNutritionField('carbs_grams', e.target.value)}
                    fullWidth
                    InputProps={{ endAdornment: <InputAdornment position="end">g</InputAdornment> }}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    label="Fat"
                    type="number"
                    value={customFood.nutrition.fat_grams}
                    onChange={(e) => setCustomNutritionField('fat_grams', e.target.value)}
                    fullWidth
                    InputProps={{ endAdornment: <InputAdornment position="end">g</InputAdornment> }}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    label="Fiber"
                    type="number"
                    value={customFood.nutrition.fiber_grams}
                    onChange={(e) => setCustomNutritionField('fiber_grams', e.target.value)}
                    fullWidth
                    InputProps={{ endAdornment: <InputAdornment position="end">g</InputAdornment> }}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    label="Sugar"
                    type="number"
                    value={customFood.nutrition.sugar_grams}
                    onChange={(e) => setCustomNutritionField('sugar_grams', e.target.value)}
                    fullWidth
                    InputProps={{ endAdornment: <InputAdornment position="end">g</InputAdornment> }}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    label="Sodium"
                    type="number"
                    value={customFood.nutrition.sodium_mg}
                    onChange={(e) => setCustomNutritionField('sodium_mg', e.target.value)}
                    fullWidth
                    InputProps={{ endAdornment: <InputAdornment position="end">mg</InputAdornment> }}
                  />
                </Grid>

                {/* Servings picker and preview */}
                <Grid item xs={12}>
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                      Servings: {customServings}
                    </Typography>
                    <Slider
                      value={customServings}
                      onChange={(e, v) => setCustomServings(v)}
                      min={0.25}
                      max={10}
                      step={0.25}
                    />
                  </Box>
                </Grid>
              </Grid>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 1 }}>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleCreateCustomAndAdd}
                  disabled={!customFood.name || (customFood.nutrition.calories_per_serving || 0) <= 0}
                  sx={{
                    bgcolor: successColor,
                    '&:hover': { bgcolor: alpha(successColor, 0.85) }
                  }}
                >
                  Add Food
                </Button>
              </Box>
            </Box>
          )}

          {activeTab === 1 && (
            <>
              {!selectedFood ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Box
                    onClick={() => onShowBarcodeScanner(true)}
                    sx={{ cursor: 'pointer', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}
                    aria-label="Open barcode scanner"
                    role="button"
                  >
                    <BarcodeIcon sx={{ fontSize: 64, color: theme.palette.primary.main, mb: 2 }} />
                    <Typography variant="h6" sx={{ mb: 1 }} onClick={() => onShowBarcodeScanner(true)}>
                      Barcode Scanner
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ color: mutedText, mb: 3 }}>
                    Click the icon or title to open the scanner. You can use the floating keyboard icon in the scanner to enter a barcode manually.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ p: 2 }}>
                  {/* Selected Food Display (same as Search) */}
                  <Box sx={{ mb: 3, p: 2, bgcolor: subtleSurface, borderRadius: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                      {selectedFood.name}
                    </Typography>
                    {selectedFood.brand && (
                      <Typography variant="body2" sx={{ color: mutedText, mb: 1 }}>
                        {selectedFood.brand}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      <TextField
                        label="Calories"
                        type="number"
                        size="small"
                        value={nutrition.calories_per_serving}
                        onChange={(e) => setNutritionField('calories_per_serving', e.target.value)}
                        sx={{ width: 120 }}
                      />
                      <TextField
                        label="Protein (g)"
                        type="number"
                        size="small"
                        value={nutrition.protein_grams}
                        onChange={(e) => setNutritionField('protein_grams', e.target.value)}
                        sx={{ width: 140 }}
                      />
                      <TextField
                        label="Carbs (g)"
                        type="number"
                        size="small"
                        value={nutrition.carbs_grams}
                        onChange={(e) => setNutritionField('carbs_grams', e.target.value)}
                        sx={{ width: 130 }}
                      />
                      <TextField
                        label="Fat (g)"
                        type="number"
                        size="small"
                        value={nutrition.fat_grams}
                        onChange={(e) => setNutritionField('fat_grams', e.target.value)}
                        sx={{ width: 120 }}
                      />
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
                      marks={[{ value: 0.25, label: '0.25' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 5, label: '5' }, { value: 10, label: '10' }]}
                      sx={{ '& .MuiSlider-markLabel': { fontSize: '0.75rem' } }}
                    />
                  </Box>
                  {/* Total Preview */}
                  <Box sx={{ p: 2, bgcolor: subtleSurface, borderRadius: 2 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600, mb: 1 }}>
                      Total ({servings} serving{servings !== 1 ? 's' : ''}):
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Typography variant="body1" sx={{ fontWeight: 600, color: successColor }}>
                        {Math.round(nutrition.calories_per_serving * servings)} cal
                      </Typography>
                      <Typography variant="body2" sx={{ color: mutedText }}>
                        P: {Math.round(nutrition.protein_grams * servings * 10) / 10}g
                      </Typography>
                      <Typography variant="body2" sx={{ color: mutedText }}>
                        C: {Math.round(nutrition.carbs_grams * servings * 10) / 10}g
                      </Typography>
                      <Typography variant="body2" sx={{ color: mutedText }}>
                        F: {Math.round(nutrition.fat_grams * servings * 10) / 10}g
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions sx={{
          px: { xs: 3, sm: 4 },
          pb: { xs: 3, sm: 4 },
          gap: 2,
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: 'stretch'
        }}>
          {(activeTab === 1 || activeTab === 2) && selectedFood && (
            <Button
              onClick={() => setSelectedFood(null)}
              variant="text"
              size="large"
              sx={{ color: mutedText }}
            >
              Clear Selection
            </Button>
          )}
          {(activeTab === 1 || activeTab === 2) && selectedFood && (
            <Button
              onClick={handleAddFood}
              variant="contained"
              startIcon={<AddIcon />}
              size="large"
              sx={{
                bgcolor: successColor,
                '&:hover': {
                  bgcolor: alpha(successColor, 0.85)
                }
              }}
            >
              Add Food
            </Button>
          )}
          <Button
            onClick={handleClose}
            variant="text"
            size="large"
            sx={{ color: mutedText }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Barcode Scanner Dialog */}
      <BarcodeScanner
        open={showBarcodeScanner}
        onClose={() => onShowBarcodeScanner(false)}
        onBarcodeScanned={(food) => {
          handleFoodSelect(food);
          onShowBarcodeScanner(false);
        }}
      />
    </>
  );
};

export default AddFoodDialog;