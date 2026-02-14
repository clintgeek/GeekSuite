import React, { useState } from 'react';
import { Box, Typography, Alert, Snackbar, Button, Card, CardContent } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Add as AddIcon } from '@mui/icons-material';
import AddFoodDialog from '../components/FoodLog/AddFoodDialog';
import { fitnessGeekService } from '../services/fitnessGeekService.js';

const FoodSearchPage = () => {
  const theme = useTheme();
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('success');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  const handleFoodSelect = async (food, meta) => {
    try {
      // Add the food to today's log with the configured servings and nutrition
      const today = fitnessGeekService.formatDate(new Date());

      if (food.type === 'meal') {
        // Add meal to log
        await fitnessGeekService.addMealToLog(food._id, today, food.mealType || 'snack');
        setMessage(`Added "${food.name}" meal to today's log`);
      } else {
        // Add individual food to log with servings, notes, and modified nutrition
        const logData = {
          food_item: {
            name: food.name,
            brand: food.brand,
            calories_per_serving: food.nutrition?.calories_per_serving || 0,
            protein_grams: food.nutrition?.protein_grams || 0,
            carbs_grams: food.nutrition?.carbs_grams || 0,
            fat_grams: food.nutrition?.fat_grams || 0,
            serving_size: food.serving?.size || 100,
            serving_unit: food.serving?.unit || 'g',
            source: food.source || 'custom',
            source_id: food.source_id || `${food.source}-${food._id}`,
            barcode: food.barcode
          },
          log_date: today,
          meal_type: food.mealType || 'snack',
          servings: food.servings || 1,
          notes: food.notes || ''
        };

        await fitnessGeekService.addFoodToLog(logData);
        setMessage(`Added "${food.name}" (${food.servings || 1} serving${(food.servings || 1) !== 1 ? 's' : ''}) to ${food.mealType || 'snack'}`);
      }

      setMessageType('success');
      if (!meta?.isBatch) {
        setShowAddDialog(false);
      }
    } catch (error) {
      console.error('Error adding food to log:', error);
      setMessage('Failed to add food to log. Please try again.');
      setMessageType('error');
    }
  };

  const handleCloseMessage = () => {
    setMessage(null);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontWeight: 700,
            mb: 0.5,
            color: theme.palette.text.primary,
            letterSpacing: '-0.02em'
          }}
        >
          Add Food
        </Typography>
        <Typography variant="body1" sx={{ color: theme.palette.text.secondary, fontSize: '1.0625rem' }}>
          Search, scan, or use AI to add food to today's log
        </Typography>
      </Box>

      {/* Call to Action Card */}
      <Card
        sx={{
          borderRadius: '24px',
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.08)} 0%, ${alpha(theme.palette.primary.dark, theme.palette.mode === 'dark' ? 0.25 : 0.1)} 100%)`,
          border: `2px solid ${alpha(theme.palette.primary.main, 0.25)}`,
          boxShadow: theme.shadows[8],
          maxWidth: 600,
          mx: 'auto',
          mt: 4
        }}
      >
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              mb: 2,
              color: theme.palette.text.primary
            }}
          >
            Ready to add food?
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: theme.palette.text.secondary,
              mb: 3,
              lineHeight: 1.6
            }}
          >
            Choose from multiple ways to add food: AI-powered natural language input,
            barcode scanning, traditional search, or create custom foods.
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<AddIcon />}
            onClick={() => setShowAddDialog(true)}
            sx={{
              borderRadius: '999px',
              px: 4,
              py: 1.5,
              background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
              boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.35)}`,
              fontWeight: 700,
              fontSize: '1.0625rem',
              textTransform: 'none',
              '&:hover': {
                background: `linear-gradient(135deg, ${theme.palette.primary.dark}, ${alpha(theme.palette.primary.dark, 0.9)})`,
                boxShadow: `0 6px 20px ${alpha(theme.palette.primary.main, 0.45)}`,
                transform: 'translateY(-2px)'
              },
              transition: 'all 0.2s ease'
            }}
          >
            Add Food to Log
          </Button>
        </CardContent>
      </Card>

      {/* Add Food Dialog with all tabs */}
      <AddFoodDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onFoodSelect={handleFoodSelect}
        mealType="snack"
        showBarcodeScanner={showBarcodeScanner}
        onShowBarcodeScanner={setShowBarcodeScanner}
      />

      {/* Success/Error Messages */}
      <Snackbar
        open={!!message}
        autoHideDuration={4000}
        onClose={handleCloseMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseMessage}
          severity={messageType}
          sx={{
            width: '100%',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
          }}
        >
          {message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default FoodSearchPage;