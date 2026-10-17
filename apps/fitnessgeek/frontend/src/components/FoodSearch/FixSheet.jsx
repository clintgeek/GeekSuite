import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useBackToClose } from './useBackToClose.js';
import { errorMessage } from '../../utils/errorMessage.js';
import { describeFailure } from './composerText.js';
import { newIdempotencyKey } from './idempotency.js';
import { portionChoices } from './entries.js';
import SignInButton, { isSignedOutMessage } from './SignInButton.jsx';

/**
 * Fix one thing that was just logged (REVIEW_2026-10 §4, "Fix opens one small
 * sheet"). The old way was: find the row on Log, then Edit, which offered
 * servings, meal and notes but not calories — and "1.5 servings of a bowl of
 * chicken soup" isn't a question anyone can answer.
 *
 * Three ways, smallest first:
 *   - About right / Smaller / Bigger. "Smaller" and "Bigger" use the model's
 *     own range when it gave one (the portion question's low and high), and
 *     otherwise a plate about a third smaller or bigger.
 *   - The calorie number itself, editable. It goes out as the gateway's
 *     per-serving override (CONTRACTS C3), macros moving with it.
 *   - "It was actually…": say it again for just this one. The new words are
 *     described into the same meal on the same day FIRST, and only once they
 *     have landed is the old entry deleted — so a failure leaves her with the
 *     entry she had, never with nothing.
 */

export default function FixSheet({ item, onClose, fixes }) {
  const theme = useTheme();
  const open = Boolean(item);
  const [calories, setCaloriesText] = useState('');
  const [actually, setActually] = useState('');
  const [working, setWorking] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(null);

  useEffect(() => {
    if (!item) return;
    setCaloriesText(String(Math.round(Number(item.calories) || 0)));
    setActually('');
    setWorking(null);
    setError(null);
    setAttempt(null);
  }, [item]);

  // Back closes this sheet, not the add sheet under it.
  useBackToClose(open, onClose);

  if (!item) return null;
  const { smaller, bigger } = portionChoices(item);
  const typed = Number.parseFloat(String(calories).replace(',', '.'));
  const canSave = Number.isFinite(typed) && typed >= 0 && typed <= 10000 && Math.round(typed) !== Math.round(item.calories || 0);

  const run = async (what, fn) => {
    if (working) return;
    setWorking(what);
    setError(null);
    try {
      await fn();
      onClose?.();
    } catch (err) {
      setError(what === 'actually' ? describeFailure(err).message : errorMessage(err, "Couldn't change that. Try again."));
    } finally {
      setWorking(null);
    }
  };

  const setTo = (target) => run(`cal-${target}`, () => fixes.setCalories(item, target));
  const sayInstead = () => {
    const text = actually.trim();
    if (!text) return;
    // A retry of the same words keeps its key (C2); new words, a new key.
    const key = attempt?.text === text ? attempt.key : newIdempotencyKey();
    setAttempt({ text, key });
    run('actually', () => fixes.redescribe(item, text, key));
  };

  const bigButton = { minHeight: 52, borderRadius: '16px', fontSize: '1.0625rem', fontWeight: 800, flex: '1 1 0', px: 1 };

  return (
    <Dialog open={open} onClose={() => !working && onClose?.()} maxWidth="xs" fullWidth aria-labelledby="fix-sheet-title" data-testid="fix-sheet">
      <DialogTitle id="fix-sheet-title" sx={{ pb: 0.5 }}>
        <Typography component="span" sx={{ display: 'block', fontSize: '1.25rem', fontWeight: 800 }}>
          Fix {item.name}
        </Typography>
        <Typography component="span" sx={{ display: 'block', fontSize: '1rem', color: 'text.secondary' }}>
          Logged at {Math.round(item.calories || 0)} cal
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, mt: 1, mb: 1 }}>How big was it?</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" sx={bigButton} disabled={Boolean(working)} onClick={() => onClose?.()}>
            About right
          </Button>
          <Button variant="outlined" sx={bigButton} disabled={Boolean(working)} onClick={() => setTo(smaller)}>
            {working === `cal-${smaller}` ? <CircularProgress size={20} color="inherit" /> : `Smaller · ~${smaller}`}
          </Button>
          <Button variant="outlined" sx={bigButton} disabled={Boolean(working)} onClick={() => setTo(bigger)}>
            {working === `cal-${bigger}` ? <CircularProgress size={20} color="inherit" /> : `Bigger · ~${bigger}`}
          </Button>
        </Box>

        <Box
          component="form"
          onSubmit={(e) => { e.preventDefault(); if (canSave) setTo(Math.round(typed)); }}
          sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 3 }}
        >
          <TextField
            label="Calories"
            value={calories}
            onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value.trim())) setCaloriesText(e.target.value.trim()); }}
            inputProps={{ inputMode: 'decimal', autoComplete: 'off' }}
            disabled={Boolean(working)}
            sx={{ flex: 1, '& input': { fontSize: '1.125rem', fontWeight: 700 } }}
          />
          <Button type="submit" variant="contained" disabled={!canSave || Boolean(working)} sx={{ minHeight: 56, borderRadius: '16px', fontWeight: 800, px: 3 }}>
            Save
          </Button>
        </Box>

        <Box
          component="form"
          onSubmit={(e) => { e.preventDefault(); sayInstead(); }}
          sx={{ mt: 3 }}
        >
          <TextField
            fullWidth
            label="It was actually…"
            placeholder="e.g. a small bowl of tomato soup"
            value={actually}
            onChange={(e) => setActually(e.target.value)}
            disabled={Boolean(working)}
            inputProps={{ enterKeyHint: 'send', autoComplete: 'off' }}
          />
          <Button
            type="submit"
            variant="outlined"
            fullWidth
            disabled={!actually.trim() || Boolean(working)}
            startIcon={working === 'actually' ? <CircularProgress size={18} color="inherit" /> : null}
            sx={{ mt: 1, minHeight: 52, borderRadius: '16px', fontWeight: 800, fontSize: '1.0625rem', borderWidth: 2, '@media (hover: hover)': { '&:hover': { borderWidth: 2 } } }}
          >
            {working === 'actually' ? 'Working it out…' : 'Log this instead'}
          </Button>
        </Box>

        {error && (
          <Alert
            severity="warning"
            action={isSignedOutMessage(error) ? <SignInButton /> : undefined}
            sx={{ mt: 2, borderRadius: 2, fontSize: '1rem', color: theme.palette.text.primary, alignItems: 'center' }}
          >
            {error}
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
