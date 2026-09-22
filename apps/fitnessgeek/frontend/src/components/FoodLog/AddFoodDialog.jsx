import React from 'react';
import { Box, Button } from '@mui/material';
import { Restaurant as FoodIcon } from '@mui/icons-material';
import { useToast } from '@geeksuite/ui';
import { UnifiedFoodSearch } from '../FoodSearch';
import BarcodeScanner from '../BarcodeScanner/BarcodeScanner.jsx';
import PremiumDialog from '../primitives/PremiumDialog.jsx';

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
 * into `UnifiedFoodSearch`, which calls it once a described log comes back
 * clean. A barcode is scanned outside that component entirely, so the same
 * "close on success, stay open and show the error otherwise" has to be
 * built here: `onBarcodeScanned` returns whether the log actually wrote,
 * and only then does `BarcodeScanner` close itself — see its own comment.
 * Tapping an individual result row is neither of these: it stays exactly as
 * it was, logging in place and growing the SessionRibbon tray, because
 * picking several items is a session the person ends, not the app.
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
  onCreateFood,
  showBarcodeScanner,
  onShowBarcodeScanner,
  initialQuery = '',
  ketoMode = false
}) => {
  const { notify } = useToast();

  return (
    <>
      <PremiumDialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        eyebrow="Log"
        title="Add Food"
        icon={FoodIcon}
        contentSx={{ px: { xs: 1.5, sm: 2.5 } }}
      >
        <Box sx={{ minHeight: 360 }}>
          <UnifiedFoodSearch
            mode="dialog"
            mealType={mealType}
            onMealTypeChange={onMealTypeChange}
            onLogItems={onLogItems}
            onDescribe={onDescribe}
            onAdjustCalories={onAdjustCalories}
            onUndo={onUndo}
            onCreateFood={onCreateFood}
            onClose={onClose}
            onBarcodeClick={() => onShowBarcodeScanner?.(true)}
            initialQuery={initialQuery}
            ketoMode={ketoMode}
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
              const logIds = result?.logIds || [];
              notify(`Logged ${food.name}`, {
                tone: 'success',
                action: logIds.length > 0 && onUndo ? (
                  <Button
                    size="small"
                    sx={{ color: 'inherit', fontWeight: 700 }}
                    onClick={() => onUndo(logIds)}
                  >
                    Undo
                  </Button>
                ) : undefined
              });
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
