import React from 'react';
import { Box } from '@mui/material';
import { Restaurant as FoodIcon } from '@mui/icons-material';
import { FoodComposer } from '../FoodSearch';
import { useUndoToast } from '../FoodSearch/undoToast.jsx';
import { useBackToClose } from '../FoodSearch/useBackToClose.js';
import { mealOnDay } from '../FoodSearch/composerText.js';
import BarcodeScanner from '../BarcodeScanner/BarcodeScanner.jsx';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import { useToday } from '../../hooks/useToday.js';
import { addedMessage, mealWord } from '../../utils/plainWords.js';

/**
 * The meal-slot sheet: the same search box, in a dialog, with the meal you
 * tapped already chosen.
 *
 * It used to be 603 lines and three tabs. The Search tab hosted the real
 * component; the Barcode tab was a picture of a barcode telling you to click
 * an icon to open the scanner it had already opened; the Custom tab was a
 * second, divergent copy of the custom-food form that `MyFoods` also owns.
 * Barcode is now an icon in the box and custom food goes to the one form, so
 * what is left is the sheet itself.
 *
 * BOTH single-shot paths close this whole sheet on success (Chef: "on the
 * one-tap or barcode scan, the modal should close to show it completed
 * successfully"). Describing a meal closes via `onClose` passed straight
 * into `FoodComposer`, which calls it once a described log comes back
 * clean. A barcode is scanned outside that component entirely, so the same
 * "close on success, stay open and show the error otherwise" has to be
 * built here: `onBarcodeScanned` returns whether the log actually wrote,
 * and only then does `BarcodeScanner` close itself — see its own comment.
 * Tapping an individual result row is neither of these: it stays exactly as
 * it was, logging in place and growing the SessionRibbon tray, because
 * picking several items is a session the person ends, not the app.
 *
 * In Simple a describe does not close it either (Chef, 2026-10-16): the sheet
 * stays on a result card with Done. FoodComposer decides; this passes
 * `onJustAdded` through for Full's "Just added" strip.
 *
 * THE DAY IS IN THE TITLE when it isn't today: "Add to yesterday's dinner",
 * "Add to Wednesday's dinner" (REVIEW_2026-10 Phase 1.5). Heather backfills
 * (§2a), and the sheet never said which day it was writing to.
 *
 * IT DOESN'T BOUNCE ON A DESKTOP. Chef: "the entry form bounces around a lot
 * on the desktop when trying to enter foods." The window was vertically
 * centred, so every batch of results that changed its height moved the box
 * under the cursor. It is anchored to the top now, at a fixed height, and the
 * results scroll inside it. (Below `sm` it is full-screen, as before.)
 */
const AddFoodDialog = ({
  open,
  onClose,
  mealType,
  onMealTypeChange,
  onLogItems,
  onDescribe,
  onAdjustCalories,
  onUndo,
  onUpdateLog,
  onSetCalories,
  onJustAdded,
  onCreateFood,
  showBarcodeScanner,
  onShowBarcodeScanner,
  initialQuery = '',
  ketoMode = false,
  // The day being logged to — feeds the "Again" chips and "Same as
  // yesterday's …" (SIMPLE_AND_FULL_PLAN.md item 2).
  date = null
}) => {
  const { offerUndo } = useUndoToast(onUndo);
  const today = useToday();
  const day = date || today;
  // Android's back gesture closes this sheet instead of leaving the page.
  useBackToClose(Boolean(open), onClose);

  return (
    <>
      <PremiumDialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        // One title, in words: "Add to lunch". It used to be an eyebrow, a
        // title and an icon saying "Log · Add Food" above a meal picker.
        title={`Add to ${mealOnDay(mealWord(mealType), day, today)}`}
        icon={FoodIcon}
        contentSx={{ px: { xs: 1.5, sm: 2.5 } }}
        // Top-anchored, fixed height on a desktop; see the note above.
        sx={{ '& .MuiDialog-container': { alignItems: { sm: 'flex-start' } } }}
        PaperProps={{
          'data-testid': 'add-food-dialog',
          sx: { mt: { sm: '5vh' }, height: { sm: 'min(780px, 90vh)' }, maxHeight: { sm: '90vh' } },
        }}
      >
        <Box sx={{ minHeight: 360 }}>
          {/* Folded here too, not just on the page. On a phone this dialog IS
              the Food Log's add flow — the thumb-zone "Log food" button and each
              meal's "+" both open it — so leaving the fold off here meant the
              fix never reached the place the complaint came from. Typing still
              shows results immediately; only the idle list folds. */}
          <FoodComposer
            mode="dialog"
            collapseIdleList
            mealType={mealType}
            onMealTypeChange={onMealTypeChange}
            onLogItems={onLogItems}
            onDescribe={onDescribe}
            onAdjustCalories={onAdjustCalories}
            onUndo={onUndo}
            onUpdateLog={onUpdateLog}
            onSetCalories={onSetCalories}
            onJustAdded={onJustAdded}
            onCreateFood={onCreateFood}
            onClose={onClose}
            onBarcodeClick={() => onShowBarcodeScanner?.(true)}
            initialQuery={initialQuery}
            ketoMode={ketoMode}
            showQuickPicks
            date={day}
          />
        </Box>
      </PremiumDialog>

      <BarcodeScanner
        open={Boolean(showBarcodeScanner)}
        onClose={() => onShowBarcodeScanner?.(false)}
        onBarcodeScanned={async (food) => {
          // A scanned product is never a guess (DOCS/THE_DESCRIBE_AND_LOG_PLAN.md
          // §2) — the only thing that can fail from here is the write itself.
          // Report the real outcome back so the scanner only closes on a
          // genuine success, never on "we found the product" alone.
          try {
            const result = await onLogItems?.([{ ...food, servings: 1 }], mealType);
            if ((result?.ok ?? 0) > 0) {
              offerUndo(addedMessage(mealType, food.name), result?.logIds || []);
              // The whole sheet is done, not just the scanner on top of it —
              // a definitive barcode scan has nothing left to pick.
              onClose?.();
              return true;
            }
            return false;
          } catch {
            return false;
          }
        }}
      />
    </>
  );
};

export default AddFoodDialog;
