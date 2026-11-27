import React, { useCallback, useState } from 'react';
import { Typography } from '@mui/material';
import { useToast } from '@geeksuite/ui';
import { FoodComposer } from '../components/FoodSearch';
import { useUndoToast } from '../components/FoodSearch/undoToast.jsx';
import BarcodeScanner from '../components/BarcodeScanner/BarcodeScanner.jsx';
import FoodEditDialog from '../components/MyFoods/FoodEditDialog.jsx';
import { EMPTY_FOOD_FORM, foodPayloadFromForm } from '../components/MyFoods/foodForm.js';
import { useFoodLogging } from '../hooks/useFoodLogging.js';
import { useToday } from '../hooks/useToday.js';
import { Page, Surface } from '../components/primitives';
import { addedMessage } from '../utils/plainWords.js';
import { errorMessage } from '../utils/errorMessage.js';

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
 *
 * More calls it "Look up a specific food" (REVIEW_2026-10): the meal cards'
 * Add is where you say what you ate; this is for the one branded thing. It
 * is the same composer, and a describe here stays on its result card in both
 * modes — there is no meal card on this page for a "Just added" strip.
 */
const FoodSearchPage = () => {
  const { notify } = useToast();
  // Re-read on resume and at midnight: this page logs to "today", and a PWA
  // left open overnight used to log breakfast to yesterday (B3).
  const today = useToday();
  const [mealType, setMealType] = useState(() => mealTypeForNow());
  const [scannerOpen, setScannerOpen] = useState(false);
  const [createForm, setCreateForm] = useState(null);
  const [creating, setCreating] = useState(false);

  const { logItems, undoLogs, describeMeal, adjustLogCalories, updateLog, setLogCalories, createFood } = useFoodLogging({ date: today });
  const { offerUndo } = useUndoToast(undoLogs);

  const handleCreate = useCallback(async () => {
    if (creating || !createForm?.name?.trim()) return;
    setCreating(true);
    let created = null;
    try {
      created = await createFood(foodPayloadFromForm(createForm));
    } catch (error) {
      // Not saved: the form stays open with what was typed.
      notify(errorMessage(error, 'Couldn’t create that food. Try again.'), { tone: 'error' });
      setCreating(false);
      return;
    }
    // The food exists now, so the form's job is done whatever the log does.
    setCreateForm(null);
    try {
      if (created) {
        // Say "Added" only when the log was written. It used to say so
        // whatever came back, so a failed log read as a success.
        const result = await logItems([{ ...created, servings: 1 }], mealType);
        if ((result?.ok ?? 0) > 0) {
          offerUndo(addedMessage(mealType, created.name), result?.logIds || []);
        } else {
          notify(`Saved ${created.name} to your foods, but couldn’t add it to today. Search for it to try again.`, { tone: 'error' });
        }
      }
    } catch (error) {
      notify(errorMessage(error, 'Saved the food, but couldn’t add it to today. Search for it to try again.'), { tone: 'error' });
    } finally {
      setCreating(false);
    }
  }, [creating, createForm, createFood, logItems, mealType, notify, offerUndo]);

  return (
    <Page narrow>
      <Typography sx={{ color: 'text.secondary', fontSize: '1rem' }}>
        Say what you ate, or type a food’s name to pick it from the list.
      </Typography>

      {/* 4px theme unit: 12px on a phone, 20px from sm. */}
      <Surface sx={{ p: { xs: 3, sm: 5 } }}>
      <FoodComposer
        mode="page"
        autoFocus
        resultStyle="card"
        mealType={mealType}
        onMealTypeChange={setMealType}
        onLogItems={logItems}
        onDescribe={describeMeal}
        onAdjustCalories={adjustLogCalories}
        onUpdateLog={updateLog}
        onSetCalories={setLogCalories}
        onUndo={undoLogs}
        onBarcodeClick={() => setScannerOpen(true)}
        onCreateFood={(query) => setCreateForm({ ...EMPTY_FOOD_FORM, name: query })}
      />
      </Surface>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onBarcodeScanned={async (food) => {
          // Report the real write outcome — the scanner only closes itself on
          // a genuine success (see BarcodeScanner.jsx's own comment); a
          // failed log stays open with the error visible instead of quietly
          // closing on "we found the product".
          try {
            const result = await logItems([{ ...food, servings: 1 }], mealType);
            if ((result?.ok ?? 0) > 0) {
              offerUndo(addedMessage(mealType, food.name), result?.logIds || []);
              return true;
            }
            return false;
          } catch {
            return false;
          }
        }}
      />

      <FoodEditDialog
        open={Boolean(createForm)}
        food={null}
        form={createForm || EMPTY_FOOD_FORM}
        onChange={setCreateForm}
        onClose={() => { if (!creating) setCreateForm(null); }}
        onSave={handleCreate}
        loading={creating}
      />
    </Page>
  );
};

export default FoodSearchPage;
