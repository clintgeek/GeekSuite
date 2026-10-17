import React, { useMemo } from 'react';
import { Box, Button, Chip, CircularProgress, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Replay as AgainIcon, History as YesterdayIcon, RestaurantMenu as MealIcon, People as PeopleIcon } from '@mui/icons-material';
import { useRecentLogs } from '../../hooks/useRecentLogs.js';
import { rankAgainChips, yesterdaysMeal } from '../../utils/againChips.js';
import { daysBefore } from '../../utils/experience.js';
import { mealWord } from '../../utils/plainWords.js';
import { useToday } from '../../hooks/useToday.js';
import { sheetMealOnDay } from './composerText.js';
import { withAmount } from './entries.js';
import { useHouseholdMeals } from './useHouseholdMeals.js';

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
 *   - "Same as Chef's dinner" (L7) — for each household member who shares
 *     their food log and logged this meal on this day. One tap copies it
 *     through the gateway's household copy path; hidden when nothing matches.
 *
 * All of them go through the box's own logger, so the toast, the Undo and the
 * session ribbon are the same as a tapped search result's. `onPick(items, key)`
 * names which one was tapped, so it can say "Adding…" while the rest wait.
 *
 * AN AGAIN CHIP COUNTS LIKE A ROW (L14). Most of her habitual foods are chips
 * now, and a chip could only say "one more entry". Once tapped it says
 * "Egg · Added ✓" (then "2 added ✓"), and "Make it 2" sits beside it;
 * `added[key]` is what the box has written for it this sitting. A chip that
 * re-logs more than one serving says so: "Toast ×2".
 */
const YESTERDAY_KEY = 'quick:yesterday';
const householdKey = (userId) => `quick:household:${userId}`;

/**
 * "Same as yesterday's lunch" names the actual day, counted from the day on
 * screen (REVIEW_2026-10 Phase 1.5): backfilling Wednesday's dinner, the
 * button copies Tuesday's and says "Same as Tuesday's dinner" — in the same
 * weekday style as the sheet's title (L22). `heading` goes above everything,
 * and only when there is something under it.
 */
export default function QuickPicks({
  date,
  mealType,
  onPick,
  onMore,
  added = {},
  busy = false,
  pendingKey = null,
  heading = null,
}) {
  const theme = useTheme();
  const today = useToday();
  const produce = theme.palette.produce?.[mealType] || {};
  const { logs, meals, loading } = useRecentLogs(date);
  const household = useHouseholdMeals(date, mealType);

  const chips = useMemo(() => rankAgainChips({ logs, savedMeals: meals, mealType }), [logs, meals, mealType]);
  const yesterday = useMemo(
    () => yesterdaysMeal({ logs, mealType, yesterday: daysBefore(date, 1) }),
    [logs, mealType, date]
  );

  if (loading || (chips.length === 0 && yesterday.length === 0 && household.length === 0)) return null;
  const meal = mealWord(mealType);
  const previous = daysBefore(date, 1);
  const sameAs = `Same as ${sheetMealOnDay(meal, previous, today, date)}`;
  const bigButton = {
    justifyContent: 'flex-start',
    minHeight: 56,
    borderRadius: '18px',
    borderWidth: 2,
    borderColor: produce.fill,
    color: 'text.primary',
    bgcolor: produce.tint,
    textAlign: 'left',
    '@media (hover: hover)': { '&:hover': { borderWidth: 2, borderColor: produce.fill, bgcolor: produce.tint } },
  };
  const listOf = (names) => `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`;

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
          sx={bigButton}
        >
          <Box component="span" sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <span>{pendingKey === YESTERDAY_KEY ? 'Adding…' : sameAs}</span>
            <Box component="span" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: 'text.secondary' }}>
              {listOf(yesterday.map((f) => f.name))}
            </Box>
          </Box>
        </Button>
      )}

      {household.map((member) => {
        const key = householdKey(member.userId);
        const label = `Same as ${member.name}'s ${meal}`;
        return (
          <Button
            key={key}
            variant="outlined"
            size="large"
            startIcon={pendingKey === key ? <CircularProgress size={18} color="inherit" /> : <PeopleIcon />}
            disabled={busy}
            aria-label={label}
            data-testid="same-as-household"
            onClick={() => onPick?.([{
              type: 'household-meal',
              name: `${member.name}'s ${meal}`,
              fromUserId: member.userId,
              fromDate: date,
              fromMealType: mealType,
              servings: 1,
              nutrition: { calories_per_serving: member.calories },
            }], key)}
            sx={bigButton}
          >
            <Box component="span" sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
              <span>{pendingKey === key ? 'Adding…' : label}</span>
              <Box component="span" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: 'text.secondary' }}>
                {listOf(member.foods)}
              </Box>
            </Box>
          </Button>
        );
      })}

      {chips.length > 0 && (
        <Box>
          <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 800, color: 'text.secondary', mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <AgainIcon sx={{ fontSize: 20 }} aria-hidden /> Again
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }} data-testid="again-chips">
            {chips.map((chip) => {
              const key = `quick:${chip.key}`;
              const isMeal = chip.kind === 'meal';
              const name = isMeal ? chip.label : withAmount(chip.label, chip.item?.servings);
              const done = !isMeal ? added?.[key] : null;
              const count = Math.round((Number(done?.servings) || 1) * 100) / 100;
              const doneText = count > 1 ? `${count} added ✓` : 'Added ✓';
              const next = Math.round(count + 1);
              return (
                <Box key={chip.key} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, maxWidth: '100%' }}>
                  <Chip
                    icon={pendingKey === key
                      ? <CircularProgress size={16} color="inherit" />
                      : isMeal ? <MealIcon /> : undefined}
                    label={pendingKey === key ? 'Adding…' : done ? `${chip.label} · ${doneText}` : name}
                    disabled={busy}
                    onClick={() => onPick?.([chip.item], key)}
                    aria-label={done ? `Add another ${chip.label} to ${meal}` : `Add ${name} to ${meal} again`}
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
                  {done && onMore && (
                    <Button
                      variant="outlined"
                      disabled={busy}
                      onClick={() => onMore(key, next, chip.item)}
                      aria-label={`Make it ${next} ${chip.label}`}
                      sx={{ minHeight: 48, borderRadius: 999, borderWidth: 2, fontWeight: 800, fontSize: '0.9375rem', px: 1.5, whiteSpace: 'nowrap', flexShrink: 0, '@media (hover: hover)': { '&:hover': { borderWidth: 2 } } }}
                    >
                      Make it {next}
                    </Button>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}
