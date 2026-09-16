import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { readableOn } from '@geeksuite/ui';

/**
 * The one question describe-and-log is allowed to ask.
 *
 * The rule (DOCS/THE_DESCRIBE_AND_LOG_PLAN.md §3.8): ask at most one, and only
 * when the answer moves the day. A restaurant plate of nachos (~1,200) versus a
 * small plate at home (~400) is a 3× spread worth one tap; regular versus large
 * fries is not. The backend applies that threshold — an absolute 400 cal spread,
 * not a percentage — and only sends a question when it is earned, so this
 * renders whatever it is given.
 *
 * It appears AFTER the food is already logged, never before. That is the whole
 * point of the design: Chef is not made to answer anything to get his meal
 * written, and ignoring this costs him nothing but the estimate he already has.
 * So there is no "skip" button — leaving it alone is the skip, and it clears
 * itself the moment he logs something else.
 *
 * The two choices are the model's own stated range rather than invented
 * adjustments, because "was it bigger?" is not a question anyone can answer
 * precisely, and "400 or 1,200?" is.
 */
const PortionQuestion = ({ question, onAnswer, onDismiss, busy = false }) => {
  const theme = useTheme();
  if (!question) return null;

  const { name, low, high, logged } = question;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;

  const muted = readableOn(
    theme.palette.text.secondary,
    alpha(theme.palette.warning.main, 0.08),
    { under: theme.palette.background.paper }
  );

  /** The end that is NOT what we already logged is the one worth offering. */
  const options = [
    { label: `Smaller · ~${Math.round(low)}`, value: low },
    { label: `Bigger · ~${Math.round(high)}`, value: high }
  ].filter((option) => Math.abs(option.value - logged) > 25);

  if (options.length === 0) return null;

  return (
    <Box
      sx={{
        mt: 1,
        mb: 1.5,
        px: 1.5,
        py: 1.25,
        borderRadius: 2,
        border: `1px solid ${alpha(theme.palette.warning.main, 0.35)}`,
        backgroundColor: alpha(theme.palette.warning.main, 0.08)
      }}
    >
      <Typography sx={{ fontSize: '0.875rem', color: theme.palette.text.primary, fontWeight: 600 }}>
        How big was the {name.toLowerCase()}?
      </Typography>
      <Typography sx={{ fontSize: '0.75rem', color: muted, mb: 1 }}>
        Logged at {Math.round(logged)} cal. It could reasonably be {Math.round(low)}–{Math.round(high)}.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {options.map((option) => (
          <Button
            key={option.label}
            size="small"
            variant="outlined"
            disabled={busy}
            onClick={() => onAnswer(question, option.value)}
            sx={{ minHeight: 44, borderRadius: 999, fontSize: 12, fontWeight: 600 }}
          >
            {option.label}
          </Button>
        ))}
        <Button
          size="small"
          disabled={busy}
          onClick={onDismiss}
          sx={{ minHeight: 44, fontSize: 12, color: muted }}
        >
          That&apos;s about right
        </Button>
      </Box>
    </Box>
  );
};

export default PortionQuestion;
