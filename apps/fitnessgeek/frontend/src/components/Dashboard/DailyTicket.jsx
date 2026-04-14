import React from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import { useTheme, alpha, keyframes } from '@mui/material/styles';
import { Surface, StatNumber, SectionLabel } from '../primitives';
import NetCarbMeter from './NetCarbMeter';

// ─── Subtle "printed" fade-in for the ticket on mount ───
const ticketEnter = keyframes`
  0%   { opacity: 0; transform: translateY(-8px); }
  100% { opacity: 1; transform: translateY(0); }
`;

// Day-of-year computation — the "receipt number" (e.g. 101/365)
const dayOfYear = (d = new Date()) => {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1000;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const isLeapYear = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const formatDateParts = (d = new Date()) => ({
  weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
  month: d.toLocaleDateString('en-US', { month: 'long' }),
  day: String(d.getDate()).padStart(2, '0'),
  year: d.getFullYear(),
  dayOfYear: dayOfYear(d),
  daysInYear: isLeapYear(d.getFullYear()) ? 366 : 365,
});

const MacroMicroBar = ({ label, current = 0, goal = 0, color }) => {
  const theme = useTheme();
  const ink = theme.palette.text.primary;
  const pct = goal > 0 ? Math.min(1, current / goal) : 0;
  const barBg = alpha(ink, theme.palette.mode === 'dark' ? 0.1 : 0.08);

  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          mb: 0.5,
        }}
      >
        <Typography
          sx={{
            fontSize: '0.625rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: theme.palette.text.secondary,
          }}
        >
          {label}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.25 }}>
          <Typography
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontVariantNumeric: 'tabular-nums',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: ink,
            }}
          >
            {Math.round(current)}
          </Typography>
          <Typography
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.625rem',
              color: theme.palette.text.secondary,
            }}
          >
            /{Math.round(goal)}g
          </Typography>
        </Box>
      </Box>
      <Box
        sx={{
          height: 3,
          backgroundColor: barBg,
          borderRadius: 2,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct * 100}%`,
            backgroundColor: color,
            borderRadius: 2,
            transition: 'width 600ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </Box>
    </Box>
  );
};

/**
 * DailyTicket — the editorial hero card for the dashboard.
 *
 * A daily receipt stub showing the date, a massive calorie count, the target
 * remaining, and a compact macro strip. Uses the Surface "ticket" variant for
 * the perforated top edge, sets the aesthetic tone for the entire page.
 */
const DailyTicket = ({
  consumed = 0,
  goal = 2000,
  remaining = 2000,
  greeting,
  protein = { current: 0, goal: 150 },
  carbs = { current: 0, goal: 250 },
  fat = { current: 0, goal: 65 },
  // Keto mode props
  mode = 'standard',
  netCarbsConsumed = 0,
  netCarbLimit = 20,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const primary = theme.palette.primary.main;
  const { weekday, month, day, year, dayOfYear: dayNum, daysInYear } = formatDateParts();

  const consumedRounded = Math.round(consumed || 0);
  const goalRounded = Math.round(goal || 0);
  const remainingRounded = Math.round(remaining || 0);
  const isOver = consumedRounded > goalRounded;

  const percentage = goalRounded > 0 ? Math.min((consumedRounded / goalRounded) * 100, 100) : 0;

  return (
    <Surface
      variant="ticket"
      padded={false}
      sx={{
        animation: `${ticketEnter} 520ms cubic-bezier(0.22, 1, 0.36, 1)`,
        overflow: 'hidden',
      }}
    >
      {/* Top section: date strip — extra top padding makes room for the
          perforation rendered by Surface's ::before */}
      <Box
        sx={{
          px: { xs: 2.5, sm: 3.5 },
          pt: { xs: 3, sm: 3.5 },
          pb: 1.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 2,
          borderBottom: `1px dashed ${alpha(ink, 0.18)}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.625rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: muted,
              whiteSpace: 'nowrap',
            }}
          >
            NO. {String(dayNum).padStart(3, '0')}/{daysInYear}
          </Typography>
          <Typography
            sx={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: { xs: '0.9375rem', sm: '1rem' },
              fontWeight: 400,
              color: ink,
              lineHeight: 1,
              letterSpacing: '-0.005em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {weekday}, {month} {parseInt(day, 10)}
          </Typography>
        </Box>
        {greeting && (
          <Typography
            sx={{
              fontSize: '0.625rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: muted,
              flexShrink: 0,
            }}
          >
            {greeting}
          </Typography>
        )}
      </Box>

      {/* Center section: massive calorie display */}
      <Box
        sx={{
          px: { xs: 2.5, sm: 3.5 },
          pt: { xs: 2.5, sm: 3 },
          pb: { xs: 1.5, sm: 2 },
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
        }}
      >
        {/* Consumed — hero count-up */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <SectionLabel sx={{ mb: 1 }}>Consumed</SectionLabel>
          <StatNumber
            value={consumedRounded}
            unit="kcal"
            size="hero"
            animate
            color={isOver ? theme.palette.error.main : ink}
          />
        </Box>

        {/* Target — smaller, right-aligned */}
        <Box
          sx={{
            textAlign: 'right',
            flexShrink: 0,
            borderLeft: { xs: 'none', sm: `1px dashed ${alpha(ink, 0.15)}` },
            pl: { xs: 0, sm: 2.5 },
            pt: { xs: 1, sm: 0 },
            width: { xs: '100%', sm: 'auto' },
          }}
        >
          <SectionLabel sx={{ mb: 1, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
            {isOver ? 'Over by' : 'Remaining'}
          </SectionLabel>
          <StatNumber
            value={Math.abs(remainingRounded)}
            unit="kcal"
            size="display"
            animate
            color={
              isOver
                ? theme.palette.error.main
                : remainingRounded < goalRounded * 0.1
                ? theme.palette.warning.main
                : theme.palette.success.main
            }
            align="right"
          />
          <Typography
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontVariantNumeric: 'tabular-nums',
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: muted,
              mt: 0.5,
            }}
          >
            of {goalRounded.toLocaleString()} target
          </Typography>
        </Box>
      </Box>

      {/* Progress bar / keto meter — full width */}
      <Box sx={{ px: { xs: 2.5, sm: 3.5 }, pb: 2 }}>
        {mode === 'keto' ? (
          <>
            <NetCarbMeter consumed={netCarbsConsumed} limitG={netCarbLimit} />
            {/* Calories demoted to a secondary caption line */}
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                mt: 1.5,
                fontFamily: "'JetBrains Mono', monospace",
                fontVariantNumeric: 'tabular-nums',
                fontSize: '0.75rem',
                color: theme.palette.text.secondary,
              }}
            >
              {consumedRounded.toLocaleString()} / {goalRounded.toLocaleString()} kcal
            </Typography>
          </>
        ) : (
          <LinearProgress
            variant="determinate"
            value={percentage}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: alpha(ink, isDark ? 0.08 : 0.06),
              '& .MuiLinearProgress-bar': {
                borderRadius: 4,
                backgroundColor: isOver ? theme.palette.error.main : primary,
                transition: 'transform 800ms cubic-bezier(0.22, 1, 0.36, 1)',
              },
            }}
          />
        )}
      </Box>

      {/* Macro strip — perforated separator + 3 micro bars */}
      <Box
        sx={{
          px: { xs: 2.5, sm: 3.5 },
          pt: 1.25,
          pb: { xs: 2, sm: 2.5 },
          borderTop: `1px dashed ${alpha(ink, 0.18)}`,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
          gap: { xs: 1.25, sm: 2.5 },
        }}
      >
        {mode === 'keto' ? (
          <>
            <MacroMicroBar
              label="Fat"
              current={fat.current}
              goal={fat.goal}
              color={theme.palette.error.main}
            />
            <MacroMicroBar
              label="Protein"
              current={protein.current}
              goal={protein.goal}
              color={theme.palette.success.main}
            />
            <MacroMicroBar
              label="Net Carbs"
              current={netCarbsConsumed}
              goal={netCarbLimit}
              color={theme.palette.warning.main}
            />
          </>
        ) : (
          <>
            <MacroMicroBar
              label="Protein"
              current={protein.current}
              goal={protein.goal}
              color={theme.palette.success.main}
            />
            <MacroMicroBar
              label="Carbs"
              current={carbs.current}
              goal={carbs.goal}
              color={theme.palette.warning.main}
            />
            <MacroMicroBar
              label="Fat"
              current={fat.current}
              goal={fat.goal}
              color={theme.palette.error.main}
            />
          </>
        )}
      </Box>
    </Surface>
  );
};

export default DailyTicket;
