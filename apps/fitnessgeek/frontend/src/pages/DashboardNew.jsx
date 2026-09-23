import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Button,
} from '@mui/material';
import {
  Add as AddIcon,
  MonitorWeight as WeightIcon,
  MonitorHeart as BPIcon,
  Medication as MedsIcon,
  DirectionsWalk as StepsIcon,
  Whatshot as StreakIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useToast } from '@geeksuite/ui';

// Import new components
import DailyTicket from '../components/Dashboard/DailyTicket.jsx';
import QuickActionButton from '../components/Dashboard/QuickActionButton.jsx';
import StatCard from '../components/Dashboard/StatCard.jsx';
import MealCard from '../components/Dashboard/MealCard.jsx';
import AIInsightsCard from '../components/Dashboard/AIInsightsCard.jsx';
import PlanAccuracyBanner from '../components/Dashboard/PlanAccuracyBanner.jsx';
import { weightStatView } from '../components/Dashboard/weightStatView.js';
import { Surface, SectionLabel, DisplayHeading, SurfaceSkeleton } from '../components/primitives';

// Import services
import { fitnessGeekService } from '../services/fitnessGeekService.js';
import { goalsService } from '../services/goalsService.js';
import { weightService } from '../services/weightService.js';
import { bpService } from '../services/bpService.js';
import { streakService } from '../services/streakService.js';
import { settingsService } from '../services/settingsService.js';
import { bodyCompService } from '../services/bodyCompService.js';
import { useFoodLogging } from '../hooks/useFoodLogging.js';

const DashboardNew = () => {
  const { notify } = useToast();
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [removingLogIds, setRemovingLogIds] = useState(new Set());
  // Full log objects (food_item, nutrition snapshot, servings, meal_type) keyed
  // by log id — the dashboard's own `foods` array only carries a display
  // projection (name/brand/calories), which isn't enough to re-create a log.
  // Kept alongside it so Undo has what it needs without a second network trip.
  const [logsById, setLogsById] = useState({});
  // Today, in the same local-date format the rest of the log/undo path uses.
  // The dashboard only ever shows today, so this is also the date a removed
  // item's Undo re-logs it to.
  const today = fitnessGeekService.formatDate(new Date());
  // Same "log this" mechanism the Food Log page and search box use, so
  // undoing a delete here doesn't invent a second "add it back" path.
  const { logItems } = useFoodLogging({ date: today });
  // Keto mode state
  const [nutritionGoal, setNutritionGoal] = useState(null);
  // bodyCompositionSummary.bmr — for the "measured BMR available" banner.
  const [scanBmr, setScanBmr] = useState(null);
  // derivedMacros.rules.protein_basis — 'lean_mass' captions the protein target.
  const [proteinBasis, setProteinBasis] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    calories: { consumed: 0, goal: 2000, remaining: 2000 },
    netCarbs: { consumed: 0 },
    macros: {
      protein: { current: 0, goal: 150 },
      carbs: { current: 0, goal: 250 },
      fat: { current: 0, goal: 65 },
    },
    stats: {
      weight: { value: '--', unit: '', caption: '' },
      bloodPressure: { systolic: null, diastolic: null, trend: null, trendValue: '' },
      steps: { value: null, unit: 'steps', trend: null, trendValue: '' },
      streak: { value: 0, unit: 'days', trend: null, trendValue: '' },
    },
    meals: [
      { type: 'breakfast', foods: [], totalCalories: 0 },
      { type: 'lunch', foods: [], totalCalories: 0 },
      { type: 'snack', foods: [], totalCalories: 0 },
      { type: 'dinner', foods: [], totalCalories: 0 },
    ],
  });

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load; loadDashboardData now closes over `notify` from useToast(), which the linter can't prove is stable.
  }, []);

  // Load nutrition goal (mode + keto config) independently from dashboard data
  useEffect(() => {
    settingsService.getSettings().then(resp => {
      const data = resp?.data || resp?.data?.data || resp;
      setNutritionGoal(data?.nutrition_goal || null);
    }).catch(() => {
      // Non-fatal — standard mode is the safe fallback
    });
    bodyCompService.getSummary().then(resp => {
      const summary = resp?.data ?? resp;
      setScanBmr(summary?.bmr || null);
    }).catch(() => {
      // Non-fatal — without it the only banner possible is the stale one.
    });
  }, []);

  // Derive mode and keto config from loaded nutritionGoal
  const mode = nutritionGoal?.mode || 'standard';
  const netCarbLimit = nutritionGoal?.keto?.net_carb_limit_g ?? 20;

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const greeting = getGreeting();

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load real data from services - use local date format (YYYY-MM-DD)
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const [summaryResult, goalsResult, weightResult, bpResult, garminResult, logsResult, streakResult] = await Promise.allSettled([
        fitnessGeekService.getDailySummary(today),
        goalsService.getDerivedMacros(),
        weightService.getWeightStats(),
        bpService.getCurrentBP(),
        // `today` (local, computed just above) — NOT the no-argument form.
        // Without a date the resolver falls back to the server's `new Date()`,
        // and the containers run UTC: opening the dashboard at 20:00 Central
        // asked Garmin for TOMORROW, so Steps showed `--` and activeCalories
        // came back 0, dropping the activity eat-back added to the calorie
        // target. It repaired itself at midnight UTC, which is why it only
        // ever looked broken in the evening.
        fitnessGeekService.getGarminDaily(today),
        fitnessGeekService.getLogsForDate(today),
        streakService.getLoginStreak(),
      ]);

      // Get food logs to populate meal items
      let foodLogs = [];
      if (logsResult.status === 'fulfilled' && logsResult.value) {
        const logsData = logsResult.value;
        foodLogs = Array.isArray(logsData) ? logsData : (logsData.data || []);
      }

      // Group food logs by meal type
      const logsByMeal = {
        breakfast: [],
        lunch: [],
        snack: [],
        dinner: [],
      };

      // Index the raw logs by id too, so a later delete can find enough of
      // the original (food_item, nutrition snapshot, servings) to offer a
      // real Undo instead of the display-only projection built below.
      const rawLogsById = {};
      foodLogs.forEach((log) => {
        const id = log._id || log.id;
        if (id) rawLogsById[id] = log;
      });
      setLogsById(rawLogsById);

      foodLogs.forEach(log => {
        const mealType = log.meal_type || 'snack';
        if (logsByMeal[mealType]) {
          const foodItem = log.food_item_id || log.food_item || {};
          const perServing = log.nutrition?.calories_per_serving || foodItem.nutrition?.calories_per_serving || 0;
          const servings = log.servings || 1;
          logsByMeal[mealType].push({
            logId: log._id || log.id,
            name: foodItem.name || 'Unknown food',
            brand: foodItem.brand || '',
            servings,
            caloriesPerServing: Math.round(perServing),
            calories: Math.round(perServing * servings),
          });
        }
      });

      // Process summary data (calories and meals)
      if (summaryResult.status === 'fulfilled' && summaryResult.value) {
        const summary = summaryResult.value.data || summaryResult.value;

        // Build meals array with food items from logs
        const mealsArray = [
          {
            type: 'breakfast',
            foods: logsByMeal.breakfast,
            totalCalories: summary.meals?.breakfast?.calories || 0,
          },
          {
            type: 'lunch',
            foods: logsByMeal.lunch,
            totalCalories: summary.meals?.lunch?.calories || 0,
          },
          {
            type: 'snack',
            foods: logsByMeal.snack,
            totalCalories: summary.meals?.snack?.calories || 0,
          },
          {
            type: 'dinner',
            foods: logsByMeal.dinner,
            totalCalories: summary.meals?.dinner?.calories || 0,
          },
        ];

        setDashboardData(prev => ({
          ...prev,
          calories: {
            consumed: summary.totals?.calories || 0,
            goal: summary.calorieGoal || 2000,
            remaining: (summary.calorieGoal || 2000) - (summary.totals?.calories || 0),
          },
          netCarbs: {
            consumed: summary.totals?.net_carbs_grams || 0,
          },
          macros: {
            protein: {
              current: summary.totals?.protein_grams || 0,
              goal: summary.proteinGoal || 150,
            },
            carbs: {
              current: summary.totals?.carbs_grams || 0,
              goal: summary.carbsGoal || 250,
            },
            fat: {
              current: summary.totals?.fat_grams || 0,
              goal: summary.fatGoal || 65,
            },
          },
          meals: mealsArray,
        }));
      }

      // Process goals data
      if (goalsResult.status === 'fulfilled' && goalsResult.value) {
        const derived = goalsResult.value;
        const payload = derived?.data || derived?.data?.data || derived;
        const todayTargets = payload?.today;
        const fallbackFixed = payload?.fixed || {};
        const caloriesInfo = payload?.calories || {};
        setProteinBasis(payload?.rules?.protein_basis || null);

        const resolveNumber = value => (
          typeof value === 'number' && !Number.isNaN(value) ? Math.round(value) : null
        );

        const targetCalorieGoal = resolveNumber(
          todayTargets?.target_calories ?? todayTargets?.calories ?? caloriesInfo.daily
        );
        const targetProteinGoal = resolveNumber(
          todayTargets?.protein_g ?? fallbackFixed.protein_g
        );
        const targetCarbGoal = resolveNumber(todayTargets?.carbs_g);
        const targetFatGoal = resolveNumber(
          todayTargets?.fat_g ?? fallbackFixed.fat_g
        );

        setDashboardData(prev => {
          const nextCalorieGoal = targetCalorieGoal ?? prev.calories.goal;
          const nextProteinGoal = targetProteinGoal ?? prev.macros.protein.goal;
          const nextCarbGoal = targetCarbGoal ?? prev.macros.carbs.goal;
          const nextFatGoal = targetFatGoal ?? prev.macros.fat.goal;

          return ({
            ...prev,
            calories: {
              ...prev.calories,
              goal: nextCalorieGoal,
              remaining: nextCalorieGoal - prev.calories.consumed,
            },
            macros: {
              protein: { ...prev.macros.protein, goal: nextProteinGoal },
              carbs: { ...prev.macros.carbs, goal: nextCarbGoal },
              fat: { ...prev.macros.fat, goal: nextFatGoal },
            },
          });
        });
      }

      // Process weight data
      if (weightResult.status === 'fulfilled' && weightResult.value?.data) {
        const weight = weightStatView(weightResult.value.data);
        setDashboardData(prev => ({
          ...prev,
          stats: { ...prev.stats, weight },
        }));
      }

      // Process blood pressure data
      if (bpResult.status === 'fulfilled' && bpResult.value) {
        const bp = bpResult.value;
        let bpTrend = 'normal';
        let bpTrendValue = '';

        if (bp.systolic >= 140 || bp.diastolic >= 90) {
          bpTrend = 'up';
          bpTrendValue = 'High';
        } else if (bp.systolic < 90 || bp.diastolic < 60) {
          bpTrend = 'down';
          bpTrendValue = 'Low';
        }

        setDashboardData(prev => ({
          ...prev,
          stats: {
            ...prev.stats,
            bloodPressure: {
              systolic: bp.systolic || prev.stats.bloodPressure.systolic,
              diastolic: bp.diastolic || prev.stats.bloodPressure.diastolic,
              trend: bpTrend,
              trendValue: bpTrendValue,
            },
          },
        }));
      }

      // Process Garmin data (steps)
      if (garminResult.status === 'fulfilled' && garminResult.value) {
        const garmin = garminResult.value;
        setDashboardData(prev => ({
          ...prev,
          stats: {
            ...prev.stats,
            steps: {
              value: garmin.steps || prev.stats.steps.value,
              unit: 'steps',
              trend: garmin.steps > 8000 ? 'up' : 'down',
              trendValue: garmin.steps > 8000 ? `${((garmin.steps - 8000) / 1000).toFixed(1)}k` : '',
            },
          },
        }));
      }

      // Process login streak
      if (streakResult.status === 'fulfilled' && streakResult.value) {
        const streak = streakResult.value;
        setDashboardData(prev => ({
          ...prev,
          stats: {
            ...prev.stats,
            streak: {
              value: streak.currentStreak || 0,
              unit: 'days',
            },
          },
        }));
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading dashboard:', err);
      notify('Failed to load dashboard data', { tone: 'error' });
      setLoading(false);
    }
  };

  // Remove a food log directly from the dashboard.
  //
  // Bug this fixes: this used to be one tap with nothing to undo, while
  // logging a food always shipped an in-toast Undo (useFoodLogging.js). The
  // asymmetry meant an accidental swipe/tap here was permanent. Undo re-logs
  // the item via the same `logItems()` the search box's own undo calls — it
  // lands as a new log (a REST delete can't hand back the old id), but it
  // reads and totals identically to the row that was removed.
  const handleRemoveFood = async (logId) => {
    if (!logId) return;
    // Snapshot before it's gone; the dashboard's `foods` projection
    // (name/brand/calories only) isn't enough to reconstruct a log.
    const log = logsById[logId];
    const food_item = log?.food_item || log?.food_item_id;

    // Mark as removing so the row fades out
    setRemovingLogIds((prev) => new Set(prev).add(logId));
    try {
      await fitnessGeekService.deleteFoodLog(logId);
      // Give the fade-out a beat to play, then reload
      setTimeout(() => {
        loadDashboardData();
        setRemovingLogIds((prev) => {
          const next = new Set(prev);
          next.delete(logId);
          return next;
        });
      }, 220);

      if (food_item) {
        notify(`Deleted ${food_item.name || 'item'}`, {
          tone: 'info',
          action: (
            <Button
              size="small"
              sx={{ color: 'inherit', fontWeight: 700 }}
              onClick={async () => {
                await logItems(
                  [{ ...food_item, servings: log?.servings, nutrition: log?.nutrition }],
                  log?.meal_type
                );
                loadDashboardData();
              }}
            >
              Undo
            </Button>
          )
        });
      }
    } catch (err) {
      console.error('Failed to remove food log:', err);
      notify('Could not remove that item. Try again.', { tone: 'error' });
      setRemovingLogIds((prev) => {
        const next = new Set(prev);
        next.delete(logId);
        return next;
      });
    }
  };

  // Stat accents from the theme, not hex literals: a hex tuned for light
  // paper drifts in dark mode. The icon sits on a 10-20% tint of this colour,
  // and StatCard measures it against that tint (readableOn, 3:1 for a
  // graphical object), so these only pick the hue.
  const statTone = {
    weight: theme.palette.primary.main,
    bp: theme.palette.error.main,
    steps: theme.palette.success.main,
    streak: theme.palette.warning.main,
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3, md: 4 }, px: { xs: 2, sm: 3 } }}>
        <Box sx={{ mb: { xs: 2.5, md: 3 } }}>
          <SectionLabel sx={{ mb: 0.75 }}>Today's Log</SectionLabel>
          <DisplayHeading size="page">{greeting}.</DisplayHeading>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <SurfaceSkeleton variant="ticket" rows={4} showHeader={false} height={280} />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
              gap: 1.5,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <SurfaceSkeleton key={i} rows={1} showHeader={false} />
            ))}
          </Box>
          <SurfaceSkeleton rows={4} showHeader />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3, md: 4 }, px: { xs: 2, sm: 3 } }}>
      {/* Editorial header — serif greeting */}
      <Box sx={{ mb: { xs: 2.5, md: 3 } }}>
        <SectionLabel sx={{ mb: 0.75 }}>Today's Log</SectionLabel>
        <DisplayHeading size="page">{greeting}.</DisplayHeading>
      </Box>

      {/* Dashboard Grid */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

        {/* Is the calorie target trustworthy? (plan D2) — renders nothing
            when there is no plan or nothing to say. */}
        <PlanAccuracyBanner nutritionGoal={nutritionGoal} scanBmr={scanBmr} />

        {/* ─── Daily Ticket — the editorial hero ─── */}
        <DailyTicket
          consumed={dashboardData.calories.consumed}
          goal={dashboardData.calories.goal}
          remaining={dashboardData.calories.remaining}
          greeting="Today's Intake"
          protein={dashboardData.macros.protein}
          carbs={dashboardData.macros.carbs}
          fat={dashboardData.macros.fat}
          mode={mode}
          netCarbsConsumed={dashboardData.netCarbs?.consumed ?? 0}
          netCarbLimit={netCarbLimit}
          proteinNote={proteinBasis === 'lean_mass' ? 'from lean mass' : null}
        />

        {/* Stat Cards — 4-up row */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 1.5,
          }}
        >
          <StatCard
            icon={WeightIcon}
            label="Weight"
            value={dashboardData.stats.weight.value ?? '--'}
            unit={dashboardData.stats.weight.unit}
            caption={dashboardData.stats.weight.caption}
            plainValue
            color={statTone.weight}
            delay={40}
          />
          <StatCard
            icon={BPIcon}
            label="BP"
            value={dashboardData.stats.bloodPressure.systolic ? `${dashboardData.stats.bloodPressure.systolic}/${dashboardData.stats.bloodPressure.diastolic}` : '--'}
            unit="mmHg"
            trend={dashboardData.stats.bloodPressure.trend}
            trendValue={dashboardData.stats.bloodPressure.trendValue}
            color={statTone.bp}
            delay={80}
          />
          <StatCard
            icon={StepsIcon}
            label="Steps"
            value={dashboardData.stats.steps.value?.toLocaleString() ?? '--'}
            trend={dashboardData.stats.steps.trend}
            trendValue={dashboardData.stats.steps.trendValue}
            color={statTone.steps}
            delay={120}
          />
          <StatCard
            icon={StreakIcon}
            label="Streak"
            value={dashboardData.stats.streak.value}
            unit="days"
            color={statTone.streak}
            delay={160}
          />
        </Box>

        {/* Quick Actions — first on mobile, original position on desktop */}
        <Surface sx={{ py: 1.5, order: { xs: -1, md: 0 } }}>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' },
            gap: 1
          }}>
            <QuickActionButton
              icon={AddIcon}
              label="Food"
              to="/food-log"
              variant="contained"
              compact
            />
            <QuickActionButton
              icon={WeightIcon}
              label="Weight"
              to="/weight"
              variant="outlined"
              compact
            />
            <QuickActionButton
              icon={BPIcon}
              label="BP"
              to="/blood-pressure"
              variant="outlined"
              compact
            />
            <QuickActionButton
              icon={MedsIcon}
              label="Meds"
              to="/medications"
              variant="outlined"
              compact
            />
          </Box>
        </Surface>

        {/* Today's Meals */}
        <Surface sx={{ py: 1.5 }}>
          <Box sx={{ mb: 1 }}>
            <SectionLabel>Today's Meals</SectionLabel>
          </Box>
          {dashboardData.meals.map((meal, index) => (
            <MealCard
              key={index}
              mealType={meal.type}
              foods={meal.foods}
              totalCalories={meal.totalCalories}
              onRemoveFood={handleRemoveFood}
              removingIds={removingLogIds}
            />
          ))}
        </Surface>

        {/* AI Insights */}
        <AIInsightsCard />
      </Box>
    </Container>
  );
};

export default DashboardNew;
