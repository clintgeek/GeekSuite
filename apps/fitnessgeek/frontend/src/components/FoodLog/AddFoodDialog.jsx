import React from 'react';
import { Box } from '@mui/material';
import { Restaurant as FoodIcon } from '@mui/icons-material';
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
}) => (
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
        {/* Folded here too, not just on the page. On a phone this dialog IS
            the Food Log's add flow — the thumb-zone "Log food" button and each
            meal's "+" both open it — so leaving the fold off here meant the
            fix never reached the place the complaint came from. Typing still
            shows results immediately; only the idle list folds. */}
        <UnifiedFoodSearch
          mode="dialog"
          collapseIdleList
          mealType={mealType}
          onMealTypeChange={onMealTypeChange}
          onLogItems={onLogItems}
          onDescribe={onDescribe}
          onAdjustCalories={onAdjustCalories}
          onUndo={onUndo}
          onCreateFood={onCreateFood}
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
        onShowBarcodeScanner?.(false);
        if (food) await onLogItems?.([{ ...food, servings: 1 }], mealType);
      }}
    />
  </>
);

export default AddFoodDialog;
