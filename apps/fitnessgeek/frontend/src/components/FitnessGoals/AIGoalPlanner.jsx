import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, AlertTitle, Box, Button, CircularProgress, FormControl, InputLabel, MenuItem, Select, TextField, Typography,
} from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';
import { useInRouterContext } from 'react-router-dom';
import { GeekErrorState, useToast } from '@geeksuite/ui';
import { isPlanCalculationStale, localDateString } from '@geeksuite/utils';
import { userService } from '../../services/userService.js';
import { settingsService } from '../../services/settingsService.js';
import { bodyCompService } from '../../services/bodyCompService.js';
import { influxService } from '../../services/influxService.js';
import { weightService } from '../../services/weightService.js';
import { useExperience } from '../../contexts/ExperienceContext.jsx';
import { errorMessage } from '../../utils/errorMessage.js';
import { fmt } from '../../utils/plainWords.js';
import { currentAverage } from '../Weight/weightTrend.js';
import { planBannerKind } from '../Dashboard/PlanAccuracyBanner.jsx';
import { LabelBar, Page, Surface } from '../primitives';
import KetoPlanStep from './KetoPlanStep';
import HeightField from './HeightField.jsx';
import QuickTarget, { BigChoice, DoneButton } from './QuickTarget.jsx';
import { PlanComparison, previewMacros } from './planProvenance.jsx';
import {
  planTarget, weekenderSuggestion, MEASURED_ACTIVITY, RATE_OPTIONS, usableMeasuredActivity,
} from './planMath.js';
import { parseHeightToInches, buildCaloriePlan, nutritionGoalPayload } from './calorieCalc.js';
import { Disclosure, PlanExtras, PlanHeadline, PlanWeek, PlanWorking } from './PlanResult.jsx';

/**
 * The calorie plan (/calorie-wizard).
 *
 * A few plain questions, one at a time — what you weigh, where you want to
 * get to, how fast, how active — then "Your daily target: N calories", one
 * line of what it means, and one Save. Everything a normal person would not know (how the week is
 * spread, keto and its split, the numbers behind the target) sits behind a
 * tap on the last screen.
 *
 * A person who already has a plan sees that plan first, with "Change plan".
 *
 * NOTHING HERE IS NEW MATHS. The answers go to `buildCaloriePlan` and the
 * save is `nutritionGoalPayload` (calorieCalc.js), exactly as before; the
 * questions are only asked more plainly and prefilled from what is already
 * known (the 7-day average weight, the profile, the plan being replaced).
 *
 * `?quick=1` is the one-screen quick target (QuickTarget.jsx), unchanged.
 */

const SPEEDS = [
  { rate: 0.5, title: 'Slowly', body: '½ lb a week' },
  { rate: 1, title: 'Steady', body: '1 lb a week. Most people pick this.' },
  { rate: 1.5, title: 'Faster', body: '1½ lb a week' },
  { rate: 2, title: 'Fast', body: '2 lb a week' },
  { rate: 2.5, title: 'Very fast', body: '2½ lb a week. Hard to keep up.' },
];

const ACTIVITY = [
  { id: 'sedentary', title: 'Mostly sitting', body: 'A desk job, little or no exercise' },
  { id: 'light', title: 'Lightly active', body: 'Light exercise 1–3 days a week' },
  { id: 'moderate', title: 'Active', body: 'Exercise 3–5 days a week' },
  { id: 'very', title: 'Very active', body: 'Hard exercise 6–7 days a week' },
  { id: 'extra', title: 'Extra active', body: 'Very hard exercise or a physical job' },
];

const PLAN_TYPES = [
  { id: 'standard', title: 'The same every day' },
  { id: 'weekender', title: 'More on Friday and Saturday', body: 'A little less on the other days' },
  { id: 'auto', title: 'Make up for a day I go over', body: 'The rest of the week adjusts' },
];

const SEXES = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer-not-to-say', label: 'Rather not say' },
];

const DEFAULT_KETO = {
  net_carb_limit_g: 20,
  track_net_carbs: true,
  macro_split: { preset: 'classic', fat_pct: 70, protein_pct: 25, carb_pct: 5 },
};

const plausibleAge = (v) => Number(v) >= 13 && Number(v) <= 110;
const plausibleWeight = (v) => Number(v) >= 60 && Number(v) <= 700;
const round1 = (n) => Math.round(Number(n) * 10) / 10;

/** A saved rate as one of the offered speeds: the next one up, so a rate the
 * safety floor slowed down (1.7) goes back to what was asked for (2). */
const offeredRate = (rate) => {
  const r = Number(rate);
  if (!(r > 0)) return 1;
  return RATE_OPTIONS.find((o) => o >= r) ?? RATE_OPTIONS[RATE_OPTIONS.length - 1];
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const daysFromSchedule = (schedule) => (
  Array.isArray(schedule) && schedule.length === 7
    ? DAYS.map((day, i) => ({ day, calories: Math.round(schedule[i] || 0) }))
    : DAYS.map((day) => ({ day, calories: 0 }))
);

/**
 * The stored `nutrition_goal` in the shape `buildCaloriePlan` returns, so
 * the saved plan and a new one are drawn by the same code.
 *
 * A saved plan carries what you burn in a day and its floor, so whether it
 * was held up by the floor — and the rate it really delivers — can be
 * recomputed for display. Plans saved before 2026-09-23 stored the REQUESTED
 * rate even when the floor made it unreachable.
 */
export function planFromSaved(ng, { fallbackWeight = 0 } = {}) {
  if (!ng) return null;
  const savedTarget = Number(ng.tdee) > 0 && Number(ng.min_safe_calories) > 0 && Number(ng.weight_change_rate) > 0
    ? planTarget({ tdee: Number(ng.tdee), requestedRate: ng.weight_change_rate, minSafe: Number(ng.min_safe_calories) })
    : null;
  const bmr = Math.round(ng.bmr || 0);
  return {
    currentWeight: ng.start_weight || Number(fallbackWeight) || 0,
    targetWeight: Number(ng.target_weight) > 0 ? Number(ng.target_weight) : null,
    weightToLose: ng.start_weight && ng.target_weight ? Math.abs(ng.start_weight - ng.target_weight) : 0,
    bmr,
    bmrSource: ng.bmr_source === 'scan' ? 'scan' : 'mifflin',
    leanMassLb: ng.lean_mass_lb ?? null,
    bmrScans: null,
    tdee: Math.round(ng.tdee || 0),
    dailyCalories: Math.round(ng.daily_calorie_target || 0),
    weeklyDeficit: Math.round((ng.weight_change_rate || 0) * 500),
    timeline: ng.timeline_weeks || 0,
    activityLevel: ng.activity_level || 'sedentary',
    weightChangeRate: savedTarget ? savedTarget.effectiveRate : (ng.weight_change_rate || 0),
    requestedRate: ng.weight_change_rate || 0,
    floored: Boolean(savedTarget?.floored),
    planType: ng.plan_type || 'standard',
    schedule: daysFromSchedule(ng.weekly_schedule),
    weekenderSuggestion: savedTarget && ng.plan_type === 'weekender'
      ? weekenderSuggestion({ tdee: ng.tdee, minSafe: ng.min_safe_calories, currentRate: savedTarget.effectiveRate })
      : null,
    rules: {
      minSafeCalories: ng.min_safe_calories || 1200,
      capPercent: 20,
      // A saved plan always had a real calories-at-rest figure at save time.
      calculationValid: bmr > 0,
      autoAdjust: ng.plan_type === 'auto',
    },
  };
}

/** The settings read. A failed read is a failure, never "no plan". */
async function readSettings() {
  try {
    const resp = await settingsService.getSettings();
    const data = resp?.data || resp;
    if (!data || typeof data !== 'object') throw new Error('No settings in the response');
    const ng = data.nutrition_goal;
    const wg = data.weight_goal;
    const wgTarget = Number(wg?.targetWeight);
    return {
      ok: true,
      savedGoal: ng && ng.enabled ? ng : null,
      // The weight goal's target, used to prefill "goal weight".
      weightGoalTarget: wg && (wg.enabled || wg.is_active) && wgTarget > 0 ? wgTarget : null,
    };
  } catch (error) {
    return { ok: false, message: errorMessage(error, 'Couldn’t load your plan. Try again.') };
  }
}

/**
 * Everything the questions are prefilled from. No part of it is fatal: a
 * piece that can't be had is simply asked for (or, for the watch and the
 * scale, not offered).
 */
async function readDetails() {
  const [profile, latestWeight, averageWeight, scan, measuredActivity] = await Promise.all([
    userService.getProfile().then((data) => ({ ok: true, data }), () => ({ ok: false, data: null })),
    Promise.resolve().then(() => userService.getLatestWeight()).catch(() => null),
    // The 7-day average the Weight page shows, by the SAME helper over the
    // same logs, so "to lose" here and "to go" there can't drift apart (D-3).
    Promise.resolve().then(() => weightService.getWeightLogs()).then((response) => {
      const mean = Number(currentAverage(Array.isArray(response?.data) ? response.data : []));
      return Number.isFinite(mean) && mean > 0 ? mean : null;
    }).catch(() => null),
    // The body-scan figure. `source === 'scan'` means the server found a
    // usable lean mass (a 14-day mean, latest scan ≤ 30 days old).
    Promise.resolve().then(() => bodyCompService.getSummary()).then(
      (resp) => ({ bmr: (resp?.data ?? resp)?.bmr || null, failed: false }),
      () => ({ bmr: null, failed: true }),
    ),
    // Not announced when missing: without a watch the option isn't offered.
    Promise.resolve().then(() => influxService.getTrends({ days: 30, end: localDateString() }))
      .then((trends) => usableMeasuredActivity(trends?.activeKcal30))
      .catch(() => null),
  ]);
  return { profile, latestWeight, averageWeight, scan, measuredActivity };
}

function StepFrame({ step, total, title, hint, headingRef, children, onBack, onNext, canNext, nextLabel = 'Next' }) {
  return (
    <Surface
      component="form"
      noValidate
      data-testid="plan-step"
      data-step={step}
      onSubmit={(e) => {
        e.preventDefault();
        if (canNext) onNext();
      }}
      sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}
    >
      <Box>
        <Typography sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.875rem' }}>
          {`Step ${step} of ${total}`}
        </Typography>
        <LabelBar value={(step / total) * 100} label={`Step ${step} of ${total}`} height={6} sx={{ mt: 2, mb: 0 }} />
      </Box>
      <Box>
        <Typography
          component="h2"
          ref={headingRef}
          tabIndex={-1}
          sx={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em', outline: 'none' }}
        >
          {title}
        </Typography>
        {hint && <Typography sx={{ color: 'text.secondary', fontSize: '1rem', mt: 1 }}>{hint}</Typography>}
      </Box>
      {children}
      <Box sx={{ display: 'flex', gap: 3, justifyContent: { sm: 'flex-end' } }}>
        {onBack && (
          <Button type="button" variant="tonal" size="large" onClick={onBack} sx={{ minHeight: 48, flex: { xs: 1, sm: 'none' }, minWidth: { sm: 112 } }}>
            Back
          </Button>
        )}
        <Button type="submit" variant="contained" size="large" disabled={!canNext} sx={{ minHeight: 48, flex: { xs: 2, sm: 'none' }, minWidth: { sm: 160 } }}>
          {nextLabel}
        </Button>
      </Box>
    </Surface>
  );
}

const Choices = ({ labelledBy, label, children }) => (
  <Box role="radiogroup" aria-labelledby={labelledBy} aria-label={label} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
    {children}
  </Box>
);

const CalorieGoalWizard = () => {
  const { notify } = useToast();
  const inRouter = useInRouterContext();
  const { goal: experienceGoal } = useExperience();

  // The one-screen quick target, when a link says ?quick=1. Read from
  // window.location rather than the router so this still mounts on its own
  // in a test.
  const [quick] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('quick') === '1';
    } catch {
      return false;
    }
  });

  // Home's "Update" lands with ?update=1: straight to the new target beside
  // the old one (the one-tap fix below), when there is one to offer.
  const [wantsUpdate, setWantsUpdate] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('update') === '1';
    } catch {
      return false;
    }
  });

  const [status, setStatus] = useState('loading'); // 'loading' | 'error' | 'ready'
  const [loadError, setLoadError] = useState(null);
  // The stored nutrition_goal (enabled), kept apart from the answers so a
  // re-run shows saved-vs-new before anything is overwritten, and so macro
  // previews merge the fields a save leaves untouched (the settings write
  // MERGES into nutrition_goal).
  const [savedGoal, setSavedGoal] = useState(null);
  const [weightGoalTarget, setWeightGoalTarget] = useState(null);
  const [details, setDetails] = useState(null);

  const [stage, setStage] = useState('steps'); // 'summary' | 'steps' | 'result'
  const [stepIndex, setStepIndex] = useState(0);
  const [editingDetails, setEditingDetails] = useState(false);
  const [form, setForm] = useState({
    weight: '', height: '', age: '', gender: '', activityLevel: 'sedentary',
    targetWeight: '', rate: 1, maintain: false, planType: 'standard',
  });
  const [mode, setMode] = useState('standard');
  const [ketoConfig, setKetoConfig] = useState(DEFAULT_KETO);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [justSaved, setJustSaved] = useState(false);
  const [removal, setRemoval] = useState('idle'); // 'idle' | 'confirm' | 'busy'
  const [removeError, setRemoveError] = useState(null);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const load = useCallback(async () => {
    setStatus('loading');
    setLoadError(null);
    const [settings, next] = await Promise.all([readSettings(), readDetails()]);
    if (!settings.ok) {
      setLoadError(settings.message);
      setStatus('error');
      return;
    }
    const ng = settings.savedGoal;
    const profile = next.profile.data?.profile || {};
    // The 7-day average is the plan's starting weight; the latest weigh-in
    // is the fallback.
    const startWeight = next.averageWeight || next.latestWeight || null;
    const weight = startWeight ? String(round1(startWeight)) : '';
    const measured = next.measuredActivity;
    const savedActivity = ng?.activity_level;
    const activityLevel = savedActivity === MEASURED_ACTIVITY
      ? (measured ? MEASURED_ACTIVITY : 'sedentary')
      : (ACTIVITY.some((a) => a.id === savedActivity) ? savedActivity : 'sedentary');
    // The goal she has, unless she is already at or past it.
    const savedTarget = [ng?.target_weight, settings.weightGoalTarget].map(Number).find((t) => t > 0);
    const targetWeight = savedTarget && (!plausibleWeight(weight) || savedTarget < Number(weight)) ? String(round1(savedTarget)) : '';

    setSavedGoal(ng);
    setWeightGoalTarget(settings.weightGoalTarget);
    setDetails({
      // Unrounded, as the quick target has always been handed it.
      weightRaw: startWeight ? String(startWeight) : '',
      weightBasis: next.averageWeight ? 'average' : (next.latestWeight ? 'latest' : null),
      profileLoaded: next.profile.ok,
      profile: { age: profile.age || '', height: profile.height || '', gender: profile.gender || '' },
      // What the profile already holds: these are shown, not asked.
      known: {
        height: parseHeightToInches(profile.height) !== null,
        age: plausibleAge(profile.age),
        gender: Boolean(profile.gender),
      },
      scanBmr: next.scan.bmr,
      scanLoadFailed: next.scan.failed,
      measuredActivity: measured,
    });
    setForm({
      weight,
      height: profile.height || '',
      age: profile.age ? String(profile.age) : '',
      gender: profile.gender || '',
      activityLevel,
      targetWeight,
      rate: offeredRate(ng?.weight_change_rate),
      maintain: ng ? (ng.weight_change_rate != null && Number(ng.weight_change_rate) === 0) : experienceGoal === 'maintain',
      planType: PLAN_TYPES.some((p) => p.id === ng?.plan_type) ? ng.plan_type : 'standard',
    });
    setMode(ng?.mode === 'keto' ? 'keto' : 'standard');
    setKetoConfig(ng?.keto || DEFAULT_KETO);
    // A plan with no target in it is nothing to show: ask instead.
    setStage(ng && Number(ng.daily_calorie_target) > 0 ? 'summary' : 'steps');
    setStepIndex(0);
    setStatus('ready');
    // The experience goal only seeds the first answer; a later change to it
    // must not reload the page under the person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  /** The stored plan again, without a spinner (after the quick target saves). */
  const refreshSaved = async () => {
    const settings = await readSettings();
    if (!settings.ok) return;
    setSavedGoal(settings.savedGoal);
    setWeightGoalTarget(settings.weightGoalTarget);
  };

  const scanBmr = details?.scanBmr || null;
  const measuredActivity = details?.measuredActivity || null;
  const usableLeanMassLb = scanBmr?.source === 'scan' && Number(scanBmr?.lean_mass_lb) > 0
    ? Number(scanBmr.lean_mass_lb)
    : null;

  // ── The answers, and whether each step has what it needs ────────────────
  const heightOk = parseHeightToInches(form.height) !== null;
  const youOk = plausibleWeight(form.weight) && heightOk && plausibleAge(form.age) && Boolean(form.gender);
  const targetTyped = String(form.targetWeight).trim() !== '';
  const targetOk = plausibleWeight(form.targetWeight) && (!plausibleWeight(form.weight) || Number(form.targetWeight) < Number(form.weight));
  const goalOk = form.maintain || targetOk;
  const stepIds = form.maintain ? ['you', 'goal', 'activity'] : ['you', 'goal', 'speed', 'activity'];
  const stepId = stepIds[Math.min(stepIndex, stepIds.length - 1)];

  // The plan these answers make — the wizard's own arithmetic, recomputed as
  // an answer changes so the last screen's details can be adjusted in place.
  const draft = useMemo(() => {
    if (!youOk || !goalOk) return null;
    const next = buildCaloriePlan({
      profile: { age: form.age, weight: form.weight, height: form.height, gender: form.gender, activityLevel: form.activityLevel },
      goal: {
        targetWeight: form.maintain ? '' : form.targetWeight,
        weightChangeRate: form.maintain ? 0 : form.rate,
        planType: form.planType,
      },
      usableLeanMassLb,
      scanBmr,
      measuredActivity,
    });
    // Never a plan built on a height that couldn't be read.
    return next.heightError || !(next.dailyCalories > 0) ? null : next;
  }, [youOk, goalOk, form, usableLeanMassLb, scanBmr, measuredActivity]);

  const savedPlan = useMemo(
    () => planFromSaved(savedGoal, { fallbackWeight: form.weight }),
    // The fallback weight only matters for a plan saved without one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedGoal],
  );
  const savedMode = savedGoal?.mode === 'keto' ? 'keto' : 'standard';

  // What is saved today, for the old-vs-new comparison. Null when there is
  // no saved plan, so a first plan shows no comparison.
  const savedSnapshot = savedGoal && Number(savedGoal.daily_calorie_target) > 0
    ? {
      dailyCalories: Math.round(savedGoal.daily_calorie_target),
      bmr: Math.round(savedGoal.bmr || 0) || null,
      schedule: savedGoal.weekly_schedule,
      stale: isPlanCalculationStale(savedGoal),
    }
    : null;

  // Protein, carbs and fat as they will be served once this plan is saved:
  // the same two functions the server runs, so the preview can't disagree.
  const draftTargetFields = draft && Number.isFinite(draft.targetWeight)
    ? { target_weight: draft.targetWeight, goal_weight_lbs: draft.targetWeight }
    : {};
  const draftMacros = draft && mode !== 'keto'
    ? previewMacros({ ...(savedGoal || {}), mode: 'standard', ...draftTargetFields }, { leanMassLb: usableLeanMassLb, calories: draft.dailyCalories })
    : null;
  const savedMacros = savedPlan && savedMode !== 'keto' && savedPlan.dailyCalories > 0
    ? previewMacros({ ...savedGoal, mode: 'standard' }, { leanMassLb: usableLeanMassLb, calories: savedPlan.dailyCalories })
    : null;
  // The rule protein is set by, for "How this was worked out" (keto too; lazy
  // keto follows no split, so it has none to explain).
  const lazyKeto = (cfg) => cfg?.macro_split?.preset === 'lazy';
  const draftRules = draftMacros?.rules
    || (draft && mode === 'keto' && !lazyKeto(ketoConfig)
      ? previewMacros({ ...(savedGoal || {}), mode: 'keto', keto: ketoConfig, ...draftTargetFields }, { leanMassLb: usableLeanMassLb, calories: draft.dailyCalories }).rules
      : null);
  const savedRules = savedMacros?.rules
    || (savedPlan && savedMode === 'keto' && savedPlan.dailyCalories > 0 && !lazyKeto(savedGoal?.keto || DEFAULT_KETO)
      ? previewMacros({ ...savedGoal, mode: 'keto', keto: savedGoal?.keto || DEFAULT_KETO }, { leanMassLb: usableLeanMassLb, calories: savedPlan.dailyCalories }).rules
      : null);
  const draftEnd = useMemo(() => {
    if (!draft || !(draft.timeline > 0) || !Number.isFinite(draft.targetWeight)) return null;
    const end = new Date();
    end.setDate(end.getDate() + draft.timeline * 7);
    return end;
  }, [draft]);

  // Each screen moves focus to its heading, so a screen reader hears the
  // question (and a phone shows it from the top).
  const headingRef = useRef(null);
  const drawn = useRef(false);
  useEffect(() => {
    if (status !== 'ready') return;
    if (!drawn.current) { drawn.current = true; return; }
    headingRef.current?.focus?.();
  }, [status, stage, stepId]);

  // ?update=1, once, after the first draw: the saved plan can be more
  // accurate and today's details make a new one, so show old beside new.
  // Anything else (no plan, nothing to improve, a detail missing) leaves her
  // on the page she would have seen anyway.
  useEffect(() => {
    if (!wantsUpdate || status !== 'ready') return;
    setWantsUpdate(false);
    if (stage === 'summary' && draft && planBannerKind(savedGoal, scanBmr)) setStage('result');
  }, [wantsUpdate, status, stage, draft, savedGoal, scanBmr]);

  const startOver = () => {
    setJustSaved(false);
    setSaveError(null);
    setRemoval('idle');
    setRemoveError(null);
    setStepIndex(0);
    setStage('steps');
  };

  /** The one-tap fix: today's details and the saved answers, straight to the
   * new target (old and new side by side, one Save). */
  const reworkFromSaved = () => {
    setJustSaved(false);
    setSaveError(null);
    if (draft) {
      setStage('result');
      return;
    }
    setStepIndex(youOk ? 1 : 0);
    setStage('steps');
  };

  const nextStep = () => {
    if (stepIndex >= stepIds.length - 1) setStage('result');
    else setStepIndex(stepIndex + 1);
  };
  const backStep = () => setStepIndex(Math.max(0, stepIndex - 1));

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setSaveError(null);
    const payload = nutritionGoalPayload(draft, { mode, keto: mode === 'keto' ? ketoConfig : undefined });
    try {
      await settingsService.updateSettings({ nutrition_goal: payload });
    } catch (error) {
      // Said where she is looking, and nothing she answered is lost.
      const message = errorMessage(error, 'Couldn’t save your plan. Try again.');
      setSaveError(message);
      notify(message, { tone: 'error' });
      setSaving(false);
      return;
    }
    // What she had to type is kept on her profile, so she isn't asked again.
    // Only what was missing, and never a reason to fail the save she asked for.
    if (details?.profileLoaded) {
      const updates = {};
      if (!details.known.age && plausibleAge(form.age)) updates.age = Number(form.age);
      if (!details.known.height && heightOk) updates.height = form.height;
      if (!details.known.gender && form.gender) updates.gender = form.gender;
      if (Object.keys(updates).length > 0) {
        try { await userService.updateProfile(updates); } catch { /* the plan is what she asked for */ }
      }
    }
    // The write merges, so what is stored is the old goal with this over it.
    // Shown from that rather than a re-read: a read that came back a moment
    // stale would put the old plan (and its warning) back on screen.
    setSavedGoal((prev) => ({ ...(prev || {}), ...payload }));
    setSaving(false);
    setJustSaved(true);
    setStage('summary');
    notify(`Plan saved. Your target is now ${fmt(draft.dailyCalories)} calories a day`, { tone: 'success' });
  };

  const removePlan = async () => {
    if (removal === 'busy') return;
    setRemoval('busy');
    setRemoveError(null);
    try {
      await settingsService.updateSettings({ nutrition_goal: { enabled: false } });
    } catch (error) {
      const message = errorMessage(error, 'Couldn’t remove your plan. Try again.');
      setRemoveError(message);
      notify(message, { tone: 'error' });
      setRemoval('confirm');
      return;
    }
    setSavedGoal(null);
    setRemoval('idle');
    setJustSaved(false);
    setStepIndex(0);
    setStage('steps');
    notify('Plan removed', { tone: 'success' });
  };

  if (status === 'error') {
    return (
      <Page narrow>
        <Surface>
          <GeekErrorState title="Couldn’t load your plan" description={loadError || 'Couldn’t load your plan. Try again.'} onRetry={load} />
        </Surface>
      </Page>
    );
  }

  if (quick) {
    return (
      <QuickTarget
        loading={status !== 'ready'}
        initialProfile={{ ...(details?.profile || {}), weight: details?.weightRaw || '' }}
        weightBasis={details?.weightBasis || null}
        maintain={experienceGoal === 'maintain'}
        targetWeight={weightGoalTarget ?? (Number(savedGoal?.target_weight) > 0 ? Number(savedGoal.target_weight) : null)}
        currentTarget={Number(savedGoal?.daily_calorie_target) > 0 ? Math.round(savedGoal.daily_calorie_target) : null}
        usableLeanMassLb={usableLeanMassLb}
        scanBmr={scanBmr}
        scanLoadFailed={Boolean(details?.scanLoadFailed)}
        onSaved={refreshSaved}
      />
    );
  }

  if (status !== 'ready') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 16 }}>
        <CircularProgress aria-label="Loading your plan" />
      </Box>
    );
  }

  // ── A plan already saved: the plan first, "Change plan" second ──────────
  if (stage === 'summary' && savedPlan && savedPlan.dailyCalories > 0) {
    const notice = planBannerKind(savedGoal, scanBmr); // 'stale' | 'scan' | null
    const primary = notice ? 'fix' : justSaved ? 'done' : 'change';
    return (
      <Page narrow data-testid="plan-page">
        {/* One calm offer and the one tap that takes it. Never rewritten
            for her: a change to what she eats is hers to make, so the new
            target is shown beside the old before a Save. The facts behind
            it are under "How this was worked out". */}
        {notice && (
          <Alert severity="info" data-testid={notice === 'stale' ? 'plan-stale-notice' : 'plan-scan-notice'} sx={{ alignItems: 'flex-start' }}>
            <AlertTitle>Your target can be more accurate now</AlertTitle>
            {notice === 'stale'
              ? 'Your details have changed since this was worked out. '
              : 'Your body scans can stand in for an estimate. '}
            You’ll see the old target beside the new one, and nothing changes until you save.
            <Box sx={{ mt: 3 }}>
              <Button variant="contained" onClick={reworkFromSaved} sx={{ minHeight: 44 }}>Update my target</Button>
            </Box>
          </Alert>
        )}

        <Surface data-testid="plan-summary" sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {justSaved && (
            <Typography role="status" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary' }}>
              <CheckIcon aria-hidden sx={{ fontSize: 20, color: 'success.main' }} /> Saved. Today now counts down from this.
            </Typography>
          )}
          <PlanHeadline
            plan={savedPlan}
            mode={savedMode}
            keto={savedGoal.keto || DEFAULT_KETO}
            endDate={savedGoal.estimated_end_date}
            headingRef={headingRef}
          />
          {/* The week, the grams and the working: there for the asking. */}
          <Disclosure label="How this was worked out" testId="plan-working-toggle">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <PlanExtras plan={savedPlan} macros={savedMacros} />
            <PlanWorking
              plan={savedPlan}
              proteinRules={savedRules}
              note={notice === 'scan'
                ? `Your body scans measure ${fmt(scanBmr.bmr)} calories a day at rest. This plan uses an estimate of ${fmt(savedGoal.bmr)}.`
                : notice === 'stale'
                  ? 'The weight, height and age this was worked out from weren’t kept. A new target uses your details as they are today.'
                  : null}
            />
            </Box>
          </Disclosure>

          {removal === 'idle' ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
              {primary === 'done' && inRouter && <DoneButton variant="contained" sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 160 } }} />}
              <Button
                variant={primary === 'change' || (primary === 'done' && !inRouter) ? 'contained' : 'tonal'}
                size="large"
                onClick={startOver}
                sx={{ minHeight: 48, flex: { xs: 1, sm: 'none' } }}
              >
                Change plan
              </Button>
              <Button color="error" size="large" onClick={() => setRemoval('confirm')} sx={{ minHeight: 48, flex: { xs: 1, sm: 'none' } }}>
                Remove plan
              </Button>
            </Box>
          ) : (
            <Box role="group" aria-label="Remove plan" data-testid="plan-remove-confirm">
              <Typography sx={{ fontWeight: 600 }}>Remove this plan?</Typography>
              <Typography sx={{ color: 'text.secondary', mt: 1, mb: 3 }}>
                Today will stop showing a calorie target. What you’ve logged stays.
              </Typography>
              {removeError && <Alert severity="error" sx={{ mb: 3 }}>{removeError}</Alert>}
              <Box sx={{ display: 'flex', gap: 3 }}>
                <Button variant="tonal" size="large" onClick={() => { setRemoval('idle'); setRemoveError(null); }} disabled={removal === 'busy'} sx={{ minHeight: 48, flex: { xs: 1, sm: 'none' } }}>
                  Keep it
                </Button>
                <Button color="error" size="large" onClick={removePlan} disabled={removal === 'busy'} sx={{ minHeight: 48, flex: { xs: 1, sm: 'none' } }}>
                  {removal === 'busy' ? 'Removing…' : 'Yes, remove it'}
                </Button>
              </Box>
            </Box>
          )}
        </Surface>
      </Page>
    );
  }

  // ── The answer: one sentence, the details behind a tap, one Save ────────
  if (stage === 'result' && draft) {
    return (
      <Page narrow data-testid="plan-page">
        <Surface data-testid="plan-result" sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Box aria-live="polite">
            {/* One number, what it means, and what it replaces. Nothing else
                until she asks: the week, the grams, old beside new and the
                working are behind the two rows below, both closed. */}
            <PlanHeadline
              plan={draft}
              mode={mode}
              keto={ketoConfig}
              endDate={draftEnd}
              previous={savedSnapshot?.dailyCalories ?? null}
              headingRef={headingRef}
            />
          </Box>

          <Box>
            <Disclosure label="Adjust the details" testId="plan-details-toggle">
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Box>
                  <Typography id="plan-type-label" sx={{ fontWeight: 600, mb: 2 }}>Through the week</Typography>
                  <Choices labelledBy="plan-type-label">
                    {PLAN_TYPES.map((p) => (
                      <BigChoice
                        key={p.id}
                        selected={form.planType === p.id}
                        onClick={() => set({ planType: p.id })}
                        title={p.title}
                        body={p.body}
                        testId={`plan-type-${p.id}`}
                      />
                    ))}
                  </Choices>
                  {/* What that choice does to the week, right under it. */}
                  <Box sx={{ mt: 4 }}><PlanWeek plan={draft} /></Box>
                </Box>
                <Box>
                  <Typography id="plan-mode-label" sx={{ fontWeight: 600, mb: 2 }}>What you count</Typography>
                  <Choices labelledBy="plan-mode-label">
                    <BigChoice selected={mode !== 'keto'} onClick={() => setMode('standard')} title="Calories" body="Protein, carbs and fat follow from the target" testId="plan-mode-standard" />
                    <BigChoice selected={mode === 'keto'} onClick={() => setMode('keto')} title="Calories and carbs (keto)" body="A daily cap on carbs, and more fat" testId="plan-mode-keto" />
                  </Choices>
                </Box>
                {mode === 'keto' && (
                  <KetoPlanStep
                    ketoConfig={ketoConfig}
                    onChange={setKetoConfig}
                    calorieTarget={draft.dailyCalories}
                    baseGoal={{ ...(savedGoal || {}), ...draftTargetFields }}
                    leanMassLb={usableLeanMassLb}
                  />
                )}
              </Box>
            </Disclosure>
            <Disclosure label="How this was worked out" testId="plan-working-toggle">
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <PlanExtras plan={draft} macros={draftMacros} week={false} />
                {/* Saved vs new, line by line: only while replacing a plan. */}
                <PlanComparison saved={savedSnapshot} next={draft} />
                <PlanWorking plan={draft} proteinRules={draftRules} scanLoadFailed={Boolean(details?.scanLoadFailed)} />
              </Box>
            </Disclosure>
            <Box sx={{ borderTop: (t) => `1px solid ${t.palette.divider}` }} aria-hidden />
          </Box>

          {saveError && <Alert severity="error" data-testid="plan-save-error">{saveError}</Alert>}
          <Box sx={{ display: 'flex', gap: 3, justifyContent: { sm: 'flex-end' } }}>
            <Button variant="tonal" size="large" onClick={() => { setSaveError(null); setStepIndex(stepIds.length - 1); setStage('steps'); }} disabled={saving} sx={{ minHeight: 48, flex: { xs: 1, sm: 'none' }, minWidth: { sm: 112 } }}>
              Back
            </Button>
            <Button variant="contained" size="large" onClick={save} disabled={saving} sx={{ minHeight: 48, flex: { xs: 2, sm: 'none' }, minWidth: { sm: 160 } }}>
              {saving ? 'Saving…' : 'Save plan'}
            </Button>
          </Box>
        </Surface>
      </Page>
    );
  }

  // ── The questions ───────────────────────────────────────────────────────
  const known = details?.known || { height: false, age: false, gender: false };
  const allKnown = known.height && known.age && known.gender;
  const ask = (field) => editingDetails || !known[field];
  const weightNote = details?.weightBasis === 'average' ? 'your 7-day average' : details?.weightBasis === 'latest' ? 'your last weigh-in' : null;
  const total = stepIds.length;
  const stepNumber = stepIds.indexOf(stepId) + 1;
  const frame = { step: stepNumber, total, headingRef, onNext: nextStep, onBack: stepNumber > 1 ? backStep : undefined };
  const weightBad = form.weight !== '' && !plausibleWeight(form.weight);
  const ageBad = form.age !== '' && !plausibleAge(form.age);
  const inches = parseHeightToInches(form.height);

  return (
    <Page narrow data-testid="plan-page">
      {savedPlan && savedPlan.dailyCalories > 0 && (
        <Typography sx={{ color: 'text.secondary' }} data-testid="plan-current-target">
          {`Your target now is ${fmt(savedPlan.dailyCalories)} calories. Nothing changes until you save. `}
          <Button onClick={() => setStage('summary')} sx={{ minHeight: 44, px: 1, verticalAlign: 'baseline' }}>Keep it</Button>
        </Typography>
      )}

      {stepId === 'you' && (
        <StepFrame {...frame} title="What do you weigh now?" hint="I’ll use this to work out how much to eat each day." canNext={youOk}>
          <TextField
            label="Weight now (lb)"
            type="number"
            value={form.weight}
            onChange={(e) => set({ weight: e.target.value })}
            error={weightBad}
            helperText={weightBad ? 'A weight from 60 to 700 lb.' : (weightNote && form.weight === String(round1(details.weightRaw)) ? `From ${weightNote}` : undefined)}
            inputProps={{ inputMode: 'decimal', step: 'any' }}
            fullWidth
          />
          {allKnown && !editingDetails ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Typography sx={{ color: 'text.secondary' }} data-testid="plan-known">
                {`Also using your height (${Math.floor(inches / 12)}'${inches % 12}") and age (${form.age}).`}
              </Typography>
              <Button onClick={() => setEditingDetails(true)} sx={{ minHeight: 44 }}>Change these</Button>
            </Box>
          ) : (
            <>
              {!editingDetails && (
                <Typography sx={{ color: 'text.secondary' }}>
                  A few more things, just this once. They’re kept on your profile.
                </Typography>
              )}
              {ask('height') && (
                <HeightField idPrefix="plan-height" label="Height" value={form.height} onChange={(h) => set({ height: h })} />
              )}
              {ask('age') && (
                <TextField
                  label="Age"
                  type="number"
                  value={form.age}
                  onChange={(e) => set({ age: e.target.value })}
                  error={ageBad}
                  helperText={ageBad ? 'An age from 13 to 110.' : undefined}
                  inputProps={{ inputMode: 'numeric' }}
                  fullWidth
                />
              )}
              {ask('gender') && (
                <FormControl fullWidth>
                  <InputLabel id="plan-sex-label">Sex</InputLabel>
                  <Select labelId="plan-sex-label" label="Sex" value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
                    {SEXES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
            </>
          )}
        </StepFrame>
      )}

      {stepId === 'goal' && (
        <StepFrame {...frame} title="What are you aiming for?" canNext={goalOk}>
          <Choices label="What are you aiming for?">
            <BigChoice selected={!form.maintain} onClick={() => set({ maintain: false })} title="Lose weight" testId="plan-goal-lose" />
            <BigChoice selected={form.maintain} onClick={() => set({ maintain: true })} title="Stay at this weight" testId="plan-goal-maintain" />
          </Choices>
          {!form.maintain && (
            <TextField
              label="Goal weight (lb)"
              type="number"
              value={form.targetWeight}
              onChange={(e) => set({ targetWeight: e.target.value })}
              error={targetTyped && !targetOk}
              helperText={targetTyped && !targetOk
                ? (plausibleWeight(form.targetWeight) ? `Pick a weight below your weight now (${form.weight} lb).` : 'A weight from 60 to 700 lb.')
                : `You weigh ${form.weight} lb now.`}
              inputProps={{ inputMode: 'decimal', step: 'any', 'data-testid': 'plan-goal-weight' }}
              fullWidth
            />
          )}
        </StepFrame>
      )}

      {stepId === 'speed' && (
        <StepFrame {...frame} title="How fast?" hint="Slower is easier to stick to." canNext>
          <Choices label="How fast?">
            {SPEEDS.map((s) => (
              <BigChoice
                key={s.rate}
                selected={form.rate === s.rate}
                onClick={() => set({ rate: s.rate })}
                title={s.title}
                body={s.body}
                testId={`plan-speed-${s.rate}`}
              />
            ))}
          </Choices>
        </StepFrame>
      )}

      {stepId === 'activity' && (
        <StepFrame {...frame} title="How active are you?" hint="On a normal week. If you’re not sure, pick the lower one." canNext nextLabel="See my target">
          <Choices label="How active are you?">
            {ACTIVITY.map((a) => (
              <BigChoice
                key={a.id}
                selected={form.activityLevel === a.id}
                onClick={() => set({ activityLevel: a.id })}
                title={a.title}
                body={a.body}
                testId={`plan-activity-${a.id}`}
              />
            ))}
            {measuredActivity && (
              <BigChoice
                selected={form.activityLevel === MEASURED_ACTIVITY}
                onClick={() => set({ activityLevel: MEASURED_ACTIVITY })}
                title="Use what my watch measured"
                body={`About ${fmt(measuredActivity.mean)} calories of activity a day, over the last ${measuredActivity.days} days`}
                testId="plan-activity-measured"
              />
            )}
          </Choices>
          {form.activityLevel === MEASURED_ACTIVITY && measuredActivity && (
            <Typography variant="body2" data-testid="measured-activity-note" sx={{ color: 'text.secondary' }}>
              This uses your watch instead of a guess. It leaves out the calories you burn digesting food (about
              10% of what you eat), so it comes out a little low, which is the safe direction when losing weight.
            </Typography>
          )}
        </StepFrame>
      )}
    </Page>
  );
};

export default CalorieGoalWizard;
