import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';

/**
 * The calorie ring, drawn as a plate (DOCS/SIMPLE_AND_FULL_PLAN.md,
 * Decisions: "the calorie ring drawn as a plate, not a gauge").
 *
 * A rim, a well, and the day's eating filling the rim clockwise from twelve
 * o'clock in the four meal colours, in the order they were eaten. The number
 * in the well is what is LEFT — the answer to "how am I doing today?" — and
 * the whole thing is one image with one name, because the sentence beside it
 * says the same thing in words.
 *
 * Over target, the rim is full and a plum edge says so; nothing flashes red.
 */
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

/* `showNumber={false}` leaves the well empty — Simple Home, where the
 * sentence beside the plate already says the number (review Phase 2.13).
 * `centre="percent"` puts how much of the target is eaten in the well
 * ("72%") instead of what's left — Full Home, where the sentence says
 * "660 left" and the detail "1,680 eaten of 2,340", so a third copy of the
 * same number told him nothing new (review D-14). With no target there is
 * no percent, and the well stays empty. */
export default function PlateRing({ eaten = 0, goal = 0, byMeal = {}, size = 200, label, showNumber = true, centre = 'left' }) {
  const theme = useTheme();
  const produce = theme.palette.produce || {};
  const isDark = theme.palette.mode === 'dark';

  const stroke = Math.round(size * 0.11);
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const g = Math.max(0, Number(goal) || 0);
  const e = Math.max(0, Number(eaten) || 0);
  const scale = g > 0 ? g : Math.max(e, 1);
  const over = g > 0 && e > g;
  const left = g > 0 ? Math.max(0, Math.round(g - e)) : null;
  const percent = centre === 'percent';
  const showWell = showNumber && !(percent && !(g > 0));

  // One arc per meal, laid end to end, capped at a full rim.
  let offset = 0;
  const arcs = MEALS.map((meal) => {
    const cal = Math.max(0, Number(byMeal[meal]) || 0);
    const len = Math.min(c - offset, (cal / scale) * c);
    const arc = { meal, len: Math.max(0, len), start: offset };
    offset += arc.len;
    return arc;
  }).filter((a) => a.len > 0.5);

  const rimTrack = isDark ? alpha('#F7EDE0', 0.08) : '#F3E9D8';
  const plate = theme.palette.background.paper;
  const well = isDark ? alpha('#F7EDE0', 0.03) : '#FFFBF3';

  return (
    <Box
      role="img"
      aria-label={label}
      sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        {/* The plate and its soft shadow */}
        <circle cx={size / 2} cy={size / 2 + 3} r={r + stroke / 2} fill={isDark ? 'rgba(0,0,0,0.35)' : 'rgba(92,64,32,0.10)'} />
        <circle cx={size / 2} cy={size / 2} r={r + stroke / 2} fill={plate} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={rimTrack} strokeWidth={stroke} />
        {/* The well */}
        <circle cx={size / 2} cy={size / 2} r={r - stroke / 2 - 6} fill={well} stroke={theme.palette.divider} strokeWidth={1.5} />
        {/* What's been eaten, meal by meal */}
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {arcs.map((arc) => (
            <circle
              key={arc.meal}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={produce[arc.meal]?.fill || theme.palette.primary.main}
              strokeWidth={stroke}
              strokeDasharray={`${arc.len} ${c}`}
              strokeDashoffset={-arc.start}
              strokeLinecap="butt"
            />
          ))}
        </g>
        {over && (
          <circle cx={size / 2} cy={size / 2} r={r + stroke / 2 - 1} fill="none" stroke={produce.snack?.text || theme.palette.secondary.main} strokeWidth={2.5} />
        )}
      </svg>
      {showWell && (
      <Box
        data-testid="plate-number"
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <Typography sx={{ fontSize: size * 0.2, fontWeight: 800, lineHeight: 1, color: 'text.primary' }}>
          {percent
            ? `${Math.round((e / g) * 100).toLocaleString('en-US')}%`
            : left === null ? Math.round(e).toLocaleString('en-US') : over ? `+${Math.round(e - g).toLocaleString('en-US')}` : left.toLocaleString('en-US')}
        </Typography>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.secondary', mt: 0.5 }}>
          {percent ? 'eaten' : left === null ? 'eaten' : over ? 'over' : 'left'}
        </Typography>
      </Box>
      )}
    </Box>
  );
}
