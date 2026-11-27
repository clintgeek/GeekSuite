import React, { useRef, useEffect, useState } from 'react';
import { Box, Button, TextField, Typography, ButtonBase } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { trackColor } from '../../theme/theme.jsx';
import { Surface, Rule } from '../primitives';
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
      sx={{ fontSize: { xs: '1.875rem', sm: '2.25rem' }, fontWeight: 700, lineHeight: 1.15, outline: 'none' }}
    >
      {text}
    </Typography>
  );

  return (
    // One label panel: the step count and a three-part bar on top, a thick
    // rule, then the step's question and its answers (The Label).
    <Surface data-testid="first-run" sx={{ maxWidth: 560, width: '100%', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5, p: { xs: 2, sm: 3 } }}>
      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: '1rem', mb: 1 }}>Step {step} of 3</Typography>
        <Box aria-hidden sx={{ display: 'flex', gap: 0.5 }}>
          {[1, 2, 3].map((n) => (
            <Box key={n} sx={{ height: 10, flex: 1, bgcolor: n <= step ? theme.palette.primary.main : trackColor(theme) }} />
          ))}
        </Box>
        <Rule weight="thick" sx={{ mt: 1.5 }} />
      </Box>

      {step === 1 && (
        <Step n={1}>
          {heading('Welcome! What should I call you?')}
          <TextField
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            inputProps={{ maxLength: 40, autoComplete: 'given-name' }}
            onKeyDown={(e) => { if (e.key === 'Enter') setStep(2); }}
            fullWidth
            sx={{ '& .MuiInputBase-input': { fontSize: '1.25rem', py: 2 } }}
          />
          <Button variant="contained" size="large" onClick={() => setStep(2)} sx={{ alignSelf: 'stretch', minHeight: 56 }}>
            Next
          </Button>
        </Step>
      )}

      {step === 2 && (
        <Step n={2}>
          {heading(name.trim() ? `Nice to meet you, ${name.trim()}. What’s your goal?` : 'What’s your goal?')}
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
                    border: `2px solid ${chosen ? theme.palette.primary.main : theme.palette.divider}`,
                    borderRadius: '12px',
                    bgcolor: chosen ? alpha(theme.palette.primary.main, 0.08) : theme.palette.background.paper,
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
                    <Typography sx={{ fontSize: '1.1875rem', fontWeight: 700, color: 'text.primary' }}>{g.title}</Typography>
                    <Typography sx={{ fontSize: '1rem', color: 'text.secondary' }}>{g.body}</Typography>
                  </Box>
                </ButtonBase>
              );
            })}
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button size="large" variant="outlined" onClick={() => setStep(1)} sx={{ flex: 1, minHeight: 56 }}>Back</Button>
            <Button size="large" variant="contained" onClick={() => setStep(3)} sx={{ flex: 2, minHeight: 56 }}>Next</Button>
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
            sx={{ minHeight: 56 }}
          >
            Add my {meal}
          </Button>
          <Button size="large" variant="text" onClick={() => onFinish?.(answers())} sx={{ minHeight: 48, fontWeight: 700 }}>
            Maybe later
          </Button>
        </Step>
      )}
    </Surface>
  );
}
