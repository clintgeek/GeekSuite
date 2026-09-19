import React, { useCallback, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useToast } from '@geeksuite/ui';
import { UnifiedFoodSearch } from '../components/FoodSearch';
import BarcodeScanner from '../components/BarcodeScanner/BarcodeScanner.jsx';
import FoodEditDialog from '../components/MyFoods/FoodEditDialog.jsx';
import { fitnessGeekService } from '../services/fitnessGeekService.js';
import { useFoodLogging } from '../hooks/useFoodLogging.js';
import { SectionLabel, DisplayHeading } from '../components/primitives';

const EMPTY_FOOD_FORM = {
  name: '',
  brand: '',
  calories_per_serving: '',
  protein_grams: '',
  carbs_grams: '',
  fat_grams: '',
  serving_size: 100,
  serving_unit: 'g'
};

/**
 * The meal a log at this hour most likely belongs to (mirrors FoodLog.jsx's
 * helper of the same name). This page IS the "one tap to log it" path, so its
 * default chip has to agree with the clock — it used to hardcode 'snack',
 * which meant tapping a breakfast search result before 10am logged it as a
 * snack until you noticed and changed the chip yourself.
 */
const mealTypeForNow = (now = new Date()) => {
  const hour = now.getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
};

/**
 * The full-page search.
 *
 * This page used to be a 177-line marketing panel — a wand icon, a headline
 * and one button — whose only job was to open a dialog that contained the
 * actual search. Reaching a text field took four interactions from the nav.
 * Now the page IS the search, and the field has focus when it loads.
 */
const FoodSearchPage = () => {
  const { notify } = useToast();
  const today = useMemo(() => fitnessGeekService.formatDate(new Date()), []);
  const [mealType, setMealType] = useState(() => mealTypeForNow());
  const [scannerOpen, setScannerOpen] = useState(false);
  const [createForm, setCreateForm] = useState(null);
  const [creating, setCreating] = useState(false);

  const { logItems, undoLogs, describeMeal, adjustLogCalories, createFood } = useFoodLogging({ date: today });

  const handleCreate = useCallback(async () => {
    if (!createForm?.name) return;
    setCreating(true);
    try {
      const created = await createFood({
        name: createForm.name.trim(),
        brand: createForm.brand?.trim() || undefined,
        nutrition: {
          calories_per_serving: Number(createForm.calories_per_serving) || 0,
          protein_grams: Number(createForm.protein_grams) || 0,
          carbs_grams: Number(createForm.carbs_grams) || 0,
          fat_grams: Number(createForm.fat_grams) || 0
        },
        serving: {
          size: Number(createForm.serving_size) || 100,
          unit: createForm.serving_unit || 'g'
        }
      });
      setCreateForm(null);
      if (created) {
        await logItems([{ ...created, servings: 1 }], mealType);
        notify(`Created and logged "${created.name}"`, { tone: 'success' });
      }
    } catch (error) {
      notify(error?.message || 'Could not create that food.', { tone: 'error' });
    } finally {
      setCreating(false);
    }
  }, [createForm, createFood, logItems, mealType, notify]);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 820, mx: 'auto' }}>
      <Box sx={{ mb: 2 }}>
        <SectionLabel sx={{ mb: 0.75 }}>Entry · Search</SectionLabel>
        <DisplayHeading size="page">Add Food</DisplayHeading>
        <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
          Your own foods come up first. Tap once to log it.
        </Typography>
      </Box>

      <UnifiedFoodSearch
        mode="page"
        autoFocus
        mealType={mealType}
        onMealTypeChange={setMealType}
        onLogItems={logItems}
        onDescribe={describeMeal}
        onAdjustCalories={adjustLogCalories}
        onUndo={undoLogs}
        onBarcodeClick={() => setScannerOpen(true)}
        onCreateFood={(query) => setCreateForm({ ...EMPTY_FOOD_FORM, name: query })}
      />

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onBarcodeScanned={async (food) => {
          setScannerOpen(false);
          if (food) await logItems([{ ...food, servings: 1 }], mealType);
        }}
      />

      <FoodEditDialog
        open={Boolean(createForm)}
        food={null}
        form={createForm || EMPTY_FOOD_FORM}
        onChange={setCreateForm}
        onClose={() => setCreateForm(null)}
        onSave={handleCreate}
        loading={creating}
      />
    </Box>
  );
};

export default FoodSearchPage;
