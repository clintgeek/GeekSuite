import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';

/**
 * Clock — asymmetric hero numerals for the Ambient screen.
 *
 *   7
 *    ·
 *    ·   11  pm
 *
 * Hour is top-left; a colon of two stacked bronze dots sits in the
 * middle; minute is bottom-right with "pm" hanging off its baseline.
 * Below: day-of-week on one line, "Month DD" in a smaller muted
 * caption on the next. All Geist — NOT mono — at a thin 200–300
 * weight to match the ambient screensaver feel.
 */
export default function Clock() {
  const theme = useTheme();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hours24 = now.getHours();
  const h12 = hours24 % 12 || 12;
  const mins = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours24 >= 12 ? 'pm' : 'am';

  const dayLine = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
  }).format(now);
  const dateLine = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
  }).format(now);

  // Warm bronze-ish dot color — use book-gold if available, else warning.
  const dotColor =
    theme.palette.domains?.bookgeek ??
    theme.palette.warning?.main ??
    theme.palette.text.secondary;

  const digitSx = {
    fontFamily: theme.typography.fontFamily,
    fontVariantNumeric: 'lining-nums tabular-nums',
    fontWeight: 200,
    letterSpacing: '-0.04em',
    fontSize: 'clamp(7rem, 15vw, 17rem)',
    lineHeight: 1,
    color: 'text.primary',
  };

  // Container is ~1.35× digit height so hour (top) and minute (bottom)
  // overlap ~65%, reading as one diagonal compound glyph rather than two
  // stacked lines.
  const compoundHeight = 'clamp(9.5rem, 20vw, 23rem)';

  return (
    <Box
      component="section"
      aria-label="Clock"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        position: 'relative',
        pl: { xs: 2, md: 4 },
      }}
    >
      {/* Compound clock glyph — hour at top, minute at bottom, colon mid */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          height: compoundHeight,
          columnGap: 'clamp(0.5rem, 1.2vw, 1.25rem)',
        }}
      >
        <Box
          component="span"
          sx={{ ...digitSx, alignSelf: 'flex-start' }}
        >
          {h12}
        </Box>

        <Box
          aria-hidden="true"
          sx={{
            alignSelf: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(0.75rem, 1.6vw, 1.5rem)',
          }}
        >
          <Box
            sx={{
              width: 'clamp(12px, 1.2vw, 18px)',
              height: 'clamp(12px, 1.2vw, 18px)',
              borderRadius: '50%',
              backgroundColor: dotColor,
            }}
          />
          <Box
            sx={{
              width: 'clamp(12px, 1.2vw, 18px)',
              height: 'clamp(12px, 1.2vw, 18px)',
              borderRadius: '50%',
              backgroundColor: dotColor,
            }}
          />
        </Box>

        <Box
          sx={{
            alignSelf: 'flex-end',
            display: 'flex',
            alignItems: 'baseline',
            gap: 1.25,
          }}
        >
          <Box component="span" sx={digitSx}>
            {mins}
          </Box>
          <Box
            component="span"
            sx={{
              fontFamily: theme.typography.fontFamily,
              fontWeight: 300,
              fontSize: 'clamp(1rem, 1.4vw, 1.5rem)',
              color: 'text.secondary',
              lineHeight: 1,
            }}
          >
            {ampm}
          </Box>
        </Box>
      </Box>

      {/* Date caption */}
      <Box sx={{ mt: { xs: 2, md: 3 }, pl: 0.5 }}>
        <Typography
          variant="h5"
          sx={{
            fontFamily: theme.typography.fontFamily,
            fontWeight: 400,
            color: 'text.secondary',
            lineHeight: 1.2,
          }}
        >
          {dayLine}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontFamily: theme.typography.fontFamily,
            color: 'text.disabled',
            mt: 0.25,
          }}
        >
          {dateLine}
        </Typography>
      </Box>
    </Box>
  );
}
