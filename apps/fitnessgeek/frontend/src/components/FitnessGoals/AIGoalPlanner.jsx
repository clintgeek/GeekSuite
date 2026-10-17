import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, TextField, Button, CircularProgress, Chip, Card, CardContent,
  Stepper, Step, StepLabel, StepButton, Divider, FormControl, InputLabel, Select, MenuItem, Alert
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Restaurant as FoodIcon, Timeline as TimelineIcon, CheckCircle as CheckCircleIcon,
  Calculate as CalculateIcon, TrendingUp as TrendingUpIcon
} from '@mui/icons-material';
import { useToast } from '@geeksuite/ui';
import { userService } from '../../services/userService.js';
import { settingsService } from '../../services/settingsService.js';
import { bodyCompService } from '../../services/bodyCompService.js';
import { useAuth } from '@geeksuite/auth';
import { isPlanCalculationStale } from '@geeksuite/utils';
import ModeSelector from './ModeSelector';
import KetoPlanStep from './KetoPlanStep';
import { BmrSourceNote, MetabolismCard, PlanComparison, ProteinBasisNote, previewMacros } from './planProvenance.jsx';
import { planTarget, weekenderHasRoom, weekenderSuggestion, MEASURED_ACTIVITY, usableMeasuredActivity } from './planMath.js';
import { parseHeightToInches, buildCaloriePlan, nutritionGoalPayload } from './calorieCalc.js';
import QuickTarget from './QuickTarget.jsx';
import { influxService } from '../../services/influxService.js';
import { weightService } from '../../services/weightService.js';
import { localDateString } from '@geeksuite/utils';
import { useExperience } from '../../contexts/ExperienceContext.jsx';
import { errorMessage } from '../../utils/errorMessage.js';
import { currentAverage } from '../Weight/weightTrend.js';

const CalorieGoalWizard = () => {
  const { user } = useAuth();
  const theme = useTheme();
  const { notify } = useToast();
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  // True when the saved plan predates the BMR unit fix. See loadExistingGoal.
  const [planStale, setPlanStale] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [mode, setMode] = useState('standard');
  const [ketoConfig, setKetoConfig] = useState({
    net_carb_limit_g: 20,
    track_net_carbs: true,
    macro_split: { preset: 'classic', fat_pct: 70, protein_pct: 25, carb_pct: 5 }
  });

  // User profile data
  const [profile, setProfile] = useState({
    age: '',
    weight: '',
    height: '',
    gender: '',
    activityLevel: 'sedentary',
    currentFitnessLevel: 'beginner'
  });

  // Goal data
  const [goal, setGoal] = useState({
    targetWeight: '',
    weightChangeRate: '1', // lbs per week
    planType: 'standard',
    timeline: '',
    dailyCalories: 0,
    weeklyDeficit: 0
  });

  // Results
  const [plan, setPlan] = useState(null);
  const [hasExistingGoal, setHasExistingGoal] = useState(false);
  // The stored nutrition_goal, kept apart from `plan` so a re-run can show
  // saved-vs-new before anything is overwritten (plan D2), and so macro
  // previews merge the fields the save leaves untouched — the settings
  // mutation MERGES into nutrition_goal, it does not replace it.
  const [savedGoal, setSavedGoal] = useState(null);
  const [weightGoalTarget, setWeightGoalTarget] = useState(null);
  const [goalLoaded, setGoalLoaded] = useState(false);

  // The body-scan BMR summary (`bodyCompositionSummary.bmr`). `source ===
  // 'scan'` means the server found a usable lean mass: a 14-day mean, latest
  // scan ≤ 30 days old (plan D1). Anything else — no scans, stale scans, a
  // failed fetch — means Mifflin-St Jeor, and the card says so.
  const [scanBmr, setScanBmr] = useState(null);
  const [scanLoadFailed, setScanLoadFailed] = useState(false);
  // Garmin's measured active kcal (30-day mean) — offered in place of a
  // guessed activity multiplier when enough days exist (planMath.js).
  const [measuredActivity, setMeasuredActivity] = useState(null);
  const usableLeanMassLb = scanBmr?.source === 'scan' && Number(scanBmr?.lean_mass_lb) > 0
    ? Number(scanBmr.lean_mass_lb)
    : null;

  // Set only when a filled-in height fails every format parseHeightToInches
  // knows about. Distinct from "field is empty" (which just disables the
  // Next/Calculate buttons via the existing required-field check).
  const [heightError, setHeightError] = useState(false);
  // Where the prefilled weight came from: 'average' (7-day), 'latest', or null.
  const [weightBasis, setWeightBasis] = useState(null);

  // Simple's one-screen quick target (IA-1, L8): in Simple, or when Home
  // links here with ?quick=1. Read from window.location rather than the
  // router so the wizard still mounts on its own in a test. Full, without
  // the flag, is the four-step wizard, unchanged.
  const { isSimple, goal: experienceGoal } = useExperience();
  const [quickFlag] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('quick') === '1';
    } catch {
      return false;
    }
  });
  const quick = isSimple || quickFlag;

  // Load user profile and any existing saved goal on mount
  useEffect(() => {
    loadUserProfile();
    loadExistingGoal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildDaysFromSchedule = (scheduleArray) => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    if (!Array.isArray(scheduleArray) || scheduleArray.length !== 7) {
      return days.map((d) => ({ day: d, calories: 0 }));
    }
    return days.map((d, i) => ({ day: d, calories: Math.round(scheduleArray[i] || 0) }));
  };

  const loadExistingGoal = async () => {
    try {
      const resp = await settingsService.getSettings();
      const data = resp?.data || resp?.data?.data || resp;
      const ng = data?.nutrition_goal;
      // A plan saved before 2026-09-20 was built with the pounds-and-inches
      // BMR bug and is up to 45% too high. Its inputs were never persisted,
      // so it cannot be silently recomputed — the only honest handling is to
      // say so and let the user re-enter three fields.
      setPlanStale(isPlanCalculationStale(ng));
      // The weight goal's target, for the quick target's save (it asks how
      // fast, not where to).
      const wg = data?.weight_goal;
      const wgTarget = Number(wg?.targetWeight);
      setWeightGoalTarget(wg && (wg.enabled || wg.is_active) && wgTarget > 0 ? wgTarget : null);
      setSavedGoal(ng && ng.enabled ? ng : null);
      if (ng && ng.enabled) {
        const computedWeeklyDeficit = (ng.weight_change_rate || 0) * 500;
        const scheduleDays = buildDaysFromSchedule(ng.weekly_schedule);
        // A saved plan carries its TDEE and floor, so whether it was clamped
        // to the floor — and the rate it really delivers — can be recomputed
        // for display. Plans saved before 2026-09-23 stored the REQUESTED rate
        // even when the floor made it unreachable.
        const savedTarget = Number(ng.tdee) > 0 && Number(ng.min_safe_calories) > 0 && Number(ng.weight_change_rate) > 0
          ? planTarget({ tdee: Number(ng.tdee), requestedRate: ng.weight_change_rate, minSafe: Number(ng.min_safe_calories) })
          : null;
        const derivedPlan = {
          currentWeight: ng.start_weight || parseFloat(profile.weight) || 0,
          targetWeight: ng.target_weight || 0,
          weightToLose: ng.start_weight && ng.target_weight ? Math.abs(ng.start_weight - ng.target_weight) : 0,
          bmr: Math.round(ng.bmr || 0),
          bmrSource: ng.bmr_source === 'scan' ? 'scan' : 'mifflin',
          leanMassLb: ng.lean_mass_lb ?? null,
          bmrScans: null,
          tdee: Math.round(ng.tdee || 0),
          dailyCalories: Math.round(ng.daily_calorie_target || 0),
          weeklyDeficit: Math.round(computedWeeklyDeficit || 0),
          timeline: ng.timeline_weeks || 0,
          activityLevel: ng.activity_level || profile.activityLevel,
          weightChangeRate: savedTarget ? savedTarget.effectiveRate : (ng.weight_change_rate || 0),
          requestedRate: ng.weight_change_rate || 0,
          floored: Boolean(savedTarget?.floored),
          planType: ng.plan_type || 'standard',
          schedule: scheduleDays,
          weekenderSuggestion: savedTarget && ng.plan_type === 'weekender'
            ? weekenderSuggestion({ tdee: ng.tdee, minSafe: ng.min_safe_calories, currentRate: savedTarget.effectiveRate })
            : null,
          rules: {
            minSafeCalories: ng.min_safe_calories || 1200,
            capPercent: 20,
            // A previously-saved goal always had a real BMR at save time
            // (the Step 1 gate and calculateCaloriePlan's guard both saw to
            // that) — this just keeps the Safety Check card consistent for
            // goals loaded back from settings rather than freshly computed.
            calculationValid: Math.round(ng.bmr || 0) > 0,
            autoAdjust: (ng.plan_type === 'auto')
          }
        };
        setPlan(derivedPlan);
        setHasExistingGoal(true);
        setActiveStep(3);
        if (ng.mode) setMode(ng.mode);
        if (ng.keto) setKetoConfig(ng.keto);
      }
    } catch {
      // no-op
    } finally {
      setGoalLoaded(true);
    }
  };

  const loadUserProfile = async () => {
    try {
      setIsLoadingProfile(true);

      // Profile (baseGeek), latest weight (fitnessGeek) and the body-scan
      // BMR in parallel. The profile step's spinner covers all three, so a
      // plan can't be calculated before we know whether a scan exists.
      const [userData, latestWeight, averageWeight] = await Promise.all([
        userService.getProfile(),
        userService.getLatestWeight(),
        loadAverageWeight(),
        loadScanBmr(),
        loadMeasuredActivity(),
      ]);

      // The 7-day average is the plan's starting weight — the same basis as
      // the weight goal card's "to go" (D-3). Before, this was the single
      // latest weigh-in, and the wizard's "lb to lose" and the card's "to go"
      // disagreed by more than a pound. The latest reading is the fallback.
      const startWeight = averageWeight || latestWeight;
      setWeightBasis(averageWeight ? 'average' : (latestWeight ? 'latest' : null));
      setProfile({
        age: userData?.profile?.age || '',
        height: userData?.profile?.height || '',
        gender: userData?.profile?.gender || '',
        weight: startWeight ? startWeight.toString() : '',
        activityLevel: 'sedentary',
        currentFitnessLevel: 'beginner'
      });
    } catch (error) {
      console.error('Failed to load user profile:', error);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // The 7-day average the weight goal card shows, computed by the SAME helper
  // (weightTrend.currentAverage) over the same logs, so the wizard's "to lose"
  // and the card's "to go" can't drift apart (review D-3). Null when it can't
  // be had.
  const loadAverageWeight = async () => {
    try {
      const response = await weightService.getWeightLogs();
      const mean = Number(currentAverage(Array.isArray(response?.data) ? response.data : []));
      return Number.isFinite(mean) && mean > 0 ? mean : null;
    } catch {
      return null;
    }
  };

  // Not fatal and not announced: without Garmin/Influx the option simply
  // isn't offered (a user without the integration gets a 403 here).
  const loadMeasuredActivity = async () => {
    try {
      const trends = await influxService.getTrends({ days: 30, end: localDateString() });
      setMeasuredActivity(usableMeasuredActivity(trends?.activeKcal30));
    } catch {
      setMeasuredActivity(null);
    }
  };

  const loadScanBmr = async () => {
    try {
      const resp = await bodyCompService.getSummary();
      const summary = resp?.data ?? resp;
      setScanBmr(summary?.bmr || null);
      setScanLoadFailed(false);
    } catch (error) {
      // Not fatal: Mifflin-St Jeor is the fallback, and the metabolism card
      // names it (and says the scans couldn't be loaded).
      console.error('Failed to load body scans:', error);
      setScanBmr(null);
      setScanLoadFailed(true);
    }
  };

  // The plan arithmetic lives in calorieCalc.js (pure, shared with the
  // quick target): Mifflin-St Jeor or Katch-McArdle, TDEE, the safety floor
  // and the rate the floor really delivers.
  const calculateCaloriePlan = () => {
    const next = buildCaloriePlan({ profile, goal, usableLeanMassLb, scanBmr, measuredActivity });

    // Belt-and-suspenders: the Step 1 "Next" button is gated on a parseable
    // height, so in practice this branch shouldn't be reachable from the UI.
    // But a null/0 height used to become a BMR of 0, then a "Safe" plan — so
    // it gets its own guard rather than trusting the earlier gate.
    if (next.heightError) {
      setHeightError(true);
      return;
    }
    setHeightError(false);

    setGoal(prev => ({
      ...prev,
      dailyCalories: next.dailyCalories,
      weeklyDeficit: next.weeklyDeficit,
      timeline: next.timeline
    }));

    setPlan(next);
    setActiveStep(3);
  };

  const handleSaveProfile = async () => {
    try {
      const profileUpdates = {};
      if (profile.age && !user.profile?.age) profileUpdates.age = profile.age;
      if (profile.height && !user.profile?.height) profileUpdates.height = profile.height;
      if (profile.gender && !user.profile?.gender) profileUpdates.gender = profile.gender;

      if (Object.keys(profileUpdates).length > 0) {
        await userService.updateProfile(profileUpdates);
        notify('Profile updated successfully!', { tone: 'success' });
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
      notify(errorMessage(error, "Couldn't update your profile. Try again."), { tone: 'error' });
    }
  };

  // What the user has saved today, for the old-vs-new comparison. Null when
  // there is no saved plan, so a first-time run shows no comparison.
  const savedSnapshot = savedGoal && Number(savedGoal.daily_calorie_target) > 0
    ? {
      dailyCalories: Math.round(savedGoal.daily_calorie_target),
      bmr: Math.round(savedGoal.bmr || 0) || null,
      schedule: savedGoal.weekly_schedule,
      stale: isPlanCalculationStale(savedGoal),
    }
    : null;

  // Standard-mode macro grams at the base daily target, as derivedMacros
  // will serve them after this plan is saved (fixed/weekly use the same
  // rules; weekender days differ only in carbs).
  const standardMacroPreview = plan && mode !== 'keto' && plan.dailyCalories > 0
    ? previewMacros(
      hasExistingGoal
        ? { ...(savedGoal || {}), mode: 'standard' }
        : { ...(savedGoal || {}), mode: 'standard', target_weight: plan.targetWeight, goal_weight_lbs: plan.targetWeight },
      { leanMassLb: usableLeanMassLb, calories: plan.dailyCalories }
    )
    : null;

  const steps = ['Your Approach', 'Your Profile', 'Set Your Goal', 'Your Calorie Plan'];

  if (quick) {
    return (
      <QuickTarget
        loading={isLoadingProfile || !goalLoaded}
        initialProfile={profile}
        weightBasis={weightBasis}
        maintain={experienceGoal === 'maintain'}
        targetWeight={weightGoalTarget ?? (Number(savedGoal?.target_weight) > 0 ? Number(savedGoal.target_weight) : null)}
        currentTarget={Number(savedGoal?.daily_calorie_target) > 0 ? Math.round(savedGoal.daily_calorie_target) : null}
        usableLeanMassLb={usableLeanMassLb}
        scanBmr={scanBmr}
        scanLoadFailed={scanLoadFailed}
        onSaved={loadExistingGoal}
      />
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <FoodIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>Calorie Goal Wizard</Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mb: 3 }}>
          Set your weight goal and get a personalized calorie plan
        </Typography>
      </Box>

      {/* Stepper (hide when showing existing goal summary). Steps the user has
          already completed are clickable so Step 1 (and beyond) has a way
          back to Step 0 — previously the only exits from Step 1 were "Save
          Profile" and "Next", with no way to revisit the standard-vs-keto
          choice short of abandoning the wizard. Steps ahead of activeStep
          stay inert: clicking forward would skip the required-field checks
          each step guards. */}
      {/* A plan saved before 2026-09-20 was computed by feeding pounds and
          inches to a formula that wants kilograms and centimetres, so its
          calorie target is 11-45% too high — worse the heavier the person.
          The planner of that era saved only its outputs, so there is nothing
          to recompute FROM: this cannot be repaired silently, and leaving it
          unmentioned would mean someone eating to a maintenance number while
          the app calls them compliant. Hence a plain warning that survives
          until the plan is re-saved, rather than a toast. */}
      {planStale && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          This plan was calculated with a unit error that made its calorie
          target too high — by more than 20% for many people. The original
          height, weight and age weren&apos;t saved, so it can&apos;t be
          corrected automatically. Re-run the planner to get an accurate
          target.
        </Alert>
      )}

      {!hasExistingGoal && (
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label, index) => (
            <Step key={label}>
              {index < activeStep ? (
                <StepButton onClick={() => setActiveStep(index)}>{label}</StepButton>
              ) : (
                <StepLabel>{label}</StepLabel>
              )}
            </Step>
          ))}
        </Stepper>
      )}

      {/* Step 0: Mode Selector */}
      {!hasExistingGoal && activeStep === 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h5" sx={{ fontFamily: 'inherit', mb: 1 }}>
            Choose your approach
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            This shapes how your goals and dashboard are displayed.
          </Typography>
          <ModeSelector value={mode} onChange={setMode} />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
            <Button variant="contained" onClick={() => setActiveStep(1)}>
              Continue
            </Button>
          </Box>
        </Box>
      )}

      {/* Step 1: Profile */}
      {!hasExistingGoal && activeStep === 1 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalculateIcon sx={{ color: 'primary.main' }} />
            Your Profile
          </Typography>

          {isLoadingProfile ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                label="Age"
                type="number"
                inputMode="decimal"
                value={profile.age}
                onChange={(e) => setProfile(prev => ({ ...prev, age: e.target.value }))}
                size="small"
              />
              <TextField
                label="Current Weight (lbs)"
                type="number"
                inputMode="decimal"
                value={profile.weight}
                onChange={(e) => setProfile(prev => ({ ...prev, weight: e.target.value }))}
                size="small"
              />
              <TextField
                label="Height"
                placeholder={"5'11\""}
                value={profile.height}
                onChange={(e) => {
                  setProfile(prev => ({ ...prev, height: e.target.value }));
                  // Clear a stale error the instant the user edits the field
                  // again — don't leave yesterday's error glued to today's input.
                  if (heightError) setHeightError(false);
                }}
                size="small"
                // Live validation: as soon as there's SOMETHING in the field,
                // tell the user right away whether we can read it, instead of
                // waiting for a "Calculate My Plan" click three steps later
                // to discover the height silently became a BMR of 0.
                error={!!profile.height && parseHeightToInches(profile.height) === null}
                helperText={
                  !!profile.height && parseHeightToInches(profile.height) === null
                    ? "Can't read that height — try 5'11\", 5 ft 11, or 71 (inches)"
                    : "Formats: 5'11\", 5 ft 11, or 71 (inches)"
                }
              />
              <FormControl size="small">
                <InputLabel>Gender</InputLabel>
                <Select
                  value={profile.gender}
                  onChange={(e) => setProfile(prev => ({ ...prev, gender: e.target.value }))}
                  label="Gender"
                >
                  <MenuItem value="">Select gender</MenuItem>
                  <MenuItem value="male">Male</MenuItem>
                  <MenuItem value="female">Female</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                  <MenuItem value="prefer-not-to-say">Prefer not to say</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small">
                {/* labelId links the label to the select: without it the
                    control had no accessible name at all. */}
                <InputLabel id="wizard-activity-level-label">Activity Level</InputLabel>
                <Select
                  labelId="wizard-activity-level-label"
                  value={profile.activityLevel}
                  onChange={(e) => setProfile(prev => ({ ...prev, activityLevel: e.target.value }))}
                  label="Activity Level"
                >
                  <MenuItem value="sedentary">Sedentary (little to no exercise)</MenuItem>
                  <MenuItem value="light">Lightly Active (light exercise 1-3 days/week)</MenuItem>
                  <MenuItem value="moderate">Moderately Active (moderate exercise 3-5 days/week)</MenuItem>
                  <MenuItem value="very">Very Active (hard exercise 6-7 days/week)</MenuItem>
                  <MenuItem value="extra">Extra Active (very hard exercise, physical job)</MenuItem>
                  {measuredActivity && (
                    <MenuItem value={MEASURED_ACTIVITY}>
                      {`Measured by Garmin (+${measuredActivity.mean.toLocaleString('en-US')} kcal/day, last ${measuredActivity.days} days)`}
                    </MenuItem>
                  )}
                  {!measuredActivity && profile.activityLevel === MEASURED_ACTIVITY && (
                    <MenuItem value={MEASURED_ACTIVITY} disabled>Measured by Garmin (no recent data — pick a level)</MenuItem>
                  )}
                </Select>
              </FormControl>
              {profile.activityLevel === MEASURED_ACTIVITY && measuredActivity && (
                <Typography variant="caption" data-testid="measured-activity-note" sx={{ color: 'text.secondary', gridColumn: '1 / -1' }}>
                  Your BMR plus the activity your watch measured. It leaves out digestion (about 10% of what you eat), so it errs low — the safe direction for losing weight.
                </Typography>
              )}
            </Box>
          )}

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={() => setActiveStep(0)}
            >
              Back
            </Button>
            <Button
              variant="outlined"
              onClick={handleSaveProfile}
              disabled={
                !profile.age || !profile.weight || !profile.height || !profile.gender ||
                parseHeightToInches(profile.height) === null
              }
            >
              Save Profile
            </Button>
            <Button
              variant="contained"
              onClick={() => setActiveStep(2)}
              disabled={
                !profile.age || !profile.weight || !profile.height || !profile.gender ||
                parseHeightToInches(profile.height) === null
              }
              sx={{ bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
            >
              Next: Set Goal
            </Button>
          </Box>
        </Paper>
      )}

      {/* Step 2: Goal Setting */}
      {!hasExistingGoal && activeStep === 2 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrendingUpIcon sx={{ color: 'primary.main' }} />
            Set Your Weight Goal
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
            <TextField
              label="Target Weight (lbs)"
              type="number"
                inputMode="decimal"
              value={goal.targetWeight}
              onChange={(e) => setGoal(prev => ({ ...prev, targetWeight: e.target.value }))}
              size="small"
            />
            <FormControl size="small">
              <InputLabel>Weight Change Rate</InputLabel>
              <Select
                value={goal.weightChangeRate}
                onChange={(e) => setGoal(prev => ({ ...prev, weightChangeRate: e.target.value }))}
                label="Weight Change Rate"
              >
                <MenuItem value="0.5">0.5 lb/week (slow & steady)</MenuItem>
                <MenuItem value="1">1 lb/week (recommended)</MenuItem>
                <MenuItem value="1.5">1.5 lb/week (moderate)</MenuItem>
                <MenuItem value="2">2 lb/week (aggressive)</MenuItem>
                <MenuItem value="2.5">2.5 lb/week (very aggressive)</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small">
              <InputLabel>Plan Type</InputLabel>
              <Select
                value={goal.planType}
                onChange={(e) => setGoal(prev => ({ ...prev, planType: e.target.value }))}
                label="Plan Type"
              >
                <MenuItem value="standard">Standard (same every day)</MenuItem>
                <MenuItem value="weekender">Weekender (Fri/Sat higher)</MenuItem>
                <MenuItem value="auto">Auto (recalculate if over)</MenuItem>
                <MenuItem value="stepFlex" disabled>Step/workout flex (coming soon)</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Preview calculations */}
          {profile.weight && goal.targetWeight && (
            <Card sx={{ mb: 3, bgcolor: 'background.default' }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                  Goal Preview
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Current Weight</Typography>
                    <Typography variant="h6">{profile.weight} lbs</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Target Weight</Typography>
                    <Typography variant="h6">{goal.targetWeight} lbs</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Weight to Lose</Typography>
                    <Typography variant="h6" sx={{ color: theme.palette.error.main }}>
                      {Math.abs(parseFloat(profile.weight) - parseFloat(goal.targetWeight)).toFixed(1)} lbs
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Timeline</Typography>
                    <Typography variant="h6">
                      {Math.ceil(Math.abs(parseFloat(profile.weight) - parseFloat(goal.targetWeight)) / parseFloat(goal.weightChangeRate))} weeks
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Should be unreachable — Step 1 already blocks an unparseable
              height — but calculateCaloriePlan sets this if it's ever hit
              anyway, and it must produce a visible error, not a plan built
              on a BMR of 0. */}
          {heightError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              We couldn't calculate your plan — the height on your profile
              couldn't be read. Go back to Step 1 and re-enter it (e.g. 5'11", 5 ft 11, or 71 inches).
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={() => setActiveStep(1)}
            >
              Back
            </Button>
            <Button
              variant="contained"
              onClick={calculateCaloriePlan}
              disabled={!goal.targetWeight || !goal.weightChangeRate}
              sx={{ bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
            >
              Calculate My Plan
            </Button>
          </Box>
        </Paper>
      )}

      {/* Step 3b: Keto Plan (shown when mode === 'keto', new goal only) */}
      {!hasExistingGoal && mode === 'keto' && plan && activeStep === 3 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h5" sx={{ fontFamily: 'inherit', mb: 3 }}>
            Configure Your Keto Plan
          </Typography>
          <PlanComparison saved={savedSnapshot} next={plan} />
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" sx={{ color: 'text.primary' }}>
              BMR {Number(plan.bmr).toLocaleString('en-US')} cal a day · daily target {Number(plan.dailyCalories).toLocaleString('en-US')} cal
            </Typography>
            <BmrSourceNote source={plan.bmrSource} leanMassLb={plan.leanMassLb} scans={plan.bmrScans} scanLoadFailed={scanLoadFailed} />
          </Box>
          <KetoPlanStep
            ketoConfig={ketoConfig}
            onChange={setKetoConfig}
            calorieTarget={plan?.dailyCalories}
            baseGoal={{ ...(savedGoal || {}), target_weight: plan.targetWeight, goal_weight_lbs: plan.targetWeight }}
            leanMassLb={usableLeanMassLb}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
            <Button onClick={() => setActiveStep(2)}>Back</Button>
            <Button
              variant="contained"
              onClick={async () => {
                try {
                  await settingsService.updateSettings({
                    nutrition_goal: nutritionGoalPayload(plan, { mode, keto: ketoConfig }),
                  });
                  notify('Keto goal saved. Tracking started!', { tone: 'success' });
                  setHasExistingGoal(true);
                  await loadExistingGoal();
                } catch (e) {
                  console.error('Failed to save keto goal', e);
                  notify(errorMessage(e, "Couldn't save your keto goal. Try again."), { tone: 'error' });
                }
              }}
            >
              Start Tracking
            </Button>
          </Box>
        </Box>
      )}

      {/* Step 3a: Keto Existing Summary (shown when hasExistingGoal and mode=keto) */}
      {hasExistingGoal && mode === 'keto' && plan && activeStep >= 3 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircleIcon sx={{ color: theme.palette.warning.main }} />
            Your Keto Plan
          </Typography>
          <Card sx={{ mb: 3, bgcolor: 'background.default', border: '2px solid', borderColor: 'warning.main' }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 1, color: 'warning.main', fontFamily: 'inherit' }}>
                {ketoConfig.net_carb_limit_g}g net carbs / day
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                {ketoConfig.macro_split?.preset === 'lazy'
                  ? 'Lazy Keto — watching the carb cap only.'
                  : `Macro split: ${ketoConfig.macro_split?.fat_pct ?? 70}% fat · ${ketoConfig.macro_split?.protein_pct ?? 25}% protein · ${ketoConfig.macro_split?.carb_pct ?? 5}% carbs`}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip label={`${Number(plan.dailyCalories).toLocaleString('en-US')} cal a day`} variant="outlined" />
                <Chip label={`${ketoConfig.track_net_carbs ? 'Net carbs' : 'Total carbs'}`} variant="outlined" color="warning" />
                {plan.weightToLose > 0 && <Chip label={`${plan.weightToLose.toFixed(1)} lbs to goal`} variant="outlined" />}
              </Box>
            </CardContent>
          </Card>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              onClick={() => {
                setGoal(prev => ({
                  ...prev,
                  targetWeight: plan.targetWeight?.toString() || prev.targetWeight,
                  weightChangeRate: plan.weightChangeRate?.toString() || prev.weightChangeRate,
                  planType: plan.planType || prev.planType
                }));
                setHasExistingGoal(false);
                setActiveStep(0);
              }}
              sx={{ bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
            >
              Update
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={async () => {
                try {
                  await settingsService.updateSettings({ nutrition_goal: { enabled: false } });
                  setHasExistingGoal(false);
                  setPlan(null);
                  notify('Keto goal removed.', { tone: 'success' });
                } catch (e) {
                  console.error('Failed to remove keto goal', e);
                  notify(errorMessage(e, "Couldn't remove your keto goal. Try again."), { tone: 'error' });
                }
              }}
            >
              Remove Goal
            </Button>
          </Box>
        </Paper>
      )}

      {/* Step 3a: Calorie Plan or Existing Summary (standard mode) */}
      {(mode === 'standard' || (hasExistingGoal && mode !== 'keto')) && plan && activeStep >= 3 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircleIcon sx={{ color: 'success.main' }} />
            Your Personalized Calorie Plan
          </Typography>

          {/* Saved vs new — only while re-running over an existing plan */}
          {!hasExistingGoal && <PlanComparison saved={savedSnapshot} next={plan} />}

          {/* Summary Card */}
          <Card sx={{ mb: 3, bgcolor: 'background.default', border: '2px solid', borderColor: 'primary.main' }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, color: 'primary.main' }}>
                Your daily target: {Number(plan.dailyCalories).toLocaleString('en-US')} calories
              </Typography>
              <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                This will help you lose {plan.weightChangeRate} lb per week safely and sustainably.
              </Typography>
              <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                Plan Type: {plan.planType === 'standard' ? 'Standard' : plan.planType === 'weekender' ? 'Weekender' : 'Auto adjust'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip label={`${ plan.weightToLose.toFixed(1) } lbs to lose`} color="primary" />
                <Chip label={`${ plan.timeline } weeks`} variant="outlined" />
                <Chip label={`${ plan.weightChangeRate } lb/week`} variant="outlined" />
              </Box>
              {standardMacroPreview && (
                <Box sx={{ mt: 2 }} data-testid="macro-preview">
                  <Typography variant="body2" sx={{ color: 'text.primary', fontFamily: "inherit", fontVariantNumeric: 'tabular-nums' }}>
                    Protein {standardMacroPreview.grams.protein_g}g · Fat {standardMacroPreview.grams.fat_g}g · Carbs {standardMacroPreview.grams.carbs_g}g
                  </Typography>
                  <ProteinBasisNote rules={standardMacroPreview.rules} />
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Weekly Targets */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Weekly Targets
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', sm: 'repeat(7, minmax(0, 1fr))' }, gap: 1 }}>
                {plan.schedule.map((d) => (
                  <Box key={d.day} sx={{ textAlign: 'center', p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{d.day}</Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{d.calories}</Typography>
                  </Box>
                ))}
              </Box>
              {plan.floored && (
                <Typography variant="body2" data-testid="plan-floor-note" sx={{ color: 'text.secondary', mt: 1.5 }}>
                  {`Your target is at the safety floor (${plan.rules?.minSafeCalories?.toLocaleString('en-US')} cal, 80% of your BMR), so this plan loses about ${plan.weightChangeRate} lb/week, not ${plan.requestedRate}. The timeline uses ${plan.weightChangeRate}.`}
                </Typography>
              )}
              {plan.planType === 'weekender' && !weekenderHasRoom(plan.schedule) && (
                <Typography variant="body2" data-testid="plan-weekender-note" sx={{ color: 'text.secondary', mt: 1 }}>
                  {plan.weekenderSuggestion
                    ? `No room for bigger weekends at this rate: every day is already at the floor. At ${plan.weekenderSuggestion.rate} lb/week you'd eat ${plan.weekenderSuggestion.weekday.toLocaleString('en-US')} on other days and ${plan.weekenderSuggestion.weekend.toLocaleString('en-US')} on Fri and Sat.`
                    : 'No room for bigger weekends: every day is already at the safety floor, even at the slowest rate.'}
                </Typography>
              )}
              {plan.rules?.autoAdjust && (
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                  Auto mode: If you go over on a day, remaining days will adjust while staying above {Number(plan.rules.minSafeCalories).toLocaleString('en-US')} cal.
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Detailed Breakdown */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3, mb: 3 }}>
            <MetabolismCard plan={plan} scanLoadFailed={!hasExistingGoal && scanLoadFailed} />

            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Your Deficit
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>Daily Calorie Deficit</Typography>
                  {/* The plan, not a problem: neutral ink (D-12). */}
                  <Typography variant="h6" sx={{ color: 'text.primary' }}>
                    {Number(plan.weeklyDeficit).toLocaleString('en-US')} cal a day
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {(plan.weeklyDeficit * 7).toLocaleString('en-US')} cal a week = {plan.weightChangeRate} lb a week
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>Safety Check</Typography>
                  {/* `calculationValid` (bmr > 0) gates this before the calorie
                      floor does. dailyCalories >= 1200 is true of every plan,
                      including one built on a BMR that never actually
                      computed — that plan should never be able to say "Safe". */}
                  <Typography
                    variant="h6"
                    sx={{
                      color: !plan.rules?.calculationValid
                        ? theme.palette.error.main
                        : plan.dailyCalories >= 1200
                          ? theme.palette.success.main
                          : theme.palette.warning.main
                    }}
                  >
                    {!plan.rules?.calculationValid
                      ? 'Calculation error'
                      : plan.dailyCalories >= 1200 ? 'Safe' : 'Below minimum'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {!plan.rules?.calculationValid
                      ? "Your height couldn't be read, so this plan isn't reliable"
                      : 'Minimum recommended: 1,200 cal a day'}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Box>

          {/* Tips */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Tips for Success
              </Typography>
              <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                <li>
                  <Typography variant="body2">
                    Track your calories consistently using the food logging feature
                  </Typography>
                </li>
                <li>
                  <Typography variant="body2">
                    Weigh yourself weekly to monitor progress
                  </Typography>
                </li>
                <li>
                  <Typography variant="body2">
                    If you're not losing weight, reduce calories by 100-200 per day
                  </Typography>
                </li>
                <li>
                  <Typography variant="body2">
                    If you're losing too fast, increase calories by 100-200 per day
                  </Typography>
                </li>
                <li>
                  <Typography variant="body2">
                    Focus on protein-rich foods to maintain muscle mass
                  </Typography>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Box sx={{ display: 'flex', gap: 2 }}>
            {hasExistingGoal ? (
              <>
                <Button
                  variant="contained"
                  onClick={() => {
                    // Prefill wizard from existing plan and return to step 0 so mode can be changed
                    setGoal(prev => ({
                      ...prev,
                      targetWeight: plan.targetWeight?.toString() || prev.targetWeight,
                      weightChangeRate: plan.weightChangeRate?.toString() || prev.weightChangeRate,
                      planType: plan.planType || prev.planType
                    }));
                    setHasExistingGoal(false);
                    setActiveStep(0);
                  }}
                  sx={{ bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
                >
                  Update
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={async () => {
                    try {
                      await settingsService.updateSettings({ nutrition_goal: { enabled: false } });
                      setHasExistingGoal(false);
                      setPlan(null);
                      notify('Calorie goal removed.', { tone: 'success' });
                    } catch (e) {
                      console.error('Failed to remove nutrition goal', e);
                      notify(errorMessage(e, "Couldn't remove your calorie goal. Try again."), { tone: 'error' });
                    }
                  }}
                >
                  Remove Goal
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outlined"
                  onClick={() => setActiveStep(2)}
                >
                  Back
                </Button>
                <Button
                  variant="contained"
                  onClick={async () => {
                    try {
                      await settingsService.updateSettings({
                        nutrition_goal: nutritionGoalPayload(plan, { mode, keto: mode === 'keto' ? ketoConfig : undefined }),
                      });
                      notify('Calorie goal saved. Tracking started!', { tone: 'success' });
                      setHasExistingGoal(true);
                      // Refresh from backend to ensure we reflect the persisted state
                      await loadExistingGoal();
                    } catch (e) {
                      console.error('Failed to save nutrition goal', e);
                      notify(errorMessage(e, "Couldn't save your calorie goal. Try again."), { tone: 'error' });
                    }
                  }}
                  sx={{ bgcolor: 'success.main', '&:hover': { bgcolor: 'success.dark' } }}
                >
                  Start Tracking
                </Button>
              </>
            )}
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default CalorieGoalWizard;
