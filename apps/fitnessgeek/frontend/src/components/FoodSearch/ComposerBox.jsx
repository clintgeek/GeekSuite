import React, { useId } from 'react';
import { Box, Button, CircularProgress, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Clear as ClearIcon,
  Mic as MicIcon,
  Stop as StopIcon,
  HourglassEmpty as ThinkingIcon,
  CloudOff as OfflineIcon,
  ErrorOutline as FailureIcon,
} from '@mui/icons-material';
import { slashFocusProps } from '@geeksuite/ui';

/**
 * The box: "Tell me what you ate", with Log it right under it.
 *
 * Phone first (it's an installed PWA). A multi-line box, two lines at rest
 * and up to five, so a sentence wraps instead of scrolling sideways out of
 * sight. Enter sends — the keyboard's key says so (`enterKeyHint="send"`) —
 * and Shift+Enter is a new line on a desktop. A full-width Log it directly
 * under the box, so it sits just above the phone keyboard, and a big mic
 * beside it rather than a glyph inside the box.
 *
 * A pencil, not a magnifier: this is where you say what you ate, not where
 * you search (REVIEW_2026-10 Phase 1.2).
 *
 * The line under the button is always there, holding its height, so the
 * helper turning into "Working it out…" or the offline note never moves the
 * box or the button (Chef: "the entry form bounces around").
 *
 * It is the `/` target wherever it appears (suite slash focus, priority 30).
 *
 * ONE PRIMARY AT A TIME (L20). For a short name ("fage") the list is open
 * and its rows are the main way in, so Log it steps back to an outlined
 * "Just log ‘fage’" (`quiet`). For a sentence it is the filled primary.
 *
 * `micDisabled` turns the mic off without hiding it — offline, where the
 * speech service can't work and used to say the microphone was broken (L18).
 *
 * `statusKind` gives the line under the button an icon, so "working on it",
 * "no signal" and "that didn't go through" stop looking alike (visual review
 * A3): an hourglass in the secondary ink, a cloud in warning ochre, an
 * outlined error mark in the error red. The words stay in the ink.
 */
const STATUS_ICONS = {
  thinking: { Icon: ThinkingIcon, color: 'text.secondary' },
  offline: { Icon: OfflineIcon, color: 'warning.main' },
  failure: { Icon: FailureIcon, color: 'error.main' },
};

const ComposerBox = ({
  value,
  onChange,
  onSubmit,
  onMicClick,
  listening = false,
  thinking = false,
  canLog = true,
  quiet = false,
  micDisabled = false,
  disabled = false,
  status = null,
  statusTone = 'muted',
  statusKind = null,
  autoFocus = false,
  inputRef,
  // The meal picker, drawn between the box and Log it (a node from the
  // composer, which owns the meal state).
  mealPicker = null,
}) => {
  const theme = useTheme();
  const helperId = useId();
  const labelId = useId();
  const statusIcon = status ? STATUS_ICONS[statusKind] : null;

  const handleKeyDown = (e) => {
    // An IME still composing a word owns its Enter.
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent?.isComposing) return;
    e.preventDefault();
    if (!thinking && canLog) onSubmit?.();
  };

  const ink = theme.palette.text.primary;
  return (
    <Box data-testid="composer-box">
      <Typography
        id={labelId}
        component="label"
        htmlFor={`${labelId}-input`}
        sx={{ display: 'block', fontSize: '1rem', fontWeight: 700, color: 'text.primary', mb: 1.5 }}
      >
        Tell me what you ate
      </Typography>

      {/* The box with the mic beside it. */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          fullWidth
          multiline
          minRows={1}
          maxRows={5}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          placeholder="e.g. a bowl of chicken soup and some crackers"
          autoFocus={autoFocus}
          inputRef={inputRef}
          id={`${labelId}-input`}
          {...slashFocusProps(30)}
          InputProps={{
            readOnly: thinking || disabled,
            endAdornment: value && !thinking ? (
              // MUI pins an adornment to 2em high; the 44px button overflowed
              // upward across the box's top border.
              <InputAdornment position="end" sx={{ alignSelf: 'flex-start', height: 'auto', maxHeight: 'none', mt: -1, mr: -1 }}>
                <IconButton
                  aria-label="Clear what you typed"
                  onClick={() => onChange?.({ target: { value: '' } })}
                  sx={{ width: 44, height: 44, color: theme.palette.text.secondary }}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          inputProps={{
            enterKeyHint: 'send',
            'aria-describedby': helperId,
            autoComplete: 'off',
            autoCapitalize: 'sentences',
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: '1rem',
              lineHeight: 1.45,
              alignItems: 'flex-start',
              minHeight: 52,
              py: 1.25,
              px: 1.5,
              color: theme.palette.text.primary,
              backgroundColor: theme.palette.background.paper,
              '& fieldset': { borderColor: theme.palette.outline || theme.palette.divider, borderWidth: 1 },
              '&:hover fieldset': { borderColor: theme.palette.text.secondary },
              '&.Mui-focused fieldset': { borderColor: theme.palette.primary.main, borderWidth: 2 },
            },
            '& .MuiInputBase-input': {
              '&::placeholder': { color: theme.palette.text.secondary, opacity: 1 },
            },
          }}
        />
        {onMicClick && (
          <IconButton
            onClick={onMicClick}
            disabled={thinking || disabled || (micDisabled && !listening)}
            aria-label={listening ? 'Stop listening' : 'Say what you ate'}
            aria-pressed={listening}
            data-testid="speak-button"
            sx={{
              width: 52,
              height: 52,
              flexShrink: 0,
              // The one round thing on the panel: the mic.
              borderRadius: '50%',
              border: `1px solid ${theme.palette.outline || theme.palette.divider}`,
              color: listening ? theme.palette.primary.contrastText : ink,
              bgcolor: listening ? theme.palette.primary.main : 'transparent',
              // Listening is a filled blue disc with a contrast stop glyph,
              // at a specificity no state style can wash out (UX review
              // 2026-11, B8: the stop square was white on near-white).
              ...(listening ? {
                '&&': { bgcolor: theme.palette.primary.main, color: theme.palette.primary.contrastText, borderColor: theme.palette.primary.main },
              } : {}),
              // Off (no signal) looks off: a divider ring and a grey glyph.
              '&.Mui-disabled': {
                borderColor: theme.palette.divider,
                color: theme.palette.text.disabled,
                bgcolor: 'transparent',
              },
              '@media (hover: hover)': {
                '&:hover': { bgcolor: listening ? theme.palette.primary.dark : theme.palette.action.hover },
              },
            }}
          >
            {listening ? <StopIcon /> : <MicIcon sx={{ fontSize: 26 }} />}
          </IconButton>
        )}
      </Box>

      {/* 4px theme unit: 10px under the box, 12px above the button. */}
      {mealPicker && <Box sx={{ mt: 2.5 }}>{mealPicker}</Box>}

      <Button
        variant={quiet && !thinking ? 'outlined' : 'contained'}
        size="large"
        onClick={() => { if (!thinking && canLog) onSubmit?.(); }}
        disabled={!canLog && !thinking}
        aria-disabled={thinking || undefined}
        aria-busy={thinking || undefined}
        data-testid="log-it"
        startIcon={thinking
          // A thicker stroke in the button's own label colour: the thin
          // default vanished into the fill (visual review A3).
          ? <CircularProgress size={20} thickness={5} aria-hidden sx={{ color: theme.palette.primary.contrastText }} />
          : undefined}
        sx={{
          mt: 3,
          // Full width on a phone; from md it is its own size, never a bar.
          width: { xs: '100%', md: 'auto' },
          minWidth: { md: 160 },
          px: 4,
          minHeight: 52,
          fontSize: '1.0625rem',
          fontWeight: 700,
          boxShadow: 'none',
          ...(quiet && !thinking ? { borderWidth: 2, '&:hover': { borderWidth: 2 } } : {}),
          ...(thinking ? { pointerEvents: 'none' } : {}),
        }}
      >
        {thinking ? 'Working it out…' : quiet && value?.trim() ? `Just log ‘${value.trim()}’` : 'Log it'}
      </Button>

      {/* Always rendered, always at least one line tall: see the note above. */}
      <Typography
        id={helperId}
        role="status"
        aria-live="polite"
        data-testid="composer-status"
        data-status-kind={statusIcon ? statusKind : undefined}
        sx={{
          minHeight: '2.9em',
          mt: 1,
          fontSize: '0.9375rem',
          lineHeight: 1.45,
          color: statusTone === 'strong' || statusIcon ? 'text.primary' : 'text.secondary',
          fontWeight: statusTone === 'strong' ? 700 : 400,
          ...(statusIcon ? { display: 'flex', alignItems: 'flex-start', gap: 1 } : {}),
        }}
      >
        {statusIcon && (
          <statusIcon.Icon
            aria-hidden
            data-testid={`composer-status-${statusKind}`}
            sx={{ color: statusIcon.color, fontSize: 20, mt: '0.15em', flexShrink: 0 }}
          />
        )}
        {status ?? 'Say it like you’d tell a friend. I’ll work out the calories.'}
      </Typography>
    </Box>
  );
};

export default ComposerBox;
