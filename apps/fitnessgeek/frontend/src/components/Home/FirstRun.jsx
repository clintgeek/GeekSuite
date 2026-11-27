import React, { useRef, useEffect, useState } from 'react';
import { Box, Button, TextField, Typography, ButtonBase } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { trackColor } from '../../theme/theme.jsx';
import { Surface } from '../primitives';
import { Check as CheckIcon } from '@mui/icons-material';
import { mealWord } from '../../utils/plainWords.js';

/**
 * The first run, for a person who has never used the app (ONE_APP_PLAN.md
 * §1; `useExperience().needsFirstRun`): three plain steps and nothing to
 * configure.
 *
 *   1. What should we call you?
 *   2. What's your goal?  (lose a little / keep steady / just keep track)
 *   3. Try logging your <meal>.
 *
 * The goal is remembered in the person's own words; it does NOT invent a
 * calorie target — that stays the calorie plan's job, one tap away under
 * More. Finishing (or "Maybe later") writes everything in one partial save:
 * `{ preferred_name, goal, first_run_done: true }`.
 *
 * It cannot dead-end: nothing is required, every step has a way back, and
 * the last step's two buttons wait for the save (no second tap, no second
 * save). If the save fails the person is told here and can tap again; the
 * answers stay.
 */
const GOALS = [
  { id: 'lose', title: 'Lose a little weight', body: 'See how much is left each day.' },
  { id: 'maintain', title: 'Keep my weight steady', body: 'Stay about where I am.' },
  { id: 'track', title: 'Just keep track', body: 'Write down what I eat, no targets.' },
];

const Step = ({ n, children }) => (
  <Box component="section" aria-labelledby={`first-run-step-${n}`} sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
    {children}
  </Box>
);

export default function FirstRun({ suggestedName = '', mealType = 'breakfast', onFinish, onTryLogging }) {
  const theme = useTheme();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(suggestedName || '');
  const [goal, setGoal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const headingRef = useRef(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Each step moves focus to its question, so a screen reader hears it.
  useEffect(() => { headingRef.current?.focus?.(); }, [step]);

  const answers = () => ({ preferred_name: name.trim() || null, goal: goal || null });
  const meal = mealWord(mealType);

  // Finishing saves; the buttons wait for it. A save that reports failure
  // (`{ ok: false }`) or throws leaves the person here, told, able to retry.
  const finish = async (handler) => {
    if (busy || !handler) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await handler(answers());
      if (mounted.current && result && result.ok === false) setFailed(true);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const heading = (text) => (
    <Typography
      id={`first-run-step-${step}`}
      ref={headingRef}
      tabIndex={-1}
      component="h1"
      sx={{ fontSize: { xs: '1.5rem', sm: '1.75rem' }, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em', outline: 'none' }}
    >
      {text}
    </Typography>
  );

  return (
    // One card: the step count over a three-part bar, then the step's
    // question and its answers.
    <Surface data-testid="first-run" sx={{ maxWidth: 560, width: '100%', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Box>
        <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', color: 'text.secondary', mb: 2 }}>Step {step} of 3</Typography>
        <Box aria-hidden sx={{ display: 'flex', gap: 1.5 }}>
          {[1, 2, 3].map((n) => (
            <Box key={n} sx={{ height: 6, flex: 1, borderRadius: 999, bgcolor: n <= step ? theme.palette.primary.main : trackColor(theme) }} />
          ))}
        </Box>
      </Box>

      {step === 1 && (
        <Step n={1}>
          {heading('Welcome! What should I call you?')}
          <Typography sx={{ color: 'text.secondary', mt: -3 }}>Three quick steps and you’re in.</Typography>
          <TextField
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            inputProps={{ maxLength: 40, autoComplete: 'given-name' }}
            onKeyDown={(e) => { if (e.key === 'Enter') setStep(2); }}
            fullWidth
          />
          <Button variant="contained" size="large" onClick={() => setStep(2)} sx={{ alignSelf: 'stretch', minHeight: 52 }}>
            Next
          </Button>
        </Step>
      )}

      {step === 2 && (
        <Step n={2}>
          {heading(name.trim() ? `Nice to meet you, ${name.trim()}. What’s your goal?` : 'What’s your goal?')}
          <Box role="radiogroup" aria-labelledby="first-run-step-2" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {GOALS.map((g) => {
              const chosen = goal === g.id;
              return (
                <ButtonBase
                  key={g.id}
                  role="radio"
                  aria-checked={chosen}
                  onClick={() => setGoal(g.id)}
                  sx={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    gap: 3,
                    px: 3,
                    py: 2.5,
                    minHeight: 68,
                    border: `2px solid ${chosen ? theme.palette.primary.main : theme.palette.divider}`,
                    borderRadius: '12px',
                    bgcolor: chosen ? alpha(theme.palette.primary.main, 0.08) : theme.palette.background.paper,
                    '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                      bgcolor: chosen ? theme.palette.primary.main : 'transparent',
                      color: theme.palette.primary.contrastText,
                      border: chosen ? 'none' : `2px solid ${theme.palette.text.secondary}`,
                    }}
                  >
                    {chosen && <CheckIcon sx={{ fontSize: 20 }} />}
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '1.0625rem', fontWeight: 600, color: 'text.primary' }}>{g.title}</Typography>
                    <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary' }}>{g.body}</Typography>
                  </Box>
                </ButtonBase>
              );
            })}
          </Box>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mt: -2 }}>
            You can change this any time in Settings.
          </Typography>
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Button size="large" variant="tonal" onClick={() => setStep(1)} sx={{ flex: 1, minHeight: 52 }}>Back</Button>
            <Button size="large" variant="contained" onClick={() => setStep(3)} sx={{ flex: 2, minHeight: 52 }}>Next</Button>
          </Box>
        </Step>
      )}

      {step === 3 && (
        <Step n={3}>
          {heading(`Try logging your ${meal}`)}
          <Typography sx={{ fontSize: '1.0625rem', color: 'text.secondary', mt: -3 }}>
            Say it or type it. “Two eggs and toast” is enough, and you can take anything back with Undo.
          </Typography>
          {failed && (
            <Typography role="alert" data-testid="first-run-error" sx={{ color: 'error.main', fontWeight: 600 }}>
              Couldn’t save that. Try again.
            </Typography>
          )}
          <Button
            size="large"
            variant="contained"
            disabled={busy}
            onClick={() => finish(onTryLogging)}
            sx={{ minHeight: 52 }}
          >
            Add my {meal}
          </Button>
          <Box sx={{ display: 'flex', gap: 3, mt: -2 }}>
            <Button size="large" variant="text" disabled={busy} onClick={() => setStep(2)} sx={{ flex: 1, minHeight: 48 }}>
              Back
            </Button>
            <Button size="large" variant="text" disabled={busy} onClick={() => finish(onFinish)} sx={{ flex: 1, minHeight: 48, fontWeight: 700 }}>
              Maybe later
            </Button>
          </Box>
        </Step>
      )}
    </Surface>
  );
}
