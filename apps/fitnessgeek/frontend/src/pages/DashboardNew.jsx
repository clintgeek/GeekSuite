import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Container, Button, Typography } from '@mui/material';
import {
  MonitorWeight as WeightIcon,
  MonitorHeart as BPIcon,
  DirectionsWalk as StepsIcon,
  Whatshot as StreakIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
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
import { useJustAdded } from '../components/FoodSearch/useJustAdded.jsx';

import { fitnessGeekService } from '../services/fitnessGeekService.js';
import { goalsService } from '../services/goalsService.js';
import { weightService } from '../services/weightService.js';
import { bpService } from '../services/bpService.js';
import { streakService } from '../services/streakService.js';
import { settingsService } from '../services/settingsService.js';
import { bodyCompService } from '../services/bodyCompService.js';
import { useFoodLogging } from '../hooks/useFoodLogging.js';
import { useMedsToday } from '../hooks/useMedsToday.js';
import { useToday } from '../hooks/useToday.js';
import { useExperience } from '../contexts/ExperienceContext.jsx';
import { newestReading, todayStrip } from '../utils/checkIns.js';
import { errorMessage } from '../utils/errorMessage.js';
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
 * A Simple person who hasn't finished it sees the three-step first run once —
 * never while their saved settings couldn't be read (`experience.known`).
 *
 * "Today" comes from useToday(): an installed PWA resumed in the morning is on
 * the new day — greeting, date, meals and meds — not the one it was opened on.
 *
 * A failed read is not an empty day (review L1). During a fleet restart, or on
 * a weak signal, the day's reads fail; Home used to turn that into "Nothing
 * logged yet today", empty cards and "Weigh in +", and the natural response
 * was to log breakfast again. Now each read that fails keeps what was on
 * screen for this day; one that never succeeded shows as unknown, never as
 * "nothing"; and one line in place of the plate sentence says so, with Try
 * again. Food Log does the same (loadProblem, B19).
 */

// The streak query answers through apiService's envelope: { success, data }.
const streakDays = (res) => {
  const body = res?.data ?? res;
  const n = Number(body?.currentStreak);
  return Number.isFinite(n) ? n : 0;
};

// The hour, re-read when the app comes back, so "Good morning" isn't still
// on screen at lunch after a resume.
function useHourNow() {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const check = () => setHour(new Date().getHours());
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    const timer = setInterval(check, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      clearInterval(timer);
    };
  }, []);
  return hour;
}

// "2026-10-16" → "Friday, October 16", built at local noon so it never slips a day.
const longDay = (day) => {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

// Wraps a service call so a missing method (or a sync throw) lands in
// allSettled as a rejection instead of escaping it.
const safe = (fn) => Promise.resolve().then(fn);
const rowsOf = (res) => {
  const d = res?.data ?? res;
  return Array.isArray(d) ? d : [];
};

export const HOME_LOAD_PROBLEM = "Can't reach FitnessGeek right now. What you logged is safe.";

// The landed meal's card, scrolled into view once the sheet has gone (review
// L12) — after a frame, so the reload has had its chance to fill it.
const showMealCard = (mealType) => {
  if (!mealType || typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    document.getElementById(`meal-card-${mealType}`)
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  });
};

const DashboardNew = () => {
  const { notify } = useToast();
  const theme = useTheme();
  const experience = useExperience();
  const { isSimple, firstRunDone, displayName, completeFirstRun } = experience;
  const navigate = useNavigate();

  const today = useToday();
  const hour = useHourNow();
  const [loading, setLoading] = useState(true);
  const [removingLogIds, setRemovingLogIds] = useState(new Set());
  const [logsById, setLogsById] = useState({});
  const [nutritionGoal, setNutritionGoal] = useState(null);
  const [scanBmr, setScanBmr] = useState(null);
  const [proteinBasis, setProteinBasis] = useState(null);
  const [addMeal, setAddMeal] = useState(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  // null = couldn't be read, and nothing from before (todayStrip leaves it out).
  const [checkIns, setCheckIns] = useState({ weights: null, bloodPressures: null });
  // Which of the day's reads have succeeded for `known.day`. A read that
  // fails keeps the last good value for the same day; one that has never
  // succeeded is unknown, and Home never draws "nothing" from it.
  const [known, setKnown] = useState({ day: null, logs: false, summary: false, goals: false });
  const [loadProblem, setLoadProblem] = useState(false);
  // The day the data on screen belongs to; a failed read keeps it only for that day.
  const shownDayRef = useRef(null);
  const [retrying, setRetrying] = useState(false);
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
      const [summaryResult, goalsResult, weightResult, garminResult, logsResult, streakResult, weightsResult, bpsResult] =
        await Promise.allSettled([
          safe(() => fitnessGeekService.getDailySummary(today)),
          safe(() => goalsService.getDerivedMacros()),
          safe(() => weightService.getWeightStats()),
          // `today` (local) — NOT the no-argument form: the containers run
          // UTC, and an evening dashboard asked Garmin about tomorrow.
          safe(() => fitnessGeekService.getGarminDaily(today)),
          safe(() => fitnessGeekService.getLogsForDate(today)),
          safe(() => streakService.getLoginStreak()),
          safe(() => weightService.getWeightLogs()),
          safe(() => bpService.getBPLogs()),
        ]);

      const value = (r) => (r.status === 'fulfilled' ? r.value : null);
      const ok = (r) => r.status === 'fulfilled';
      const logsOk = ok(logsResult);
      const summaryOk = ok(summaryResult);
      const goalsOk = ok(goalsResult);

      // What's on screen is this day's: a failed read may keep it. Yesterday's
      // meals are never shown as today's.
      const sameDay = shownDayRef.current === today;
      shownDayRef.current = today;

      // A failed check-in read keeps what this day already showed (null if
      // nothing), so a blip never turns "Weighed ✓" into "Weigh in +".
      setCheckIns((prev) => ({
        weights: ok(weightsResult) ? rowsOf(value(weightsResult)) : (sameDay ? prev.weights : null),
        bloodPressures: ok(bpsResult) ? rowsOf(value(bpsResult)) : (sameDay ? prev.bloodPressures : null),
      }));
      setKnown((prev) => {
        const same = prev.day === today;
        return {
          day: today,
          logs: logsOk || (same && prev.logs),
          summary: summaryOk || (same && prev.summary),
          goals: goalsOk || (same && prev.goals),
        };
      });
      // The reads that decide what the plate and the cards say.
      setLoadProblem(!logsOk || !summaryOk || !goalsOk);

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
        // Servings ride along, so the card can say "Egg ×2" (review L4).
        meals[mealType].foods.push({ logId: id, name: food.name || 'Unknown food', calories: Math.round(per * servings), servings });
        meals[mealType].calories += per * servings;
      }
      if (logsOk) setLogsById(rawById);

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
      // The newest reading by when it was taken, not the first row of the day.
      const bp = newestReading(rowsOf(value(bpsResult)));
      const garmin = value(garminResult);
      const streak = value(streakResult);

      setData((prev) => {
        // A failed read keeps the last good value, for this day only.
        const keep = (isOk, fresh, old, empty) => (isOk ? fresh : sameDay ? old : empty);
        const goal = goalsOk
          ? num(todayTargets?.target_calories ?? todayTargets?.calories ?? payload?.calories?.daily) ?? (summary?.calorieGoal || prev.calories.goal)
          : (summary?.calorieGoal || (sameDay ? prev.calories.goal : 0));
        let bpTrend = 'normal';
        let bpTrendValue = '';
        if (bp && (bp.systolic >= 140 || bp.diastolic >= 90)) { bpTrend = 'up'; bpTrendValue = 'High'; }
        else if (bp && (bp.systolic < 90 || bp.diastolic < 60)) { bpTrend = 'down'; bpTrendValue = 'Low'; }
        const freshMacros = {
          protein: { current: summary?.totals?.protein_grams || 0, goal: num(todayTargets?.protein_g ?? payload?.fixed?.protein_g) ?? summary?.proteinGoal ?? 150 },
          carbs: { current: summary?.totals?.carbs_grams || 0, goal: num(todayTargets?.carbs_g) ?? summary?.carbsGoal ?? 250 },
          fat: { current: summary?.totals?.fat_grams || 0, goal: num(todayTargets?.fat_g ?? payload?.fixed?.fat_g) ?? summary?.fatGoal ?? 65 },
        };
        return {
          calories: { consumed: keep(summaryOk, summary?.totals?.calories || 0, prev.calories.consumed, 0), goal: goal || 0 },
          netCarbs: keep(summaryOk, summary?.totals?.net_carbs_grams || 0, prev.netCarbs, 0),
          macros: keep(summaryOk, freshMacros, prev.macros, freshMacros),
          stats: {
            weight: weight || prev.stats.weight,
            bloodPressure: bp
              ? { systolic: bp.systolic, diastolic: bp.diastolic, trend: bpTrend, trendValue: bpTrendValue }
              : prev.stats.bloodPressure,
            steps: garmin?.steps
              ? { value: garmin.steps, trend: garmin.steps > 8000 ? 'up' : 'down', trendValue: garmin.steps > 8000 ? `${((garmin.steps - 8000) / 1000).toFixed(1)}k` : '' }
              : prev.stats.steps,
            streak: { value: streakDays(streak) },
          },
          meals: keep(logsOk, meals, prev.meals, {}),
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

  const { logItems, undoLogs, describeMeal, adjustLogCalories, updateLog, setLogCalories } = useFoodLogging({ date: today, onChanged: loadDashboardData });
  // Full: a clean describe closes the sheet and leaves a "Just added" strip on the meal card.
  const justAdded = useJustAdded({ setLogCalories, describeMeal, undoLogs });

  const handleRemoveFood = async (logId) => {
    if (!logId) return;
    const log = logsById[logId];
    const food_item = log?.food_item || log?.food_item_id;
    setRemovingLogIds((prev) => new Set(prev).add(logId));
    try {
      await fitnessGeekService.deleteFoodLog(logId);
      justAdded.forget(logId);
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
      notify(errorMessage(err, "Couldn't remove that. Try again."), { tone: 'error' });
      setRemovingLogIds((prev) => {
        const next = new Set(prev);
        next.delete(logId);
        return next;
      });
    }
  };

  const mode = nutritionGoal?.mode || 'standard';
  const netCarbLimit = nutritionGoal?.keto?.net_carb_limit_g ?? 20;
  const greeting = `${greetingFor(hour)}${displayName ? `, ${displayName}` : ''}`;
  const sentence = caloriesSentence({ eaten: data.calories.consumed, goal: data.calories.goal });
  // The first run asked her goal; "lose a little" with no target gets the one
  // step that helps, not "No daily target is set" (review Phase 2.14) — but
  // only when the target was actually read, never off a failed read.
  const offerTarget = !loadProblem && known.goals && !(data.calories.goal > 0) && experience.goal === 'lose';
  const retryLoad = async () => {
    setRetrying(true);
    try { await loadDashboardData(); } finally { setRetrying(false); }
  };
  const detailText = offerTarget ? 'A daily target makes losing a little easier.' : sentence.detail;
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
      onClose={({ mealType } = {}) => {
        setAddMeal(null);
        showMealCard(mealType);
      }}
      mealType={addMeal || 'snack'}
      onMealTypeChange={setAddMeal}
      onLogItems={logItems}
      onDescribe={describeMeal}
      onAdjustCalories={adjustLogCalories}
      onUndo={undoLogs}
      onUpdateLog={updateLog}
      onSetCalories={setLogCalories}
      onJustAdded={justAdded.show}
      showBarcodeScanner={showBarcodeScanner}
      onShowBarcodeScanner={setShowBarcodeScanner}
      ketoMode={mode === 'keto'}
      date={today}
    />
  );

  // A failed first-run save says so; it used to vanish without a word.
  const finishFirstRun = async (answers) => {
    const result = await completeFirstRun(answers);
    if (result && result.ok === false) {
      notify(errorMessage(result.error, "Couldn't save that. Try again."), { tone: 'error' });
    }
    return result;
  };

  // ── First run: Simple, never finished it, and we actually know that ──
  // A derived mode is saved now (ExperienceContext), so "never chose" can't
  // be the test; first_run_done is.
  if (!experience.loading && experience.known !== false && isSimple && !firstRunDone) {
    const firstMeal = mealTypeForHour(hour);
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 3 } }}>
        <FirstRun
          suggestedName={displayName || ''}
          mealType={firstMeal}
          onFinish={finishFirstRun}
          onTryLogging={async (answers) => {
            await finishFirstRun(answers);
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
        {longDay(today)}
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

        {/* Simple: the one thing she came to do, first and above the fold —
            even with Larger text (review Phase 2.13). It opens the add sheet
            on the meal for this hour. */}
        {isSimple && (
          <Button
            variant="contained"
            size="large"
            fullWidth
            data-testid="what-did-you-eat"
            onClick={() => setAddMeal(mealTypeForHour(hour))}
            sx={{ minHeight: 64, borderRadius: '20px', fontSize: '1.25rem', fontWeight: 800, textTransform: 'none' }}
          >
            What did you eat?
          </Button>
        )}

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
          <Box
            sx={{
              display: 'flex',
              // Simple: a smaller plate beside the sentence, so the page is
              // short enough for "What did you eat?" and the meals to show.
              flexDirection: isSimple ? 'row' : { xs: 'column', sm: 'row' },
              alignItems: 'center',
              gap: isSimple ? 2 : { xs: 2, sm: 4 },
            }}
          >
            <PlateRing
              eaten={data.calories.consumed}
              goal={data.calories.goal}
              byMeal={byMeal}
              size={isSimple ? 104 : 180}
              // Full: "72%" in the well; the sentence already says what's left.
              showNumber={!isSimple && !loadProblem}
              centre="percent"
              label={loadProblem ? HOME_LOAD_PROBLEM : `${sentence.headline}. ${detailText}.`}
            />
            <Box sx={{ minWidth: 0, textAlign: isSimple ? 'left' : { xs: 'center', sm: 'left' } }}>
              {loadProblem ? (
                // In place of the sentence: never "Nothing logged yet" from a failed read.
                <Box role="status" data-testid="home-load-problem">
                  <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.35 }}>
                    {HOME_LOAD_PROBLEM}
                  </Typography>
                  <Button
                    variant="outlined"
                    onClick={retryLoad}
                    disabled={retrying}
                    sx={{ mt: 1.25, minHeight: 48, borderRadius: '999px', fontWeight: 800, textTransform: 'none' }}
                  >
                    {retrying ? 'Trying…' : 'Try again'}
                  </Button>
                </Box>
              ) : (
                <>
                  <Typography component="h2" data-testid="calories-sentence" sx={{ fontSize: isSimple ? { xs: '1.375rem', sm: '1.75rem' } : { xs: '1.625rem', sm: '2rem' }, fontWeight: 800, lineHeight: 1.2 }}>
                    {sentence.headline}
                  </Typography>
                  <Typography sx={{ mt: 0.75, fontSize: '1.125rem', color: 'text.secondary' }}>{detailText}</Typography>
                </>
              )}
              {offerTarget && (
                <Button
                  variant="outlined"
                  data-testid="set-daily-target"
                  // Simple: the one-screen "How fast?" form; Full: the whole plan.
                  onClick={() => navigate(isSimple ? '/calorie-wizard?quick=1' : '/calorie-wizard')}
                  sx={{ mt: 1.5, minHeight: 48, borderRadius: '999px', fontWeight: 800, textTransform: 'none' }}
                >
                  Set your daily target
                </Button>
              )}
            </Box>
          </Box>
          {!isSimple && known.summary && (
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
            date={today}
            justAdded={justAdded}
            unknown={!known.logs}
          />
        </Box>

        {/* No medications yet: a quiet way in, so she can start. */}
        {isSimple && !meds.loading && !meds.loadError && meds.total === 0 && (
          <Box>
            <Button
              component={RouterLink}
              to="/medications"
              variant="text"
              data-testid="track-meds"
              sx={{ minHeight: 48, fontWeight: 700, textTransform: 'none', fontSize: '1.0625rem' }}
            >
              Track your meds
            </Button>
          </Box>
        )}

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
