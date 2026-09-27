import React, { useRef, useEffect, useState } from 'react';
import { Box, Button, TextField, Typography, ButtonBase } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Check as CheckIcon } from '@mui/icons-material';
import { mealWord } from '../../utils/plainWords.js';

/**
 * Simple mode's first run (SIMPLE_AND_FULL_PLAN.md, "Simple mode,
 * specifically for Heather"): three plain steps and nothing to configure.
 *
 *   1. What should we call you?
 *   2. What's your goal?  (lose a little / keep steady / just keep track)
 *   3. Try logging your <meal>.
 *
 * The goal is remembered in the person's own words; it does NOT invent a
 * calorie target — that stays the calorie plan's job, one tap away under
 * More. Finishing (or "Maybe later") writes everything in one partial save:
 * `{ preferred_name, goal, first_run_done: true }`.
 */
const GOALS = [
  { id: 'lose', title: 'Lose a little weight', body: 'See how much is left each day.' },
  { id: 'maintain', title: 'Keep my weight steady', body: 'Stay about where I am.' },
  { id: 'track', title: 'Just keep track', body: 'Write down what I eat, no targets.' },
];

const Step = ({ n, children }) => (
  <Box component="section" aria-labelledby={`first-run-step-${n}`} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
    {children}
  </Box>
);

export default function FirstRun({ suggestedName = '', mealType = 'breakfast', onFinish, onTryLogging }) {
  const theme = useTheme();
  const produce = theme.palette.produce || {};
  const [step, setStep] = useState(1);
  const [name, setName] = useState(suggestedName || '');
  const [goal, setGoal] = useState(null);
  const headingRef = useRef(null);

  // Each step moves focus to its question, so a screen reader hears it.
  useEffect(() => { headingRef.current?.focus?.(); }, [step]);

  const answers = () => ({ preferred_name: name.trim() || null, goal: goal || null });
  const meal = mealWord(mealType);

  const heading = (text) => (
    <Typography
      id={`first-run-step-${step}`}
      ref={headingRef}
      tabIndex={-1}
      component="h1"
      sx={{ fontSize: { xs: '1.875rem', sm: '2.25rem' }, fontWeight: 800, lineHeight: 1.2, outline: 'none' }}
    >
      {text}
    </Typography>
  );

  return (
    <Box data-testid="first-run" sx={{ maxWidth: 560, mx: 'auto', py: { xs: 2, sm: 4 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box aria-hidden sx={{ display: 'flex', gap: 1 }}>
        {[1, 2, 3].map((n) => (
          <Box key={n} sx={{ height: 8, flex: 1, borderRadius: 999, bgcolor: n <= step ? produce.breakfast?.fill : theme.palette.divider }} />
        ))}
      </Box>
      <Typography sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '1rem' }}>Step {step} of 3</Typography>

      {step === 1 && (
        <Step n={1}>
          {heading('Welcome! What should we call you?')}
          <TextField
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            inputProps={{ maxLength: 40, autoComplete: 'given-name' }}
            onKeyDown={(e) => { if (e.key === 'Enter') setStep(2); }}
            fullWidth
            sx={{ '& .MuiInputBase-input': { fontSize: '1.25rem', py: 2 } }}
          />
          <Button variant="contained" size="large" onClick={() => setStep(2)} sx={{ alignSelf: 'stretch' }}>
            Next
          </Button>
        </Step>
      )}

      {step === 2 && (
        <Step n={2}>
          {heading(name.trim() ? `Nice to meet you, ${name.trim()}. What's your goal?` : "What's your goal?")}
          <Box role="radiogroup" aria-labelledby="first-run-step-2" sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
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
                    gap: 2,
                    p: 2,
                    minHeight: 72,
                    borderRadius: '20px',
                    border: `2px solid ${chosen ? theme.palette.primary.main : theme.palette.divider}`,
                    bgcolor: chosen ? produce.lunch?.tint : theme.palette.background.paper,
                    '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                      bgcolor: chosen ? theme.palette.primary.main : 'transparent',
                      color: theme.palette.primary.contrastText,
                      border: chosen ? 'none' : `2px solid ${theme.palette.text.secondary}`,
                    }}
                  >
                    {chosen && <CheckIcon sx={{ fontSize: 22 }} />}
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '1.1875rem', fontWeight: 800, color: 'text.primary' }}>{g.title}</Typography>
                    <Typography sx={{ fontSize: '1rem', color: 'text.secondary' }}>{g.body}</Typography>
                  </Box>
                </ButtonBase>
              );
            })}
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button size="large" variant="outlined" onClick={() => setStep(1)} sx={{ flex: 1 }}>Back</Button>
            <Button size="large" variant="contained" onClick={() => setStep(3)} sx={{ flex: 2 }}>Next</Button>
          </Box>
        </Step>
      )}

      {step === 3 && (
        <Step n={3}>
          {heading(`Try logging your ${meal}`)}
          <Typography sx={{ fontSize: '1.125rem', color: 'text.secondary' }}>
            Say it or type it — “two eggs and toast” is enough. You can take anything back with Undo.
          </Typography>
          <Button
            size="large"
            variant="contained"
            onClick={() => onTryLogging?.(answers())}
            sx={{ bgcolor: produce[mealType]?.fill, color: produce[mealType]?.ink, '@media (hover: hover)': { '&:hover': { bgcolor: produce[mealType]?.fill } } }}
          >
            Add my {meal}
          </Button>
          <Button size="large" variant="text" onClick={() => onFinish?.(answers())}>
            Maybe later
          </Button>
        </Step>
      )}
    </Box>
  );
}
