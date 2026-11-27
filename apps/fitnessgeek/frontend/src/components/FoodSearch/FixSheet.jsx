import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, Link, TextField, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { useBackToClose } from './useBackToClose.js';
import { errorMessage } from '../../utils/errorMessage.js';
import { cal, fmt } from '../../utils/plainWords.js';
import { describeFailure } from './composerText.js';
import { newIdempotencyKey } from './idempotency.js';
import { portionChoices, displayName } from './entries.js';
import { bottomSheetProps } from './bottomSheet.js';
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
 *
 * ONE NUMBER, ONE BUTTON (review 2026-11-27). The sheet used to have three
 * size buttons that wrote at once, a Calories box with its own Save, and
 * "Log this instead" as a third button; and "Bigger ~300" could look chosen
 * while Calories said 220. Now the size buttons and the Calories box are the
 * same number: a size fills the box, typing in the box un-chooses the sizes,
 * and whichever size matches the box is the one marked (aria-pressed). The one
 * filled button says what it will do: "Keep 220 cal" when nothing changed,
 * "Save 150 cal" when it has. "It was something else" is a text link that
 * swaps the sheet to the describe box, whose one button is "Log this instead".
 *
 * A bottom sheet on a phone (bottomSheet.js), a centred window above that.
 */

export default function FixSheet({ item, onClose, fixes }) {
  const theme = useTheme();
  const open = Boolean(item);
  const [calories, setCaloriesText] = useState('');
  const [actually, setActually] = useState('');
  // 'size' (the calories) or 'instead' (say it again).
  const [mode, setMode] = useState('size');
  const [working, setWorking] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(null);

  useEffect(() => {
    if (!item) return;
    setCaloriesText(String(Math.round(Number(item.calories) || 0)));
    setActually('');
    setMode('size');
    setWorking(null);
    setError(null);
    setAttempt(null);
  }, [item]);

  // Back closes this sheet, not the add sheet under it.
  useBackToClose(open, onClose);

  if (!item) return null;
  const logged = Math.round(Number(item.calories) || 0);
  const { smaller, bigger } = portionChoices(item);
  const typed = Number.parseFloat(String(calories).replace(',', '.'));
  const valid = Number.isFinite(typed) && typed >= 0 && typed <= 10000;
  const target = valid ? Math.round(typed) : null;
  const changed = valid && target !== logged;
  const canFixCalories = Boolean(fixes?.setCalories);
  const canRedescribe = Boolean(fixes?.redescribe);

  const run = async (what, fn) => {
    if (working) return;
    setWorking(what);
    setError(null);
    try {
      await fn();
      onClose?.();
    } catch (err) {
      setError(what === 'actually' ? describeFailure(err).message : errorMessage(err, "Couldn’t change that. Try again."));
    } finally {
      setWorking(null);
    }
  };

  const save = () => {
    if (!valid) return;
    if (!changed) { onClose?.(); return; }
    run('calories', () => fixes.setCalories(item, target));
  };
  const sayInstead = () => {
    const text = actually.trim();
    if (!text) return;
    // A retry of the same words keeps its key (C2); new words, a new key.
    const key = attempt?.text === text ? attempt.key : newIdempotencyKey();
    setAttempt({ text, key });
    run('actually', () => fixes.redescribe(item, text, key));
  };

  // A size says its number on a second line on purpose — "Smaller" over
  // "~150" — rather than wrapping wherever the width runs out.
  const sizes = [
    { key: 'right', word: 'About right', value: logged, label: 'About right' },
    { key: 'smaller', word: 'Smaller', value: smaller, label: `Smaller · ~${fmt(smaller)}` },
    { key: 'bigger', word: 'Bigger', value: bigger, label: `Bigger · ~${fmt(bigger)}` },
  ];
  const sizeButton = (chosen) => ({
    minHeight: 56,
    fontSize: '1rem',
    fontWeight: 700,
    flex: '1 1 0',
    px: 1,
    lineHeight: 1.2,
    color: 'text.primary',
    borderWidth: 1.5,
    borderColor: chosen ? 'primary.main' : (theme.palette.outline || theme.palette.divider),
    bgcolor: chosen ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.1) : 'transparent',
    // Hover and focus must not look like "chosen": only `chosen` paints it.
    '&:hover, &:focus': {
      borderWidth: 1.5,
      borderColor: chosen ? 'primary.main' : theme.palette.text.secondary,
      bgcolor: chosen ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.1) : 'transparent',
    },
  });
  const primaryButton = { minHeight: 52, fontWeight: 700, fontSize: '1.0625rem', boxShadow: 'none' };
  const linkButton = { minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: '1rem', fontWeight: 700 };
  const name = displayName(item.name);

  return (
    <Dialog
      open={open}
      onClose={() => !working && onClose?.()}
      maxWidth="xs"
      fullWidth
      aria-labelledby="fix-sheet-title"
      data-testid="fix-sheet"
      {...bottomSheetProps}
    >
      <DialogTitle id="fix-sheet-title" sx={{ pb: 0.5 }}>
        <Typography component="span" sx={{ display: 'block', fontSize: '1.25rem', fontWeight: 700, overflowWrap: 'anywhere' }}>
          Change {name}
        </Typography>
        <Typography component="span" sx={{ display: 'block', fontSize: '1rem', color: 'text.secondary' }}>
          Logged at {cal(logged)}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pb: 4 }}>
        {mode === 'size' ? (
          <Box component="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
            {/* 4px theme unit: 8px between the sizes, 16px between the parts. */}
            <Typography id="fix-sheet-size" sx={{ fontSize: '1rem', fontWeight: 700, mt: 2, mb: 2 }}>How big was it?</Typography>
            <Box role="group" aria-labelledby="fix-sheet-size" sx={{ display: 'flex', gap: 2 }}>
              {sizes.map((size) => {
                const chosen = valid && target === size.value && (size.key === 'right' || size.value !== logged);
                return (
                  <Button
                    key={size.key}
                    variant="outlined"
                    aria-pressed={chosen}
                    aria-label={size.label}
                    data-testid={`fix-size-${size.key}`}
                    disabled={Boolean(working) || !canFixCalories}
                    onClick={() => { setCaloriesText(String(size.value)); setError(null); }}
                    sx={sizeButton(chosen)}
                  >
                    <Box component="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span>{size.word}</span>
                      {size.key !== 'right' && (
                        <Box component="span" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                          ~{fmt(size.value)}
                        </Box>
                      )}
                    </Box>
                  </Button>
                );
              })}
            </Box>

            <TextField
              fullWidth
              label="Calories"
              value={calories}
              onChange={(e) => { if (/^\d*[.,]?\d*$/.test(e.target.value.trim())) setCaloriesText(e.target.value.trim()); }}
              error={calories !== '' && !valid}
              helperText={calories !== '' && !valid ? 'That looks too high. Check the number.' : 'Or type the number if you know it.'}
              inputProps={{ inputMode: 'decimal', autoComplete: 'off' }}
              disabled={Boolean(working) || !canFixCalories}
              sx={{ mt: 4, '& input': { fontSize: '1.125rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' } }}
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              data-testid="fix-save"
              disabled={!valid || Boolean(working)}
              startIcon={working === 'calories' ? <CircularProgress size={18} color="inherit" aria-hidden /> : null}
              sx={{ ...primaryButton, mt: 4 }}
            >
              {working === 'calories' ? 'Saving…' : changed ? `Save ${cal(target)}` : valid ? `Keep ${cal(logged)}` : 'Save'}
            </Button>

            {canRedescribe && (
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  disabled={Boolean(working)}
                  onClick={() => { setMode('instead'); setError(null); }}
                  sx={linkButton}
                >
                  It was something else
                </Link>
              </Box>
            )}
          </Box>
        ) : (
          <Box component="form" onSubmit={(e) => { e.preventDefault(); sayInstead(); }}>
            <TextField
              fullWidth
              autoFocus
              label="It was actually…"
              placeholder="e.g. a small bowl of tomato soup"
              helperText={`This takes the place of ${name}.`}
              value={actually}
              onChange={(e) => setActually(e.target.value)}
              disabled={Boolean(working)}
              inputProps={{ enterKeyHint: 'send', autoComplete: 'off' }}
              sx={{ mt: 3 }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={!actually.trim() || Boolean(working)}
              startIcon={working === 'actually' ? <CircularProgress size={18} color="inherit" aria-hidden /> : null}
              sx={{ ...primaryButton, mt: 4 }}
            >
              {working === 'actually' ? 'Working it out…' : 'Log this instead'}
            </Button>
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Link
                component="button"
                type="button"
                underline="hover"
                disabled={Boolean(working)}
                onClick={() => { setMode('size'); setError(null); }}
                sx={linkButton}
              >
                Back to the calories
              </Link>
            </Box>
          </Box>
        )}

        {error && (
          <Alert
            severity="warning"
            action={isSignedOutMessage(error) ? <SignInButton /> : undefined}
            sx={{ mt: 3, borderRadius: '12px', fontSize: '1rem', color: theme.palette.text.primary, alignItems: 'center' }}
          >
            {error}
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
