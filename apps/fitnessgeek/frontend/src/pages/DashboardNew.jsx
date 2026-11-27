import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';

import StatCard from '../components/Dashboard/StatCard.jsx';
import AIInsightsCard from '../components/Dashboard/AIInsightsCard.jsx';
import PlanAccuracyBanner from '../components/Dashboard/PlanAccuracyBanner.jsx';
import { weightStatView } from '../components/Dashboard/weightStatView.js';
import { Surface, SurfaceSkeleton, Page, LabelPanel, FactHeadline, LabelBar, Rule, Tag } from '../components/primitives';
import MealCards from '../components/Home/MealCards.jsx';
import MacroStrip from '../components/Home/MacroStrip.jsx';
import TodayStrip from '../components/Home/TodayStrip.jsx';
import MedsChecklist from '../components/Home/MedsChecklist.jsx';
import FirstRun from '../components/Home/FirstRun.jsx';
import AddFoodDialog from '../components/FoodLog/AddFoodDialog.jsx';
import { useJustAdded } from '../components/FoodSearch/useJustAdded.jsx';
import { UndoAction, UNDO_TOAST_MS, UNDONE_MESSAGE, UNDO_FAILED_MESSAGE } from '../components/FoodSearch/undoToast.jsx';

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
import { MEAL_ORDER, MEAL_LABELS, mealColors } from '../theme/theme.jsx';

/**
 * Home — "how am I doing today?", answered in words
 * (DOCS/SIMPLE_AND_FULL_PLAN.md items 1, 5, 6).
 *
 * Drawn as The Label (DOCS/THEME_REVIEW_2026-11.md): both faces share the
 * top — a greeting, the page's one filled button ("What did you eat?"), and
 * the "Today's Facts" panel ("You have 660 calories left today", the day's
 * calories by meal as one split bar, the check-ins in its foot) — then four
 * meal panels whose "+ Add" opens the add sheet already set to that meal.
 * Simple (designed around Heather) stops there and adds "Did you take your
 * meds?". Full (Chef) keeps everything the old dashboard had — the amount
 * left set huge, the "% of daily target" rows (macros, keto), the plan
 * footnote, the weight / BP / steps / streak rows, removing a food with
 * Undo, and the insights panel. From md up the facts panel sits left and the
 * meals fill a grid on the right.
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
// Indexes of the reads in `loadDashboardData` a food write can change: the
// day's summary (0) and its logs (4).
const FOOD_WRITE_READS = new Set([0, 4]);
// Newest weight / BP rows Home asks for. Today's check-ins and the latest
// reading are all it shows; a day never holds anywhere near this many.
const HOME_RECENT_ROWS = 20;
const rowsOf = (res) => {
  const d = res?.data ?? res;
  return Array.isArray(d) ? d : [];
};

export const HOME_LOAD_PROBLEM = 'Can’t reach FitnessGeek right now. What you logged is safe.';

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
  const { notify, dismiss } = useToast();
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
  // The add sheet: whether it's open, and which meal it's on. Two pieces on
  // purpose (L18): closing used to null the meal while the sheet was still
  // on its way out, the composer saw "snack", and the lunch draft moved to
  // snack — so reopening lunch showed an empty box. The meal now stays put
  // when the sheet closes.
  const [addOpen, setAddOpen] = useState(false);
  const [addMeal, setAddMealOnly] = useState('snack');
  const setAddMeal = useCallback((meal) => {
    if (!meal) { setAddOpen(false); return; }
    setAddMealOnly(meal);
    setAddOpen(true);
  }, []);
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
      weight: { value: '—', unit: '', caption: '' },
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

  // The last settled answer of every read, for this day. A food write can
  // change only the day's summary and its logs, so the refresh after one
  // re-asks those two and reuses the rest — it used to re-fire all eight,
  // five of them live Garmin calls (SUITE_REVIEW_2026-11 FitnessGeek #5).
  const lastReadsRef = useRef(null);

  const loadDashboardData = useCallback(async ({ foodOnly = false } = {}) => {
    try {
      const cached = foodOnly && lastReadsRef.current?.day === today ? lastReadsRef.current.results : null;
      const reads = [
        () => fitnessGeekService.getDailySummary(today),
        () => goalsService.getDerivedMacros(),
        () => weightService.getWeightStats(),
        // `today` (local) — NOT the no-argument form: the containers run
        // UTC, and an evening dashboard asked Garmin about tomorrow.
        () => fitnessGeekService.getGarminDaily(today),
        () => fitnessGeekService.getLogsForDate(today),
        () => streakService.getLoginStreak(),
        // Home needs the newest few only: "Weighed today", "BP today" and the
        // latest reading — not every row ever (review 2026-11 #1).
        () => weightService.getWeightLogs({ limit: HOME_RECENT_ROWS }),
        () => bpService.getBPLogs({ limit: HOME_RECENT_ROWS }),
      ];
      const reuse = (i) => cached && !FOOD_WRITE_READS.has(i);
      const settled = await Promise.allSettled(reads.map((fn, i) => (reuse(i) ? null : safe(fn))));
      const results = settled.map((r, i) => (reuse(i) ? cached[i] : r));
      lastReadsRef.current = { day: today, results };
      const [summaryResult, goalsResult, weightResult, garminResult, logsResult, streakResult, weightsResult, bpsResult] = results;

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
      notifyRef.current('Couldn’t load today. Try again in a moment.', { tone: 'error' });
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

  const reloadAfterFoodWrite = useCallback(() => loadDashboardData({ foodOnly: true }), [loadDashboardData]);
  const { logItems, undoLogs, describeMeal, adjustLogCalories, updateLog, setLogCalories } = useFoodLogging({ date: today, onChanged: reloadAfterFoodWrite });
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
        reloadAfterFoodWrite();
        setRemovingLogIds((prev) => {
          const next = new Set(prev);
          next.delete(logId);
          return next;
        });
      }, 220);
      if (food_item) {
        // Undo re-logs through the same `logItems` the add box uses, and
        // speaks the Food Log's undo grammar (undoToast.jsx): "Undone ✓", or
        // "Couldn’t undo — try again" with a retry. It used to be silent.
        const undoAndSay = async (toastId) => {
          const result = await logItems([{ ...food_item, servings: log?.servings, nutrition: log?.nutrition }], log?.meal_type).catch(() => null);
          dismiss?.(toastId);
          if ((result?.ok ?? 0) > 0) {
            notify(UNDONE_MESSAGE, { tone: 'info' });
            return;
          }
          let retryId = null;
          retryId = notify(UNDO_FAILED_MESSAGE, {
            tone: 'error',
            duration: UNDO_TOAST_MS,
            action: <UndoAction label="Try again" onUndo={() => undoAndSay(retryId)} />,
          });
        };
        let toastId = null;
        toastId = notify(`Removed ${food_item.name || 'that'}`, {
          tone: 'info',
          duration: UNDO_TOAST_MS,
          action: <UndoAction onUndo={() => undoAndSay(toastId)} />,
        });
      }
    } catch (err) {
      console.error('Failed to remove food log:', err);
      notify(errorMessage(err, 'Couldn’t remove that. Try again.'), { tone: 'error' });
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
    // Unknown ticks are "Meds ?", never "0 of 3" (review 2026-11 #3).
    meds: meds.loading ? null : { taken: meds.taken, total: meds.total, unknown: meds.ticksUnknown },
    today,
  });

  const addDialog = (
    <AddFoodDialog
      open={addOpen}
      onClose={({ mealType } = {}) => {
        setAddOpen(false);
        showMealCard(mealType);
      }}
      mealType={addMeal}
      onMealTypeChange={(meal) => meal && setAddMealOnly(meal)}
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
      notify(errorMessage(result.error, 'Couldn’t save that. Try again.'), { tone: 'error' });
    }
    return result;
  };

  // ── First run: Simple, never finished it, and we actually know that ──
  // A derived mode is saved now (ExperienceContext), so "never chose" can't
  // be the test; first_run_done is.
  if (!experience.loading && experience.known !== false && isSimple && !firstRunDone) {
    const firstMeal = mealTypeForHour(hour);
    return (
      <Page narrow>
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
      </Page>
    );
  }

  // The day, in full words, as the eyebrow over the greeting — never
  // "Friday, Septem…". On a desktop the top bar already says it, so it shows
  // once (review C6).
  const heading = (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        sx={{
          display: { xs: 'block', md: 'none' },
          fontSize: '0.8125rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'text.secondary',
        }}
      >
        {longDay(today)}
      </Typography>
      <Typography component="h1" sx={{ mt: 0.25, fontSize: { xs: isSimple ? '1.875rem' : '1.625rem', md: '2.25rem' }, fontWeight: 900, lineHeight: 1.1 }}>
        {greeting}
      </Typography>
    </Box>
  );

  if (loading || experience.loading) {
    return (
      <Page>
        {heading}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} aria-busy="true">
          <SurfaceSkeleton rows={3} showHeader={false} height={240} />
          <SurfaceSkeleton rows={2} showHeader={false} height={200} />
        </Box>
      </Page>
    );
  }

  const fmtN = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
  const eaten = data.calories.consumed;
  const goal = data.calories.goal;
  const hasGoal = goal > 0;
  const overBy = hasGoal && eaten > goal ? eaten - goal : 0;
  const mealsLogged = MEAL_ORDER.filter((m) => (data.meals[m]?.foods?.length || 0) > 0).length;

  // "Which meal ate my day": the day's calories by meal, in the four meal
  // colours, as one split bar (it replaces the plate ring). Measured against
  // the target; with none, against what was eaten.
  const scale = hasGoal ? goal : Math.max(eaten, 1);
  const segments = MEAL_ORDER.map((m) => ({ value: (byMeal[m] / scale) * 100, color: mealColors(m, theme.palette.mode).fill }));
  const byMealWords = MEAL_ORDER.filter((m) => byMeal[m] > 0).map((m) => `${MEAL_LABELS[m]} ${fmtN(byMeal[m])}`).join(', ');
  const barLabel = loadProblem
    ? HOME_LOAD_PROBLEM
    : `${sentence.headline}. ${detailText}.${byMealWords ? ` By meal: ${byMealWords} calories.` : ''}`;

  // In place of the numbers: never "Nothing logged yet" from a failed read.
  const problemBlock = (
    <Box role="status" data-testid="home-load-problem" sx={{ pt: 1 }}>
      <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.35 }}>
        {HOME_LOAD_PROBLEM}
      </Typography>
      <Button variant="outlined" onClick={retryLoad} disabled={retrying} sx={{ mt: 1.25, minHeight: 48, fontWeight: 700, textTransform: 'none' }}>
        {retrying ? 'Trying…' : 'Try again'}
      </Button>
    </Box>
  );

  const targetOffer = offerTarget && (
    <Button
      variant="outlined"
      data-testid="set-daily-target"
      // Simple: the one-screen "How fast?" form; Full: the whole plan.
      onClick={() => navigate(isSimple ? '/calorie-wizard?quick=1' : '/calorie-wizard')}
      sx={{ mt: 1.5, minHeight: 48, fontWeight: 700, textTransform: 'none' }}
    >
      Set your daily target
    </Button>
  );

  const checkInLinks = (
    <TodayStrip
      items={strip}
      sx={{ pt: 1.25 }}
      onMedsClick={isSimple ? () => medsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : undefined}
    />
  );

  // ── Today's Facts: the one main panel (The Label) ──
  // Full: the amount left set huge, the sentence under it in normal weight,
  // the by-meal bar, the "% of daily target" rows, the check-ins in the foot,
  // and the plan footnote last. Simple: the sentence set large, the bar, the
  // check-ins; no percent column, no macros.
  const factsPanel = isSimple ? (
    <LabelPanel level={1} title="Today’s Facts" data-testid="home-hero">
      {loadProblem ? problemBlock : (
        <Box sx={{ pt: 1 }}>
          <Typography data-testid="calories-sentence" sx={{ fontSize: { xs: '1.5rem', sm: '1.75rem' }, fontWeight: 800, lineHeight: 1.2 }}>
            {sentence.headline}
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: '1.125rem', color: 'text.secondary' }}>{detailText}</Typography>
        </Box>
      )}
      {targetOffer}
      <LabelBar segments={segments} label={barLabel} sx={{ mt: 1.5 }} />
      <Rule weight="medium" sx={{ mt: 1 }} />
      {checkInLinks}
    </LabelPanel>
  ) : (
    <LabelPanel
      level={1}
      title="Today’s Facts"
      data-testid="home-hero"
      meta={known.logs ? `${mealsLogged} ${mealsLogged === 1 ? 'meal' : 'meals'} logged` : null}
      metaRight={hasGoal ? <>Target <b>{fmtN(goal)}</b> cal</> : null}
    >
      {loadProblem ? problemBlock : (
        <>
          <FactHeadline
            caption={!hasGoal ? 'Eaten today' : overBy > 0 ? 'Over target today' : 'Amount left today'}
            name="Calories"
            value={(
              <Box component="span" data-testid="plate-number" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                {overBy > 0 && <Tag sx={{ fontSize: '0.875rem', letterSpacing: '0.04em' }}>Over</Tag>}
                {fmtN(!hasGoal ? eaten : overBy > 0 ? overBy : goal - eaten)}
              </Box>
            )}
          />
          {/* The answer in words, for a screen reader and a glance — normal
              weight, so the number isn't shouted twice. */}
          <Typography sx={{ mt: 0.75, fontSize: '1rem', lineHeight: 1.4 }}>
            <span data-testid="calories-sentence">{sentence.headline}</span>
            <Box component="span" sx={{ color: 'text.secondary' }}> · {detailText}</Box>
          </Typography>
        </>
      )}
      {targetOffer}
      <LabelBar segments={segments} label={barLabel} sx={{ mt: 1.25, mb: 0.75 }} />
      {known.summary && (
        <>
          <Rule weight="medium" />
          <MacroStrip
            calories={{ current: eaten, goal }}
            protein={data.macros.protein}
            carbs={data.macros.carbs}
            fat={data.macros.fat}
            mode={mode}
            netCarbsConsumed={data.netCarbs}
            netCarbLimit={netCarbLimit}
            proteinNote={proteinBasis === 'lean_mass' ? 'from lean mass' : null}
          />
        </>
      )}
      <Rule weight="medium" sx={{ mt: known.summary ? 0 : 0.5 }} />
      {checkInLinks}
      {/* The calorie-target warning and the scan-BMR offer: a footnote, not a
          banner above the panel, so the meals stay above the fold. */}
      <PlanAccuracyBanner
        nutritionGoal={nutritionGoal}
        scanBmr={scanBmr}
        sx={{ mt: 1.25, pt: 0.75, borderTop: `1px solid ${theme.palette.text.primary}` }}
      />
    </LabelPanel>
  );

  return (
    <Page>
      {/* The greeting, and the page's one filled button: "What did you eat?"
          opens the add sheet on this hour's meal. Full width on a phone, top
          right at its own width from md (UX review 2026-11, A1; Phase 2.13). */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'stretch', md: 'flex-end' },
          justifyContent: 'space-between',
          gap: { xs: 1.75, md: 2 },
        }}
      >
        {heading}
        <Button
          variant="contained"
          startIcon={<AddIcon aria-hidden />}
          data-testid={isSimple ? 'what-did-you-eat' : 'full-add-food'}
          onClick={() => setAddMeal(mealTypeForHour(hour))}
          sx={{
            minHeight: { xs: 56, md: 52 },
            width: { xs: '100%', md: 'auto' },
            px: { md: 3.5 },
            flexShrink: 0,
            fontSize: isSimple ? '1.25rem' : '1.125rem',
            fontWeight: 700,
            textTransform: 'none',
          }}
        >
          What did you eat?
        </Button>
      </Box>

      {/* Phone: one column. From md: the facts panel left (it stays in view),
          the meals and everything else right. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: 'minmax(0, 340px) minmax(0, 1fr)',
            lg: 'minmax(0, 400px) minmax(0, 1fr)',
          },
          gap: { xs: 1.75, md: 3 },
          alignItems: 'start',
        }}
      >
        <Box sx={{ position: { md: 'sticky' }, top: { md: 76 }, minWidth: 0 }}>
          {factsPanel}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1.75, md: 2.25 }, minWidth: 0 }}>
          <Box component="section" aria-labelledby="todays-meals">
            <Typography id="todays-meals" component="h2" sx={{ fontSize: '1.25rem', fontWeight: 900, mb: 1.25, scrollMarginTop: 88 }}>
              Today’s meals
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
            <Surface ref={medsRef} sx={{ scrollMarginTop: 88 }}>
              <MedsChecklist
                items={meds.items}
                taken={meds.taken}
                total={meds.total}
                onToggle={meds.toggle}
                saving={meds.saving}
                error={meds.error}
                unknown={meds.ticksUnknown}
                ticksError={meds.ticksError}
                onRetry={meds.reload}
              />
            </Surface>
          )}

          {!isSimple && (
            <LabelPanel component="section" aria-label="Your numbers" title="Your numbers">
              <StatCard
                first
                label="Weight"
                value={data.stats.weight.value ?? '—'}
                unit={data.stats.weight.unit}
                caption={data.stats.weight.caption}
              />
              <StatCard
                label="Blood pressure"
                value={data.stats.bloodPressure.systolic ? `${data.stats.bloodPressure.systolic}/${data.stats.bloodPressure.diastolic}` : '—'}
                unit="mmHg"
                trend={data.stats.bloodPressure.trend}
                trendValue={data.stats.bloodPressure.trendValue}
              />
              <StatCard
                label="Steps"
                value={data.stats.steps.value?.toLocaleString('en-US') ?? '—'}
                trend={data.stats.steps.trend}
                trendValue={data.stats.steps.trendValue}
              />
              <StatCard
                label="Days in a row"
                value={data.stats.streak.value}
                unit="days"
              />
            </LabelPanel>
          )}

          {!isSimple && <AIInsightsCard />}
        </Box>
      </Box>
      {addDialog}
    </Page>
  );
};

export default DashboardNew;
