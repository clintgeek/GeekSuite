import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Container, Button, Typography } from '@mui/material';
import {
  MonitorWeight as WeightIcon,
  MonitorHeart as BPIcon,
  DirectionsWalk as StepsIcon,
  Whatshot as StreakIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useToast } from '@geeksuite/ui';

import StatCard from '../components/Dashboard/StatCard.jsx';
import AIInsightsCard from '../components/Dashboard/AIInsightsCard.jsx';
import PlanAccuracyBanner from '../components/Dashboard/PlanAccuracyBanner.jsx';
import { weightStatView } from '../components/Dashboard/weightStatView.js';
import { Surface, SurfaceSkeleton } from '../components/primitives';
import PlateRing from '../components/Home/PlateRing.jsx';
import MealCards from '../components/Home/MealCards.jsx';
import MacroStrip from '../components/Home/MacroStrip.jsx';
import TodayStrip from '../components/Home/TodayStrip.jsx';
import MedsChecklist from '../components/Home/MedsChecklist.jsx';
import FirstRun from '../components/Home/FirstRun.jsx';
import AddFoodDialog from '../components/FoodLog/AddFoodDialog.jsx';

import { fitnessGeekService } from '../services/fitnessGeekService.js';
import { goalsService } from '../services/goalsService.js';
import { weightService } from '../services/weightService.js';
import { bpService } from '../services/bpService.js';
import { streakService } from '../services/streakService.js';
import { settingsService } from '../services/settingsService.js';
import { bodyCompService } from '../services/bodyCompService.js';
import { useFoodLogging } from '../hooks/useFoodLogging.js';
import { useMedsToday } from '../hooks/useMedsToday.js';
import { useExperience } from '../contexts/ExperienceContext.jsx';
import { todayStrip } from '../utils/checkIns.js';
import { caloriesSentence, greetingFor, mealTypeForHour } from '../utils/plainWords.js';
import { MEAL_ORDER } from '../theme/theme.jsx';

/**
 * Home — "how am I doing today?", answered in words
 * (DOCS/SIMPLE_AND_FULL_PLAN.md items 1, 5, 6).
 *
 * Both faces share the top: a greeting, the plate ("You have 660 calories
 * left today"), the Today strip, and four meal cards whose "+ Add" opens the
 * add sheet already set to that meal. Simple (designed around Heather) stops
 * there and adds "Did you take your meds?". Full (Chef) keeps everything the
 * old dashboard had — the plan banner, macros, keto, the weight / BP / steps /
 * streak cards, removing a food with Undo, and the insights card — just
 * calmer: no day-of-year counter, no truncated date, no ALL-CAPS labels.
 *
 * A Simple person who never chose a mode sees the three-step first run once.
 */

// Wraps a service call so a missing method (or a sync throw) lands in
// allSettled as a rejection instead of escaping it.
const safe = (fn) => Promise.resolve().then(fn);
const rowsOf = (res) => {
  const d = res?.data ?? res;
  return Array.isArray(d) ? d : [];
};

const DashboardNew = () => {
  const { notify } = useToast();
  const theme = useTheme();
  const experience = useExperience();
  const { isSimple, firstRunDone, savedMode, displayName, completeFirstRun } = experience;

  const today = fitnessGeekService.formatDate(new Date());
  const [loading, setLoading] = useState(true);
  const [removingLogIds, setRemovingLogIds] = useState(new Set());
  const [logsById, setLogsById] = useState({});
  const [nutritionGoal, setNutritionGoal] = useState(null);
  const [scanBmr, setScanBmr] = useState(null);
  const [proteinBasis, setProteinBasis] = useState(null);
  const [addMeal, setAddMeal] = useState(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [checkIns, setCheckIns] = useState({ weights: [], bloodPressures: [] });
  const [data, setData] = useState({
    calories: { consumed: 0, goal: 0 },
    netCarbs: 0,
    macros: {
      protein: { current: 0, goal: 150 },
      carbs: { current: 0, goal: 250 },
      fat: { current: 0, goal: 65 },
    },
    stats: {
      weight: { value: '--', unit: '', caption: '' },
      bloodPressure: { systolic: null, diastolic: null, trend: null, trendValue: '' },
      steps: { value: null, trend: null, trendValue: '' },
      streak: { value: 0 },
    },
    meals: {},
  });
  const medsRef = useRef(null);
  // The load must not re-run because a toast function changed identity.
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const meds = useMedsToday(today);

  const loadDashboardData = useCallback(async () => {
    try {
      const [summaryResult, goalsResult, weightResult, bpResult, garminResult, logsResult, streakResult, weightsResult, bpsResult] =
        await Promise.allSettled([
          safe(() => fitnessGeekService.getDailySummary(today)),
          safe(() => goalsService.getDerivedMacros()),
          safe(() => weightService.getWeightStats()),
          safe(() => bpService.getCurrentBP()),
          // `today` (local) — NOT the no-argument form: the containers run
          // UTC, and an evening dashboard asked Garmin about tomorrow.
          safe(() => fitnessGeekService.getGarminDaily(today)),
          safe(() => fitnessGeekService.getLogsForDate(today)),
          safe(() => streakService.getLoginStreak()),
          safe(() => weightService.getWeightLogs()),
          safe(() => bpService.getBPLogs()),
        ]);

      const value = (r) => (r.status === 'fulfilled' ? r.value : null);

      setCheckIns({
        weights: rowsOf(value(weightsResult)),
        bloodPressures: rowsOf(value(bpsResult)),
      });

      const foodLogs = rowsOf(value(logsResult));
      const rawById = {};
      const meals = Object.fromEntries(MEAL_ORDER.map((m) => [m, { foods: [], calories: 0 }]));
      for (const log of foodLogs) {
        const id = log._id || log.id;
        if (id) rawById[id] = log;
        const mealType = meals[log.meal_type] ? log.meal_type : 'snack';
        const food = log.food_item_id || log.food_item || {};
        const per = log.nutrition?.calories_per_serving || food.nutrition?.calories_per_serving || 0;
        const servings = log.servings || 1;
        meals[mealType].foods.push({ logId: id, name: food.name || 'Unknown food', calories: Math.round(per * servings) });
        meals[mealType].calories += per * servings;
      }
      setLogsById(rawById);

      const summary = value(summaryResult)?.data || value(summaryResult) || null;
      // The summary's own meal totals win when present (it is the stored day).
      if (summary?.meals) {
        for (const m of MEAL_ORDER) {
          if (Number.isFinite(summary.meals?.[m]?.calories)) meals[m].calories = summary.meals[m].calories;
        }
      }

      const derived = value(goalsResult);
      const payload = derived?.data || derived || null;
      const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? Math.round(v) : null);
      const todayTargets = payload?.today;
      setProteinBasis(payload?.rules?.protein_basis || null);

      const weight = value(weightResult)?.data ? weightStatView(value(weightResult).data) : null;
      const bp = value(bpResult);
      const garmin = value(garminResult);
      const streak = value(streakResult);

      setData((prev) => {
        const goal = num(todayTargets?.target_calories ?? todayTargets?.calories ?? payload?.calories?.daily)
          ?? (summary?.calorieGoal || prev.calories.goal);
        let bpTrend = 'normal';
        let bpTrendValue = '';
        if (bp && (bp.systolic >= 140 || bp.diastolic >= 90)) { bpTrend = 'up'; bpTrendValue = 'High'; }
        else if (bp && (bp.systolic < 90 || bp.diastolic < 60)) { bpTrend = 'down'; bpTrendValue = 'Low'; }
        return {
          calories: { consumed: summary?.totals?.calories || 0, goal: goal || 0 },
          netCarbs: summary?.totals?.net_carbs_grams || 0,
          macros: {
            protein: { current: summary?.totals?.protein_grams || 0, goal: num(todayTargets?.protein_g ?? payload?.fixed?.protein_g) ?? summary?.proteinGoal ?? 150 },
            carbs: { current: summary?.totals?.carbs_grams || 0, goal: num(todayTargets?.carbs_g) ?? summary?.carbsGoal ?? 250 },
            fat: { current: summary?.totals?.fat_grams || 0, goal: num(todayTargets?.fat_g ?? payload?.fixed?.fat_g) ?? summary?.fatGoal ?? 65 },
          },
          stats: {
            weight: weight || prev.stats.weight,
            bloodPressure: bp
              ? { systolic: bp.systolic, diastolic: bp.diastolic, trend: bpTrend, trendValue: bpTrendValue }
              : prev.stats.bloodPressure,
            steps: garmin?.steps
              ? { value: garmin.steps, trend: garmin.steps > 8000 ? 'up' : 'down', trendValue: garmin.steps > 8000 ? `${((garmin.steps - 8000) / 1000).toFixed(1)}k` : '' }
              : prev.stats.steps,
            streak: { value: streak?.currentStreak || 0 },
          },
          meals,
        };
      });
    } catch (err) {
      console.error('Error loading dashboard:', err);
      notifyRef.current("Couldn't load today. Try again in a moment.", { tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  // The plan and the scan BMR feed the banner; the plan's mode feeds keto.
  useEffect(() => {
    safe(() => settingsService.getSettings()).then((resp) => {
      const d = resp?.data || resp;
      setNutritionGoal(d?.nutrition_goal || null);
    }).catch(() => {});
    safe(() => bodyCompService.getSummary()).then((resp) => {
      const summary = resp?.data ?? resp;
      setScanBmr(summary?.bmr || null);
    }).catch(() => {});
  }, []);

  const { logItems, undoLogs, describeMeal, adjustLogCalories } = useFoodLogging({ date: today, onChanged: loadDashboardData });

  const handleRemoveFood = async (logId) => {
    if (!logId) return;
    const log = logsById[logId];
    const food_item = log?.food_item || log?.food_item_id;
    setRemovingLogIds((prev) => new Set(prev).add(logId));
    try {
      await fitnessGeekService.deleteFoodLog(logId);
      setTimeout(() => {
        loadDashboardData();
        setRemovingLogIds((prev) => {
          const next = new Set(prev);
          next.delete(logId);
          return next;
        });
      }, 220);
      if (food_item) {
        // Undo re-logs through the same `logItems` the add box uses.
        notify(`Removed ${food_item.name || 'item'}`, {
          tone: 'info',
          action: (
            <Button
              size="small"
              sx={{ color: 'inherit', fontWeight: 800 }}
              onClick={async () => {
                await logItems([{ ...food_item, servings: log?.servings, nutrition: log?.nutrition }], log?.meal_type);
              }}
            >
              Undo
            </Button>
          ),
        });
      }
    } catch (err) {
      console.error('Failed to remove food log:', err);
      notify("Couldn't remove that. Try again.", { tone: 'error' });
      setRemovingLogIds((prev) => {
        const next = new Set(prev);
        next.delete(logId);
        return next;
      });
    }
  };

  const mode = nutritionGoal?.mode || 'standard';
  const netCarbLimit = nutritionGoal?.keto?.net_carb_limit_g ?? 20;
  const hour = new Date().getHours();
  const greeting = `${greetingFor(hour)}${displayName ? `, ${displayName}` : ''}`;
  const sentence = caloriesSentence({ eaten: data.calories.consumed, goal: data.calories.goal });
  const byMeal = useMemo(() => Object.fromEntries(MEAL_ORDER.map((m) => [m, data.meals[m]?.calories || 0])), [data.meals]);
  const strip = todayStrip({
    weights: checkIns.weights,
    bloodPressures: checkIns.bloodPressures,
    meds: meds.loading ? null : { taken: meds.taken, total: meds.total },
    today,
  });

  const addDialog = (
    <AddFoodDialog
      open={Boolean(addMeal)}
      onClose={() => setAddMeal(null)}
      mealType={addMeal || 'snack'}
      onMealTypeChange={setAddMeal}
      onLogItems={logItems}
      onDescribe={describeMeal}
      onAdjustCalories={adjustLogCalories}
      onUndo={undoLogs}
      showBarcodeScanner={showBarcodeScanner}
      onShowBarcodeScanner={setShowBarcodeScanner}
      ketoMode={mode === 'keto'}
      date={today}
    />
  );

  // ── First run: Simple, never chose, never finished it ──────────────
  if (!experience.loading && isSimple && !savedMode && !firstRunDone) {
    const firstMeal = mealTypeForHour(hour);
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 3 } }}>
        <FirstRun
          suggestedName={displayName || ''}
          mealType={firstMeal}
          onFinish={(answers) => completeFirstRun(answers)}
          onTryLogging={async (answers) => {
            await completeFirstRun(answers);
            setAddMeal(firstMeal);
          }}
        />
        {addDialog}
      </Container>
    );
  }

  // The day, in full words, under the greeting — never "Friday, Septem…".
  const heading = (
    <Box>
      <Typography component="h1" sx={{ fontSize: { xs: isSimple ? '1.875rem' : '1.625rem', sm: '2.25rem' }, fontWeight: 800, lineHeight: 1.15 }}>
        {greeting}
      </Typography>
      <Typography sx={{ mt: 0.25, fontSize: '1.0625rem', color: 'text.secondary', fontWeight: 600 }}>
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </Typography>
    </Box>
  );

  if (loading || experience.loading) {
    return (
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3, md: 4 }, px: { xs: 2, sm: 3 } }}>
        <Box sx={{ mb: 2.5 }}>{heading}</Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} aria-busy="true">
          <SurfaceSkeleton rows={3} showHeader={false} height={240} />
          <SurfaceSkeleton rows={2} showHeader={false} height={200} />
        </Box>
      </Container>
    );
  }

  const statTone = {
    weight: theme.palette.primary.main,
    bp: theme.palette.error.main,
    steps: theme.palette.success.main,
    streak: theme.palette.warning.main,
  };

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3, md: 4 }, px: { xs: 2, sm: 3 }, pb: { xs: 4, md: 6 } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2, sm: 2.5 } }}>
        {heading}

        {!isSimple && <PlanAccuracyBanner nutritionGoal={nutritionGoal} scanBmr={scanBmr} />}

        {/* The one question, answered: a plate and a sentence. */}
        <Surface
          data-testid="home-hero"
          sx={{
            borderRadius: '28px',
            p: { xs: 2.5, sm: 3.5 },
            boxShadow: theme.palette.mode === 'dark'
              ? '0 18px 40px -24px rgba(0,0,0,0.9)'
              : '0 18px 40px -28px rgba(92,64,32,0.45)',
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: { xs: 2, sm: 4 } }}>
            <PlateRing
              eaten={data.calories.consumed}
              goal={data.calories.goal}
              byMeal={byMeal}
              size={isSimple ? 200 : 180}
              label={`${sentence.headline}. ${sentence.detail}.`}
            />
            <Box sx={{ minWidth: 0, textAlign: { xs: 'center', sm: 'left' } }}>
              <Typography component="h2" data-testid="calories-sentence" sx={{ fontSize: { xs: '1.625rem', sm: '2rem' }, fontWeight: 800, lineHeight: 1.2 }}>
                {sentence.headline}
              </Typography>
              <Typography sx={{ mt: 0.75, fontSize: '1.125rem', color: 'text.secondary' }}>{sentence.detail}</Typography>
            </Box>
          </Box>
          {!isSimple && (
            <Box sx={{ mt: 3, pt: 2.5, borderTop: `1px solid ${theme.palette.divider}` }}>
              <MacroStrip
                protein={data.macros.protein}
                carbs={data.macros.carbs}
                fat={data.macros.fat}
                mode={mode}
                netCarbsConsumed={data.netCarbs}
                netCarbLimit={netCarbLimit}
                proteinNote={proteinBasis === 'lean_mass' ? 'from lean mass' : null}
              />
            </Box>
          )}
        </Surface>

        <TodayStrip
          items={strip}
          onMedsClick={isSimple ? () => medsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : undefined}
        />

        <Box component="section" aria-labelledby="todays-meals">
          <Typography id="todays-meals" component="h2" sx={{ fontSize: '1.375rem', fontWeight: 800, mb: 1.5 }}>
            Today&apos;s meals
          </Typography>
          <MealCards
            meals={data.meals}
            compact={isSimple}
            onAdd={setAddMeal}
            onRemove={isSimple ? undefined : handleRemoveFood}
            removingIds={removingLogIds}
          />
        </Box>

        {isSimple && meds.total > 0 && (
          <Surface ref={medsRef} sx={{ borderRadius: '24px', scrollMarginTop: 88 }}>
            <MedsChecklist
              items={meds.items}
              taken={meds.taken}
              total={meds.total}
              onToggle={meds.toggle}
              saving={meds.saving}
              error={meds.error}
            />
          </Surface>
        )}

        {!isSimple && (
          <Box
            component="section"
            aria-label="Your numbers"
            sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}
          >
            <StatCard
              icon={WeightIcon}
              label="Weight"
              value={data.stats.weight.value ?? '--'}
              unit={data.stats.weight.unit}
              caption={data.stats.weight.caption}
              plainValue
              color={statTone.weight}
              delay={40}
            />
            <StatCard
              icon={BPIcon}
              label="Blood pressure"
              value={data.stats.bloodPressure.systolic ? `${data.stats.bloodPressure.systolic}/${data.stats.bloodPressure.diastolic}` : '--'}
              unit="mmHg"
              trend={data.stats.bloodPressure.trend}
              trendValue={data.stats.bloodPressure.trendValue}
              color={statTone.bp}
              delay={80}
            />
            <StatCard
              icon={StepsIcon}
              label="Steps"
              value={data.stats.steps.value?.toLocaleString() ?? '--'}
              trend={data.stats.steps.trend}
              trendValue={data.stats.steps.trendValue}
              color={statTone.steps}
              delay={120}
            />
            <StatCard
              icon={StreakIcon}
              label="Days in a row"
              value={data.stats.streak.value}
              unit="days"
              color={statTone.streak}
              delay={160}
            />
          </Box>
        )}

        {!isSimple && <AIInsightsCard />}
      </Box>
      {addDialog}
    </Container>
  );
};

export default DashboardNew;
