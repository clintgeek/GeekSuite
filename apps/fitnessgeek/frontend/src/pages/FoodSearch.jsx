import React, { useState } from 'react';
import { Box, Typography, Alert, Snackbar, Button } from '@mui/material';
import { Add as AddIcon, AutoAwesome as WandIcon } from '@mui/icons-material';
import AddFoodDialog from '../components/FoodLog/AddFoodDialog';
import { fitnessGeekService } from '../services/fitnessGeekService.js';
import {
  Surface,
  SectionLabel,
  DisplayHeading,
} from '../components/primitives';

/**
 * FoodSearch Page — a dedicated entry point for adding food to today's log.
 *
 * The real work happens inside AddFoodDialog (which uses the staging tray).
 * This page exists as a prominent CTA surface when users navigate here directly
 * from the nav, rather than from a meal slot in the Food Log.
 */
const FoodSearchPage = () => {
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('success');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  const handleCommitBatch = async (items) => {
    if (!items || items.length === 0) return { ok: 0, fail: 0 };

    const today = fitnessGeekService.formatDate(new Date());
    let ok = 0;
    let fail = 0;

    const results = await Promise.allSettled(
      items.map(async (item) => {
        if (item.type === 'meal' && item._id) {
          return fitnessGeekService.addMealToLog(item._id, today, 'snack');
        }
        const logData = {
          food_item: item,
          meal_type: 'snack',
          servings: Number(item.servings) || 1,
          log_date: today,
          nutrition: item.nutrition,
        };
        const resp = await fitnessGeekService.addFoodToLog(logData);
        if (!(resp && resp.success)) {
          throw new Error(resp?.error?.message || 'Failed to log item');
        }
        return true;
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') ok += 1;
      else fail += 1;
    }

    if (ok > 0) {
      setMessage(`Added ${ok} item${ok !== 1 ? 's' : ''} to today's snack.`);
      setMessageType(fail > 0 ? 'warning' : 'success');
    }
    if (fail > 0 && ok === 0) {
      setMessage(`Failed to add ${fail} item${fail !== 1 ? 's' : ''}.`);
      setMessageType('error');
    }

    return { ok, fail };
  };

  // Legacy single-item handler for Barcode / Custom tabs
  const handleFoodSelect = async (food) => {
    try {
      const today = fitnessGeekService.formatDate(new Date());
      const logData = {
        food_item: food,
        meal_type: food.mealType || 'snack',
        servings: food.servings || 1,
        log_date: today,
        nutrition: food.nutrition,
      };
      await fitnessGeekService.addFoodToLog(logData);
      setMessage(`Added "${food.name}" to today's log`);
      setMessageType('success');
      setShowAddDialog(false);
    } catch (error) {
      console.error('Error adding food to log:', error);
      setMessage('Failed to add food. Please try again.');
      setMessageType('error');
    }
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 960, mx: 'auto' }}>
      {/* Editorial header */}
      <Box sx={{ mb: 3 }}>
        <SectionLabel sx={{ mb: 0.75 }}>Entry · Quick Add</SectionLabel>
        <DisplayHeading size="page">Add Food</DisplayHeading>
        <Typography
          sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}
        >
          Describe your meal, scan a barcode, or build a custom entry.
        </Typography>
      </Box>

      {/* CTA Surface */}
      <Surface
        variant="ticket"
        sx={{
          maxWidth: 560,
          mx: 'auto',
          mt: 3,
          textAlign: 'center',
          py: { xs: 5, sm: 6 },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WandIcon sx={{ fontSize: 26 }} />
          </Box>
        </Box>
        <DisplayHeading size="card" sx={{ mb: 1 }}>
          Ready to add food?
        </DisplayHeading>
        <Typography
          sx={{
            color: 'text.secondary',
            fontSize: '0.9375rem',
            maxWidth: 400,
            mx: 'auto',
            mb: 3,
            lineHeight: 1.55,
          }}
        >
          Use natural language ("2 tacos and a beer"), scan a barcode, or
          create a custom food. Stage multiple items and log them all at once.
        </Typography>
        <Button
          variant="contained"
          size="large"
          startIcon={<AddIcon />}
          onClick={() => setShowAddDialog(true)}
          sx={{
            borderRadius: 999,
            px: 4,
            py: 1.25,
            fontSize: '0.875rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Open Food Entry
        </Button>
      </Surface>

      <AddFoodDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onFoodSelect={handleFoodSelect}
        onCommitBatch={handleCommitBatch}
        mealType="snack"
        showBarcodeScanner={showBarcodeScanner}
        onShowBarcodeScanner={setShowBarcodeScanner}
      />

      <Snackbar
        open={!!message}
        autoHideDuration={4000}
        onClose={() => setMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setMessage(null)}
          severity={messageType}
          sx={{ width: '100%', borderRadius: 2 }}
        >
          {message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default FoodSearchPage;
