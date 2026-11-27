import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { Settings as SettingsIcon } from '@mui/icons-material';
import { fmt } from '../../utils/plainWords.js';
import { LabelPanel, LabelBar, FactColumnHead, FactRow } from '../primitives';

// RDA values for a 2000 calorie diet
const RDA_VALUES = {
  calories: 2000,
  protein: 50, // 10% of calories (2000 * 0.1 / 4 = 50g)
  carbs: 250,  // 50% of calories (2000 * 0.5 / 4 = 250g)
  fat: 65      // 30% of calories (2000 * 0.3 / 9 = 67g, rounded to 65)
};

/**
 * The day's totals as a Nutrition Facts panel: one row per nutrient, "name
 * amount of target … percent", and a square bar under each. A nutrient past
 * its target says "N over" in a tag, in words, not in red alone.
 */
const NutritionSummary = ({
  summary,
  showGoals = true,
  onCalorieSettingsClick
}) => {
  const {
    calories = 0,
    protein = 0,
    carbs = 0,
    fat = 0,
    calorieGoal = 0,
    proteinGoal = 0,
    carbsGoal = 0,
    fatGoal = 0
  } = summary || {};

  // Use RDA values as fallback when goals are 0
  const rows = [
    { label: 'Calories', value: calories, goal: calorieGoal > 0 ? calorieGoal : RDA_VALUES.calories, unit: 'cal', isRDA: calorieGoal === 0 },
    { label: 'Protein', value: protein, goal: proteinGoal > 0 ? proteinGoal : RDA_VALUES.protein, unit: 'g', isRDA: proteinGoal === 0 },
    { label: 'Carbs', value: carbs, goal: carbsGoal > 0 ? carbsGoal : RDA_VALUES.carbs, unit: 'g', isRDA: carbsGoal === 0 },
    { label: 'Fat', value: fat, goal: fatGoal > 0 ? fatGoal : RDA_VALUES.fat, unit: 'g', isRDA: fatGoal === 0 },
  ];

  return (
    <LabelPanel
      title="Today’s totals"
      action={onCalorieSettingsClick && (
        <Tooltip title="Change your daily target">
          <IconButton
            size="small"
            onClick={onCalorieSettingsClick}
            aria-label="Change your daily target"
            sx={{ color: 'text.secondary', mr: -0.75 }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    >
      {showGoals && <FactColumnHead>% of daily target</FactColumnHead>}
      {rows.map((item, i) => {
        const pct = Math.round((item.value / item.goal) * 100);
        const over = Math.round(item.value - item.goal);
        return (
          <React.Fragment key={item.label}>
            <FactRow
              first={i === 0}
              name={item.label}
              amount={`${fmt(item.value)} ${item.unit === 'g' ? 'g' : item.unit}`}
              of={showGoals ? `of ${fmt(item.goal)}${item.isRDA ? ' (typical day)' : ''}` : undefined}
              tag={showGoals && over > 0 ? `${fmt(over)} over` : undefined}
              percent={showGoals ? `${pct}%` : undefined}
              sx={showGoals ? { pb: 0 } : undefined}
            />
            {showGoals && (
              <LabelBar
                value={Math.min(pct, 100)}
                height={6}
                sx={{ mt: 0.5, mb: 0.875 }}
                label={`${item.label}: ${fmt(item.value)} ${item.unit} of ${fmt(item.goal)}${item.isRDA ? ' on a typical day' : ''}`}
              />
            )}
          </React.Fragment>
        );
      })}
    </LabelPanel>
  );
};

export default NutritionSummary;
