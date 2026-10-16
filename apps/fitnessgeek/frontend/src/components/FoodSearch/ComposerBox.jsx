import React, { useId } from 'react';
import { Box, Button, CircularProgress, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  EditNote as PencilIcon,
  Check as CheckIcon,
  Clear as ClearIcon,
  Mic as MicIcon,
  Stop as StopIcon,
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
 */
const ComposerBox = ({
  value,
  onChange,
  onSubmit,
  onMicClick,
  listening = false,
  thinking = false,
  canLog = true,
  disabled = false,
  status = null,
  statusTone = 'muted',
  autoFocus = false,
  inputRef,
}) => {
  const theme = useTheme();
  const helperId = useId();
  const labelId = useId();

  const handleKeyDown = (e) => {
    // An IME still composing a word owns its Enter.
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent?.isComposing) return;
    e.preventDefault();
    if (!thinking && canLog) onSubmit?.();
  };

  return (
    <Box data-testid="composer-box">
      <Typography
        id={labelId}
        component="label"
        htmlFor={`${labelId}-input`}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '1.0625rem', fontWeight: 800, color: 'text.primary', mb: 1 }}
      >
        <PencilIcon sx={{ color: theme.palette.primary.main, fontSize: 24 }} aria-hidden />
        Tell me what you ate
      </Typography>
      <TextField
        fullWidth
        multiline
        minRows={2}
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
            borderRadius: '18px',
            fontSize: '1.125rem',
            lineHeight: 1.45,
            alignItems: 'flex-start',
            py: 1.5,
            px: 1.5,
            color: theme.palette.text.primary,
            backgroundColor: theme.palette.background.paper,
            '& fieldset': { borderColor: theme.palette.divider },
            '&:hover fieldset': { borderColor: theme.palette.primary.main },
            '&.Mui-focused fieldset': { borderColor: theme.palette.primary.main, borderWidth: 2 },
          },
          '& .MuiInputBase-input': {
            '&::placeholder': { color: theme.palette.text.secondary, opacity: 1 },
          },
        }}
      />

      <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={() => { if (!thinking && canLog) onSubmit?.(); }}
          disabled={!canLog && !thinking}
          aria-disabled={thinking || undefined}
          aria-busy={thinking || undefined}
          data-testid="log-it"
          startIcon={thinking ? <CircularProgress size={20} color="inherit" aria-hidden /> : <CheckIcon />}
          sx={{
            minHeight: 56,
            borderRadius: '18px',
            fontSize: '1.125rem',
            fontWeight: 800,
            boxShadow: 'none',
            ...(thinking ? { pointerEvents: 'none' } : {}),
          }}
        >
          {thinking ? 'Working it out…' : 'Log it'}
        </Button>
        {onMicClick && (
          <IconButton
            onClick={onMicClick}
            disabled={thinking || disabled}
            aria-label={listening ? 'Stop listening' : 'Say what you ate'}
            aria-pressed={listening}
            data-testid="speak-button"
            sx={{
              width: 56,
              height: 56,
              flexShrink: 0,
              borderRadius: '18px',
              border: `2px solid ${theme.palette.primary.main}`,
              color: listening ? theme.palette.primary.contrastText : theme.palette.primary.main,
              bgcolor: listening ? theme.palette.primary.main : 'transparent',
              '@media (hover: hover)': {
                '&:hover': { bgcolor: listening ? theme.palette.primary.dark : `${theme.palette.primary.main}1a` },
              },
            }}
          >
            {listening ? <StopIcon /> : <MicIcon sx={{ fontSize: 28 }} />}
          </IconButton>
        )}
      </Box>

      {/* Always rendered, always at least one line tall: see the note above. */}
      <Typography
        id={helperId}
        role="status"
        aria-live="polite"
        data-testid="composer-status"
        sx={{
          minHeight: '2.9em',
          mt: 1,
          fontSize: '1rem',
          lineHeight: 1.45,
          color: statusTone === 'strong' ? 'text.primary' : 'text.secondary',
          fontWeight: statusTone === 'strong' ? 700 : 400,
        }}
      >
        {status ?? 'Say it like you’d tell a friend. I’ll work out the calories.'}
      </Typography>
    </Box>
  );
};

export default ComposerBox;
