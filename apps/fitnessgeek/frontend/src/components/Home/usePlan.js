import { useCallback, useEffect, useState } from 'react';
import { settingsService } from '../../services/settingsService.js';
import { bodyCompService } from '../../services/bodyCompService.js';

const safe = (fn) => Promise.resolve().then(fn);

/**
 * The saved calorie plan and the latest scan's BMR. The plan feeds the
 * plan-accuracy note and says whether the person eats keto (and their
 * net-carb limit); the scan BMR feeds the note's offer.
 */
export function usePlan() {
  const [nutritionGoal, setNutritionGoal] = useState(null);
  const [scanBmr, setScanBmr] = useState(null);

  const reload = useCallback(() => {
    safe(() => settingsService.getSettings()).then((resp) => {
      const d = resp?.data || resp;
      setNutritionGoal(d?.nutrition_goal || null);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    safe(() => bodyCompService.getSummary()).then((resp) => {
      const summary = resp?.data ?? resp;
      setScanBmr(summary?.bmr || null);
    }).catch(() => {});
  }, [reload]);

  return {
    nutritionGoal,
    scanBmr,
    keto: nutritionGoal?.mode === 'keto',
    planMode: nutritionGoal?.mode || 'standard',
    netCarbLimit: nutritionGoal?.keto?.net_carb_limit_g ?? 20,
    reload,
  };
}

export default usePlan;
