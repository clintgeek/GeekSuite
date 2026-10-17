import React, { useMemo, useState } from 'react';
import { Box, Button, ButtonBase, CircularProgress, Collapse, TextField, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Check as CheckIcon, ExpandMore as ExpandIcon } from '@mui/icons-material';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';
import { settingsService } from '../../services/settingsService.js';
import { userService } from '../../services/userService.js';
import { errorMessage } from '../../utils/errorMessage.js';
import { buildCaloriePlan, nutritionGoalPayload, parseHeightToInches } from './calorieCalc.js';
import { MetabolismCard } from './planProvenance.jsx';
import HeightField from './HeightField.jsx';

/**
 * Simple's quick target (IA-1, L8; Chef 2026-10-17): one screen in place of
 * the four-step BMR/TDEE/keto wizard.
 *
 * It asks only what it doesn't know — weight, height, age and sex come from
 * the profile and the weigh-ins — plus "How fast?". The answer is one
 * sentence, worked out by the wizard's own code (calorieCalc.js: Standard
 * plan, sedentary, the safety floor) and saved as the same `nutrition_goal`.
 * The BMR/TDEE card sits behind "How this was worked out".
 */
const SPEEDS = [
  { rate: 0.5, title: 'Slowly', body: '½ lb a week' },
  { rate: 1, title: 'Steady', body: '1 lb a week' },
  { rate: 1.5, title: 'Faster', body: '1½ lb a week' },
];

const cal = (n) => Math.round(Number(n)).toLocaleString('en-US');
/** 0.5 → "½", 1.5 → "1½", 1.3 → "1.3". */
const lbWords = (rate) => {
  const r = Math.round(Number(rate) * 10) / 10;
  if (r === 0.5) return '½';
  if (Number.isInteger(r)) return String(r);
  if (r % 1 === 0.5) return `${Math.floor(r)}½`;
  return String(r);
};

const plausibleAge = (v) => Number(v) >= 13 && Number(v) <= 110;
const plausibleWeight = (v) => Number(v) >= 60 && Number(v) <= 700;

/** Back where she came from after a save; Home when there is nowhere. */
function DoneButton() {
  const navigate = useNavigate();
  const canGoBack = typeof window !== 'undefined' && Number(window.history.state?.idx) > 0;
  return (
    <Button variant="outlined" size="large" fullWidth sx={{ minHeight: 48 }} onClick={() => (canGoBack ? navigate(-1) : navigate('/dashboard'))}>
      Done
    </Button>
  );
}

function BigChoice({ selected, onClick, title, body, testId }) {
  const theme = useTheme();
  return (
    <ButtonBase
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      data-testid={testId}
      sx={{
        justifyContent: 'flex-start',
        textAlign: 'left',
        gap: 1.5,
        p: 2,
        minHeight: 64,
        width: '100%',
        borderRadius: '20px',
        border: `2px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
        bgcolor: selected ? theme.palette.produce?.lunch?.tint : 'background.paper',
        '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
          bgcolor: selected ? 'primary.main' : 'transparent',
          color: 'primary.contrastText',
          border: selected ? 'none' : `2px solid ${theme.palette.text.secondary}`,
        }}
      >
        {selected && <CheckIcon sx={{ fontSize: 20 }} />}
      </Box>
      <Box>
        <Typography sx={{ fontSize: '1.125rem', fontWeight: 800, color: 'text.primary' }}>{title}</Typography>
        {body && <Typography sx={{ fontSize: '1rem', color: 'text.secondary' }}>{body}</Typography>}
      </Box>
    </ButtonBase>
  );
}

export default function QuickTarget({
  loading = false,
  initialProfile = {},
  weightBasis = null,
  maintain = false,
  targetWeight = null,
  currentTarget = null,
  usableLeanMassLb = null,
  scanBmr = null,
  scanLoadFailed = false,
  onSaved,
}) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress aria-label="Loading your details" />
      </Box>
    );
  }
  return (
    <QuickTargetForm
      initialProfile={initialProfile}
      weightBasis={weightBasis}
      maintain={maintain}
      targetWeight={targetWeight}
      currentTarget={currentTarget}
      usableLeanMassLb={usableLeanMassLb}
      scanBmr={scanBmr}
      scanLoadFailed={scanLoadFailed}
      onSaved={onSaved}
    />
  );
}

function QuickTargetForm({ initialProfile, weightBasis, maintain, targetWeight, currentTarget, usableLeanMassLb, scanBmr, scanLoadFailed, onSaved }) {
  const { notify } = useToast();
  const inRouter = useInRouterContext();

  // What was known when the screen opened decides what is asked. A field she
  // fills in stays on screen while she types.
  const [known] = useState(() => ({
    weight: plausibleWeight(initialProfile.weight),
    height: parseHeightToInches(initialProfile.height) !== null,
    age: plausibleAge(initialProfile.age),
    gender: Boolean(initialProfile.gender),
  }));
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState(initialProfile.weight ? String(Math.round(Number(initialProfile.weight) * 10) / 10) : '');
  const [height, setHeight] = useState(initialProfile.height || '');
  const [age, setAge] = useState(initialProfile.age ? String(initialProfile.age) : '');
  const [gender, setGender] = useState(initialProfile.gender || '');
  const [rate, setRate] = useState(1);
  const [showWorking, setShowWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Any change after a save is a new answer, not the saved one.
  const touch = (set) => (value) => { setSaved(false); set(value); };

  const ask = (field) => editing || !known[field];
  const allKnown = known.weight && known.height && known.age && known.gender;

  const ready = plausibleWeight(weight) && parseHeightToInches(height) !== null && plausibleAge(age) && Boolean(gender);
  const plan = useMemo(() => {
    if (!ready) return null;
    const next = buildCaloriePlan({
      profile: { age, weight, height, gender, activityLevel: 'sedentary' },
      goal: {
        targetWeight: maintain || !targetWeight ? '' : targetWeight,
        weightChangeRate: maintain ? 0 : rate,
        planType: 'standard',
      },
      usableLeanMassLb,
      scanBmr,
    });
    return next.heightError || !(next.dailyCalories > 0) ? null : next;
  }, [ready, age, weight, height, gender, maintain, targetWeight, rate, usableLeanMassLb, scanBmr]);

  const weightNote = weightBasis === 'average' ? 'your 7-day average' : weightBasis === 'latest' ? 'your last weigh-in' : null;

  const save = async () => {
    if (!plan || saving) return;
    setSaving(true);
    try {
      await settingsService.updateSettings({ nutrition_goal: nutritionGoalPayload(plan, { mode: 'standard' }) });
    } catch (err) {
      notify(errorMessage(err, "Couldn't save your target. Try again."), { tone: 'error' });
      setSaving(false);
      return;
    }
    // What she had to type is kept, so she isn't asked again. Only the fields
    // that were missing, and never a reason to fail the save she asked for.
    const profileUpdates = {};
    if (!known.age && plausibleAge(age)) profileUpdates.age = Number(age);
    if (!known.height && parseHeightToInches(height) !== null) profileUpdates.height = height;
    if (!known.gender && gender) profileUpdates.gender = gender;
    if (Object.keys(profileUpdates).length > 0) {
      try { await userService.updateProfile(profileUpdates); } catch { /* the target is what she asked for */ }
    }
    setSaving(false);
    setSaved(true);
    notify(`Saved. Your daily target is ${cal(plan.dailyCalories)} calories.`, { tone: 'success' });
    onSaved?.();
  };

  const outcome = (() => {
    if (!plan) return null;
    if (maintain || plan.weightChangeRate === 0) return 'That should keep your weight about where it is.';
    return `That should lose about ${lbWords(plan.weightChangeRate)} lb a week.`;
  })();

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', px: 2, py: { xs: 2, sm: 4 }, display: 'flex', flexDirection: 'column', gap: 3 }} data-testid="quick-target">
      <Box>
        <Typography component="h1" sx={{ fontSize: { xs: '1.75rem', sm: '2rem' }, fontWeight: 800, lineHeight: 1.2 }}>
          Set your daily target
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '1.0625rem', mt: 1 }}>
          {maintain ? "I'll work out how much to eat to stay about where you are." : "Pick a speed and I'll work out how much to eat each day."}
        </Typography>
        {currentTarget && (
          <Typography sx={{ color: 'text.secondary', fontSize: '1rem', mt: 0.5 }} data-testid="quick-current-target">
            {`Your target now is ${cal(currentTarget)} cal.`}
          </Typography>
        )}
      </Box>

      {allKnown && !editing && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary' }} data-testid="quick-known">
            {`Using ${weight} lb${weightNote ? ` (${weightNote})` : ''}, ${(() => {
              const inches = parseHeightToInches(height);
              return `${Math.floor(inches / 12)}'${inches % 12}"`;
            })()}, age ${age}.`}
          </Typography>
          <Button onClick={() => setEditing(true)} sx={{ minHeight: 44 }}>Change these</Button>
        </Box>
      )}

      {(ask('weight') || ask('height') || ask('age') || ask('gender')) && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {!allKnown && !editing && (
            <Typography sx={{ fontSize: '1rem', color: 'text.secondary' }}>
              A few things first. They're used to work out your calorie target.
            </Typography>
          )}
          {ask('weight') && (
            <TextField
              label="Your weight now (lb)"
              type="number"
              value={weight}
              onChange={(e) => touch(setWeight)(e.target.value)}
              helperText={weightNote && known.weight ? `From ${weightNote}` : undefined}
              inputProps={{ inputMode: 'decimal' }}
            />
          )}
          {ask('height') && (
            <HeightField idPrefix="quick-height" label="Your height" value={height} onChange={touch(setHeight)} />
          )}
          {ask('age') && (
            <TextField
              label="Your age"
              type="number"
              value={age}
              onChange={(e) => touch(setAge)(e.target.value)}
              inputProps={{ inputMode: 'numeric' }}
            />
          )}
          {ask('gender') && (
            <Box>
              <Typography id="quick-sex-label" sx={{ fontWeight: 700, fontSize: '1rem', mb: 1 }}>Sex</Typography>
              <Box role="radiogroup" aria-labelledby="quick-sex-label" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
                <BigChoice selected={gender === 'female'} onClick={() => touch(setGender)('female')} title="Female" testId="quick-sex-female" />
                <BigChoice selected={gender === 'male'} onClick={() => touch(setGender)('male')} title="Male" testId="quick-sex-male" />
              </Box>
            </Box>
          )}
        </Box>
      )}

      {!maintain && (
        <Box>
          <Typography id="quick-speed-label" component="h2" sx={{ fontWeight: 800, fontSize: '1.25rem', mb: 1.25 }}>How fast?</Typography>
          <Box role="radiogroup" aria-labelledby="quick-speed-label" sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {SPEEDS.map((s) => (
              <BigChoice
                key={s.rate}
                selected={rate === s.rate}
                onClick={() => touch(setRate)(s.rate)}
                title={`${s.title} (${s.body})`}
                testId={`quick-speed-${s.rate}`}
              />
            ))}
          </Box>
        </Box>
      )}

      {plan && (
        <Box
          aria-live="polite"
          data-testid="quick-result"
          sx={{ p: 2.5, borderRadius: '20px', border: '2px solid', borderColor: 'primary.main', bgcolor: 'background.paper' }}
        >
          <Typography sx={{ fontSize: '1.375rem', fontWeight: 800, color: 'text.primary', lineHeight: 1.3 }}>
            {`Your daily target: ${cal(plan.dailyCalories)} calories.`}
          </Typography>
          <Typography sx={{ fontSize: '1.0625rem', color: 'text.primary', mt: 0.5 }}>{outcome}</Typography>
          {plan.floored && !maintain && (
            <Typography sx={{ fontSize: '1rem', color: 'text.secondary', mt: 1 }} data-testid="quick-floor-note">
              {`I won't set it lower than ${cal(plan.rules.minSafeCalories)}, so it's a little slower than you picked.`}
            </Typography>
          )}
          <Button
            onClick={() => setShowWorking((v) => !v)}
            aria-expanded={showWorking}
            endIcon={<ExpandIcon sx={{ transform: showWorking ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />}
            sx={{ mt: 1.5, px: 0, minHeight: 44 }}
          >
            How this was worked out
          </Button>
          <Collapse in={showWorking} unmountOnExit>
            <Box sx={{ mt: 1 }}>
              <MetabolismCard plan={plan} scanLoadFailed={scanLoadFailed} />
              {!maintain && (
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
                  {`Eating ${cal(plan.weeklyDeficit)} cal a day under that is about ${lbWords(plan.weightChangeRate)} lb a week.`}
                </Typography>
              )}
            </Box>
          </Collapse>
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pb: 'calc(16px + var(--safe-area-inset-bottom, 0px))' }}>
        {saved ? (
          <>
            <Typography role="status" sx={{ fontWeight: 700, fontSize: '1.0625rem', textAlign: 'center' }}>Saved ✓</Typography>
            {inRouter && <DoneButton />}
          </>
        ) : (
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={save}
            disabled={!plan || saving}
            sx={{ minHeight: 48 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        )}
      </Box>
    </Box>
  );
}
