import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, TextField, Button, CircularProgress, Alert, Chip, Card, CardContent,
  Stepper, Step, StepLabel, Divider, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import {
  Restaurant as FoodIcon, Timeline as TimelineIcon, CheckCircle as CheckCircleIcon,
  Calculate as CalculateIcon, TrendingUp as TrendingUpIcon
} from '@mui/icons-material';
import { userService } from '../../services/userService.js';
import { settingsService } from '../../services/settingsService.js';
import { useAuth } from '../../hooks/useAuth.js';

const CalorieGoalWizard = () => {
  const { user } = useAuth();
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [success, setSuccess] = useState('');

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
      if (ng && ng.enabled) {
        const computedWeeklyDeficit = (ng.weight_change_rate || 0) * 500;
        const scheduleDays = buildDaysFromSchedule(ng.weekly_schedule);
        const derivedPlan = {
          currentWeight: ng.start_weight || parseFloat(profile.weight) || 0,
          targetWeight: ng.target_weight || 0,
          weightToLose: ng.start_weight && ng.target_weight ? Math.abs(ng.start_weight - ng.target_weight) : 0,
          bmr: Math.round(ng.bmr || 0),
          tdee: Math.round(ng.tdee || 0),
          dailyCalories: Math.round(ng.daily_calorie_target || 0),
          weeklyDeficit: Math.round(computedWeeklyDeficit || 0),
          timeline: ng.timeline_weeks || 0,
          activityLevel: ng.activity_level || profile.activityLevel,
          weightChangeRate: ng.weight_change_rate || 0,
          planType: ng.plan_type || 'standard',
          schedule: scheduleDays,
          rules: {
            minSafeCalories: ng.min_safe_calories || 1200,
            capPercent: 20,
            autoAdjust: (ng.plan_type === 'auto')
          }
        };
        setPlan(derivedPlan);
        setHasExistingGoal(true);
        setActiveStep(2);
      }
    } catch {
      // no-op
    }
  };

  const loadUserProfile = async () => {
    try {
      setIsLoadingProfile(true);

      // Get user profile from baseGeek
      const userData = await userService.getProfile();

      // Get latest weight from fitnessGeek logs
      const latestWeight = await userService.getLatestWeight();

      setProfile({
        age: userData.profile?.age || '',
        height: userData.profile?.height || '',
        gender: userData.profile?.gender || '',
        weight: latestWeight ? latestWeight.toString() : '',
        activityLevel: 'sedentary',
        currentFitnessLevel: 'beginner'
      });
    } catch (error) {
      console.error('Failed to load user profile:', error);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const calculateBMR = () => {
    const { age, weight, height, gender } = profile;
    if (!age || !weight || !height || !gender) return 0;

    // Convert height from "5'11" format to inches
    const heightInches = parseHeightToInches(height);
    if (!heightInches) return 0;

    // Mifflin-St Jeor Equation
    let bmr = 10 * parseFloat(weight) + 6.25 * heightInches - 5 * parseFloat(age);
    bmr = gender === 'male' ? bmr + 5 : bmr - 161;

    return Math.round(bmr);
  };

  const parseHeightToInches = (height) => {
    const match = height.match(/(\d+)'(\d+)"/);
    if (match) {
      return parseInt(match[1]) * 12 + parseInt(match[2]);
    }
    return null;
  };

  const calculateTDEE = (bmr) => {
    const activityMultipliers = {
      sedentary: 1.2,      // Little to no exercise
      light: 1.375,         // Light exercise 1-3 days/week
      moderate: 1.55,       // Moderate exercise 3-5 days/week
      very: 1.725,          // Hard exercise 6-7 days/week
      extra: 1.9            // Very hard exercise, physical job
    };

    return Math.round(bmr * activityMultipliers[profile.activityLevel]);
  };

  const getMinSafeCalories = (bmr) => {
    // Minimum recommended calories: max(1200, BMR - 20%)
    return Math.max(1200, Math.round(bmr * 0.8));
  };

  const computeWeeklySchedule = (planType, baseTarget, bmr) => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const minCals = getMinSafeCalories(bmr);
    const capPercent = 0.2; // ±20%
    const maxCals = Math.round(baseTarget * (1 + capPercent));
    const minCalsCapped = Math.max(minCals, Math.round(baseTarget * (1 - capPercent)));

    if (planType === 'standard') {
      return days.map((d) => ({ day: d, calories: Math.round(baseTarget) }));
    }

    if (planType === 'weekender') {
      // Extra calories on Fri/Sat (+15% each), reduce other 5 days to maintain weekly average
      const increasePercent = 0.15;
      const increaseEach = baseTarget * increasePercent;
      const initialIncreaseTotal = increaseEach * 2;

      // Compute how much we can reduce on non-weekender days without going under floor
      const potentialReductionPerWeekday = Math.max(baseTarget - minCalsCapped, 0);
      const maxReductionTotal = potentialReductionPerWeekday * 5;
      const actualIncreaseTotal = Math.min(initialIncreaseTotal, maxReductionTotal);
      const actualIncreaseEach = actualIncreaseTotal / 2;
      const reductionPerWeekday = actualIncreaseTotal / 5;

      const result = days.map((d, idx) => {
        const isFri = idx === 4;
        const isSat = idx === 5;
        let cals = baseTarget;
        if (isFri || isSat) cals = baseTarget + actualIncreaseEach;
        else cals = baseTarget - reductionPerWeekday;
        cals = Math.round(Math.min(maxCals, Math.max(minCalsCapped, cals)));
        return { day: d, calories: cals };
      });
      return result;
    }

    if (planType === 'auto') {
      // Start with standard schedule; runtime auto-adjust happens during logging
      return days.map((d) => ({ day: d, calories: Math.round(baseTarget) }));
    }

    // Fallback
    return days.map((d) => ({ day: d, calories: Math.round(baseTarget) }));
  };

  const calculateCaloriePlan = () => {
    const bmr = calculateBMR();
    const tdee = calculateTDEE(bmr);
    const weightToLose = parseFloat(profile.weight) - parseFloat(goal.targetWeight);
    const weeklyDeficit = parseFloat(goal.weightChangeRate) * 500; // 1 lb = 3500 calories, so 1 lb/week = 500 cal/day deficit
    const minSafe = getMinSafeCalories(bmr);
    const dailyCalories = Math.max(tdee - weeklyDeficit, minSafe);
    const timeline = Math.ceil(Math.abs(weightToLose) / parseFloat(goal.weightChangeRate));

    setGoal(prev => ({
      ...prev,
      dailyCalories,
      weeklyDeficit,
      timeline
    }));

    // Create the plan
    const plan = {
      currentWeight: parseFloat(profile.weight),
      targetWeight: parseFloat(goal.targetWeight),
      weightToLose: Math.abs(weightToLose),
      bmr,
      tdee,
      dailyCalories,
      weeklyDeficit,
      timeline,
      activityLevel: profile.activityLevel,
      weightChangeRate: parseFloat(goal.weightChangeRate),
      planType: goal.planType,
      schedule: computeWeeklySchedule(goal.planType, dailyCalories, bmr),
      rules: {
        minSafeCalories: minSafe,
        capPercent: 20,
        autoAdjust: goal.planType === 'auto'
      }
    };

    setPlan(plan);
    setActiveStep(2);
  };

  const handleSaveProfile = async () => {
    try {
      const profileUpdates = {};
      if (profile.age && !user.profile?.age) profileUpdates.age = profile.age;
      if (profile.height && !user.profile?.height) profileUpdates.height = profile.height;
      if (profile.gender && !user.profile?.gender) profileUpdates.gender = profile.gender;

      if (Object.keys(profileUpdates).length > 0) {
        await userService.updateProfile(profileUpdates);
        setSuccess('Profile updated successfully!');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
    }
  };

  const steps = ['Your Profile', 'Set Your Goal', 'Your Calorie Plan'];

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <FoodIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>Calorie Goal Wizard</Typography>
        <Typography variant="body1" sx={{ color: '#666', mb: 3 }}>
          Set your weight goal and get a personalized calorie plan
        </Typography>
      </Box>

      {/* Stepper (hide when showing existing goal summary) */}
      {!hasExistingGoal && (
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (<Step key={label}><StepLabel>{label}</StepLabel></Step>))}
        </Stepper>
      )}

      {/* Success Display */}
      {success && (<Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>)}

      {/* Step 1: Profile */}
      {!hasExistingGoal && activeStep === 0 && (
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
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Age"
                type="number"
                value={profile.age}
                onChange={(e) => setProfile(prev => ({ ...prev, age: e.target.value }))}
                size="small"
              />
              <TextField
                label="Current Weight (lbs)"
                type="number"
                value={profile.weight}
                onChange={(e) => setProfile(prev => ({ ...prev, weight: e.target.value }))}
                size="small"
              />
              <TextField
                label="Height"
                placeholder="5'11"
                value={profile.height}
                onChange={(e) => setProfile(prev => ({ ...prev, height: e.target.value }))}
                size="small"
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
                <InputLabel>Activity Level</InputLabel>
                <Select
                  value={profile.activityLevel}
                  onChange={(e) => setProfile(prev => ({ ...prev, activityLevel: e.target.value }))}
                  label="Activity Level"
                >
                  <MenuItem value="sedentary">Sedentary (little to no exercise)</MenuItem>
                  <MenuItem value="light">Lightly Active (light exercise 1-3 days/week)</MenuItem>
                  <MenuItem value="moderate">Moderately Active (moderate exercise 3-5 days/week)</MenuItem>
                  <MenuItem value="very">Very Active (hard exercise 6-7 days/week)</MenuItem>
                  <MenuItem value="extra">Extra Active (very hard exercise, physical job)</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={handleSaveProfile}
              disabled={!profile.age || !profile.weight || !profile.height || !profile.gender}
            >
              Save Profile
            </Button>
            <Button
              variant="contained"
              onClick={() => setActiveStep(1)}
              disabled={!profile.age || !profile.weight || !profile.height || !profile.gender}
              sx={{ bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
            >
              Next: Set Goal
            </Button>
          </Box>
        </Paper>
      )}

      {/* Step 2: Goal Setting */}
      {!hasExistingGoal && activeStep === 1 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrendingUpIcon sx={{ color: 'primary.main' }} />
            Set Your Weight Goal
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
            <TextField
              label="Target Weight (lbs)"
              type="number"
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
            <Card sx={{ mb: 3, bgcolor: '#f8f9fa' }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                  Goal Preview
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box>
                    <Typography variant="body2" sx={{ color: '#666' }}>Current Weight</Typography>
                    <Typography variant="h6">{profile.weight} lbs</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ color: '#666' }}>Target Weight</Typography>
                    <Typography variant="h6">{goal.targetWeight} lbs</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ color: '#666' }}>Weight to Lose</Typography>
                    <Typography variant="h6" sx={{ color: '#d32f2f' }}>
                      {Math.abs(parseFloat(profile.weight) - parseFloat(goal.targetWeight)).toFixed(1)} lbs
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ color: '#666' }}>Timeline</Typography>
                    <Typography variant="h6">
                      {Math.ceil(Math.abs(parseFloat(profile.weight) - parseFloat(goal.targetWeight)) / parseFloat(goal.weightChangeRate))} weeks
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          )}

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={() => setActiveStep(0)}
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

      {/* Step 3: Calorie Plan or Existing Summary */}
      {plan && activeStep >= 2 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircleIcon sx={{ color: '#4caf50' }} />
            Your Personalized Calorie Plan
          </Typography>

          {/* Summary Card */}
          <Card sx={{ mb: 3, bgcolor: 'background.default', border: '2px solid', borderColor: 'primary.main' }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 2, color: 'primary.main' }}>
                Daily Target: {plan.dailyCalories} calories
              </Typography>
              <Typography variant="body2" sx={{ mb: 2, color: '#666' }}>
                This will help you lose {plan.weightChangeRate} lb per week safely and sustainably.
              </Typography>
              <Typography variant="body2" sx={{ mb: 1, color: '#666' }}>
                Plan Type: {plan.planType === 'standard' ? 'Standard' : plan.planType === 'weekender' ? 'Weekender' : 'Auto adjust'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip label={`${plan.weightToLose.toFixed(1)} lbs to lose`} color="primary" />
                <Chip label={`${plan.timeline} weeks`} variant="outlined" />
                <Chip label={`${plan.weightChangeRate} lb/week`} variant="outlined" />
              </Box>
            </CardContent>
          </Card>

          {/* Weekly Targets */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Weekly Targets
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
                {plan.schedule.map((d) => (
                  <Box key={d.day} sx={{ textAlign: 'center', p: 1, border: '1px solid #eee', borderRadius: 1 }}>
                    <Typography variant="body2" sx={{ color: '#666' }}>{d.day}</Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{d.calories}</Typography>
                  </Box>
                ))}
              </Box>
              {plan.rules?.autoAdjust && (
                <Typography variant="caption" sx={{ color: '#666', display: 'block', mt: 1 }}>
                  Auto mode: If you go over on a day, remaining days will adjust while staying above {plan.rules.minSafeCalories} kcal.
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Detailed Breakdown */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, mb: 3 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Your Metabolism
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ color: '#666' }}>Basal Metabolic Rate (BMR)</Typography>
                  <Typography variant="h6">{plan.bmr} calories/day</Typography>
                  <Typography variant="caption" sx={{ color: '#666' }}>
                    Calories your body burns at rest
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#666' }}>Total Daily Energy Expenditure (TDEE)</Typography>
                  <Typography variant="h6">{plan.tdee} calories/day</Typography>
                  <Typography variant="caption" sx={{ color: '#666' }}>
                    Calories you burn with activity level: {plan.activityLevel}
                  </Typography>
                </Box>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Your Deficit
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ color: '#666' }}>Daily Calorie Deficit</Typography>
                  <Typography variant="h6" sx={{ color: '#d32f2f' }}>
                    {plan.weeklyDeficit} calories/day
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#666' }}>
                    {plan.weeklyDeficit * 7} calories/week = {plan.weightChangeRate} lb/week
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#666' }}>Safety Check</Typography>
                  <Typography variant="h6" sx={{ color: plan.dailyCalories >= 1200 ? '#4caf50' : '#f57c00' }}>
                    {plan.dailyCalories >= 1200 ? 'Safe' : 'Below minimum'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#666' }}>
                    Minimum recommended: 1,200 calories/day
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
                    // Prefill wizard from existing plan and re-run
                    setGoal(prev => ({
                      ...prev,
                      targetWeight: plan.targetWeight?.toString() || prev.targetWeight,
                      weightChangeRate: plan.weightChangeRate?.toString() || prev.weightChangeRate,
                      planType: plan.planType || prev.planType
                    }));
                    setHasExistingGoal(false);
                    setActiveStep(1);
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
                      setSuccess('Calorie goal removed.');
                      setTimeout(() => setSuccess(''), 3000);
                    } catch (e) {
                      console.error('Failed to remove nutrition goal', e);
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
                  onClick={() => setActiveStep(1)}
                >
                  Back
                </Button>
                <Button
                  variant="contained"
                  onClick={async () => {
                    try {
                      const startDate = new Date();
                      const estimatedEnd = new Date();
                      estimatedEnd.setDate(startDate.getDate() + (plan.timeline * 7));
                      const weeklyNumbers = plan.schedule.map(d => d.calories);
                      await settingsService.updateSettings({
                        nutrition_goal: {
                          enabled: true,
                          start_date: startDate.toISOString(),
                          start_weight: plan.currentWeight,
                          target_weight: plan.targetWeight,
                          activity_level: plan.activityLevel,
                          weight_change_rate: plan.weightChangeRate,
                          plan_type: plan.planType,
                          daily_calorie_target: plan.dailyCalories,
                          weekly_schedule: weeklyNumbers,
                          min_safe_calories: plan.rules.minSafeCalories,
                          bmr: plan.bmr,
                          tdee: plan.tdee,
                          timeline_weeks: plan.timeline,
                          estimated_end_date: estimatedEnd.toISOString()
                        }
                      });
                      setSuccess('Calorie goal saved. Tracking started!');
                      setHasExistingGoal(true);
                      // Refresh from backend to ensure we reflect the persisted state
                      await loadExistingGoal();
                      setTimeout(() => setSuccess(''), 5000);
                    } catch (e) {
                      console.error('Failed to save nutrition goal', e);
                    }
                  }}
                  sx={{ bgcolor: '#4caf50', '&:hover': { bgcolor: '#45a049' } }}
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
