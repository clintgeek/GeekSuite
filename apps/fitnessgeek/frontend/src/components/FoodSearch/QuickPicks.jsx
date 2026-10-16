import React, { useMemo } from 'react';
import { Box, Button, Chip, CircularProgress, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Replay as AgainIcon, History as YesterdayIcon, RestaurantMenu as MealIcon } from '@mui/icons-material';
import { useRecentLogs } from '../../hooks/useRecentLogs.js';
import { rankAgainChips, yesterdaysMeal } from '../../utils/againChips.js';
import { daysBefore } from '../../utils/experience.js';
import { mealWord } from '../../utils/plainWords.js';
import { useToday } from '../../hooks/useToday.js';
import { mealOnDay } from './composerText.js';

/**
 * One-tap logging (SIMPLE_AND_FULL_PLAN.md item 2), shown in the add box
 * before anything is typed:
 *
 *   - "Same as yesterday's lunch" — every food from yesterday's lunch, at the
 *     servings it was logged with, in one tap. This is what Copy Meal was for
 *     nine times out of ten; Copy Meal itself stays, for any other day.
 *   - "Again" chips — the foods and saved meals this person logs most in this
 *     meal (utils/againChips.js), each re-logged at its last servings.
 *
 * Both go through the box's own `logFoods`, so the toast, the Undo and the
 * session ribbon are the same as a tapped search result's. `onPick(items, key)`
 * names which one was tapped, so it can say "Adding…" while the rest wait.
 */
const YESTERDAY_KEY = 'quick:yesterday';

/**
 * "Same as yesterday's lunch" names the actual day, counted from the day on
 * screen (REVIEW_2026-10 Phase 1.5): backfilling Wednesday's dinner, the
 * button copies Tuesday's and says "Same as Tuesday's dinner". `heading`
 * goes above everything, and only when there is something under it.
 */
export default function QuickPicks({ date, mealType, onPick, busy = false, pendingKey = null, heading = null }) {
  const theme = useTheme();
  const today = useToday();
  const produce = theme.palette.produce?.[mealType] || {};
  const { logs, meals, loading } = useRecentLogs(date);

  const chips = useMemo(() => rankAgainChips({ logs, savedMeals: meals, mealType }), [logs, meals, mealType]);
  const yesterday = useMemo(
    () => yesterdaysMeal({ logs, mealType, yesterday: daysBefore(date, 1) }),
    [logs, mealType, date]
  );

  if (loading || (chips.length === 0 && yesterday.length === 0)) return null;
  const meal = mealWord(mealType);
  const previous = daysBefore(date, 1);
  const sameAs = `Same as ${mealOnDay(meal, previous, today)}`;

  return (
    <Box data-testid="quick-picks" sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {heading && (
        <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 800, color: 'text.secondary', mt: 0.5 }}>
          {heading}
        </Typography>
      )}
      {yesterday.length > 0 && (
        <Button
          variant="outlined"
          size="large"
          startIcon={pendingKey === YESTERDAY_KEY ? <CircularProgress size={18} color="inherit" /> : <YesterdayIcon />}
          disabled={busy}
          onClick={() => onPick?.(yesterday, YESTERDAY_KEY)}
          data-testid="same-as-yesterday"
          sx={{
            justifyContent: 'flex-start',
            minHeight: 56,
            borderRadius: '18px',
            borderWidth: 2,
            borderColor: produce.fill,
            color: 'text.primary',
            bgcolor: produce.tint,
            textAlign: 'left',
            '@media (hover: hover)': { '&:hover': { borderWidth: 2, borderColor: produce.fill, bgcolor: produce.tint } },
          }}
        >
          <Box component="span" sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <span>{pendingKey === YESTERDAY_KEY ? 'Adding…' : sameAs}</span>
            <Box component="span" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: 'text.secondary' }}>
              {yesterday.map((f) => f.name).slice(0, 3).join(', ')}{yesterday.length > 3 ? ` and ${yesterday.length - 3} more` : ''}
            </Box>
          </Box>
        </Button>
      )}

      {chips.length > 0 && (
        <Box>
          <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 800, color: 'text.secondary', mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <AgainIcon sx={{ fontSize: 20 }} aria-hidden /> Again
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }} data-testid="again-chips">
            {chips.map((chip) => (
              <Chip
                key={chip.key}
                icon={pendingKey === `quick:${chip.key}`
                  ? <CircularProgress size={16} color="inherit" />
                  : chip.kind === 'meal' ? <MealIcon /> : undefined}
                label={pendingKey === `quick:${chip.key}` ? 'Adding…' : chip.label}
                disabled={busy}
                onClick={() => onPick?.([chip.item], `quick:${chip.key}`)}
                aria-label={`Add ${chip.label} to ${meal} again`}
                sx={{
                  height: 48,
                  borderRadius: 999,
                  fontSize: '1rem',
                  bgcolor: theme.palette.background.paper,
                  border: `1.5px solid ${theme.palette.divider}`,
                  color: 'text.primary',
                  maxWidth: '100%',
                  '& .MuiChip-label': { px: 1.75, fontSize: '1rem', fontWeight: 700 },
                  '& .MuiChip-icon': { color: produce.text },
                  '@media (hover: hover)': { '&:hover': { bgcolor: produce.tint } },
                }}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
