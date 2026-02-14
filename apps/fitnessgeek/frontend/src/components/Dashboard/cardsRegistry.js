import React from 'react';
import { Box, Typography } from '@mui/material';
import { ForkKnife as Unused } from '@mui/icons-material';
import { MetricCard } from './index.js';
import NutritionSummary from '../FoodLog/NutritionSummary.jsx';
import GarminSummaryCard from './GarminSummaryCard.jsx';

// Registry items provide simple renderers; data comes from props
export const dashboardCards = {
  calories_today: {
    render: ({ todaySummary, goals, navigate }) => (
      <MetricCard
        value={todaySummary?.totals?.calories || 0}
        subtitle="calories today"
        color="success"
        progress={goals?.nutrition?.goals?.calories ? Math.min(((todaySummary?.totals?.calories || 0) / goals.nutrition.goals.calories) * 100, 100) : null}
        progressLabel={goals?.nutrition?.goals?.calories ? `Goal: ${goals.nutrition.goals.calories}` : null}
        progressValue={goals?.nutrition?.goals?.calories ? Math.round(((todaySummary?.totals?.calories || 0) / goals.nutrition.goals.calories) * 100) : null}
        timeout={300}
        onClick={() => navigate('/food-log')}
      />
    )
  },
  nutrition_today: {
    render: ({ todaySummary, macroTargets }) => (
      <NutritionSummary
        summary={{
          calories: todaySummary?.totals?.calories || 0,
          protein: todaySummary?.totals?.protein_grams || 0,
          carbs: todaySummary?.totals?.carbs_grams || 0,
          fat: todaySummary?.totals?.fat_grams || 0,
          calorieGoal: macroTargets?.total || 0,
          proteinGoal: macroTargets?.protein || 0,
          carbsGoal: macroTargets?.carbs || 0,
          fatGoal: macroTargets?.fat || 0
        }}
        showGoals
      />
    )
  },
  garmin_summary: {
    render: ({ garminDaily }) => garminDaily ? (
      <GarminSummaryCard
        steps={garminDaily.steps}
        activeCalories={garminDaily.activeCalories}
        sleepMinutes={garminDaily.sleepMinutes}
        restingHR={garminDaily.restingHR}
        fetchedAt={garminDaily.fetchedAt}
        lastSyncAt={garminDaily.lastSyncAt}
      />
    ) : null
  }
};


