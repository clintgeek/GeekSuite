import React from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import { Add as AddIcon, Close as RemoveIcon } from '@mui/icons-material';
import { MEAL_ORDER, mealColors } from '../../theme/theme.jsx';
import { amountName, mealLabel, mealWord, mergeByName } from '../../utils/plainWords.js';
import { Surface } from '../primitives';

/**
 * Today's meals (SIMPLE_AND_FULL_PLAN.md item 1): Breakfast, Lunch, Dinner,
 * Snacks.
 *
 * Full draws them as ONE card holding a grouped list — a row per meal with
 * its dot, name, calories and an "Add" button, its foods listed under it —
 * so the day reads top to bottom instead of as four boxes. Simple (`compact`)
 * keeps four small tiles, two across on a phone, each with a big "Add".
 *
 * Either way a meal's own "Add" opens the add sheet already set to that meal,
 * so there is no separate meal picker to get wrong. The meal colour is a
 * small dot only, never a background.
 *
 * `compact` shows the first two foods and a count; Full lists every food
 * with its calories and a remove button, which Chef uses.
 *
 * Amounts show (review L4): "Egg ×2" when an entry isn't one serving, and in
 * compact tiles two entries with the same name merge into one line, "Egg ×2",
 * so she can check what she logged instead of adding another to be safe.
 */
function MealCard({ mealType, foods = [], calories = 0, compact, onAdd, onRemove, removingIds, logHref, justAdded = null, unknown = false }) {
  const theme = useTheme();
  const colour = mealColors(mealType, theme.palette.mode);
  const label = mealLabel(mealType);
  const rows = compact ? mergeByName(foods) : foods;
  const shown = compact ? rows.slice(0, 2) : rows;
  const hidden = rows.length - shown.length;
  const cal = Math.round(calories || 0);
  // A meal that couldn't be read is unknown ("—"), never "Nothing yet".
  const amount = unknown ? '—' : foods.length === 0 ? null : `${cal.toLocaleString('en-US')} cal`;
  const empty = !unknown && foods.length === 0;
  const Root = compact ? Surface : Box;

  const addButton = (
    <Button
      onClick={() => onAdd?.(mealType)}
      startIcon={<AddIcon aria-hidden />}
      aria-label={`Add to ${mealWord(mealType)}`}
      variant={compact ? 'outlined' : 'tonal'}
      fullWidth={compact}
      size={compact ? 'medium' : 'small'}
      sx={{
        position: 'relative',
        zIndex: 1,
        flexShrink: 0,
        minHeight: compact ? 52 : { xs: 44, md: 36 },
        '@media (pointer: coarse)': { minHeight: compact ? 52 : 44 },
        fontSize: compact ? '1.125rem' : '0.9375rem',
        fontWeight: 600,
        textTransform: 'none',
        ...(compact ? { color: 'primary.main', borderColor: 'primary.main' } : {}),
      }}
    >
      Add
    </Button>
  );

  return (
    <Root
      component="section"
      id={`meal-card-${mealType}`}
      aria-labelledby={`meal-card-${mealType}-title`}
      data-testid={`meal-card-${mealType}`}
      sx={{
        position: 'relative',
        // Clear of the sticky top bar when Home scrolls a meal into view.
        scrollMarginTop: 88,
        display: 'flex',
        flexDirection: 'column',
        ...(compact
          ? { p: { xs: 3, sm: 4 } }
          : { px: { xs: 4, sm: 5 }, py: 2, '& + &': { borderTop: `1px solid ${theme.palette.divider}` } }),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {/* The header is a link to this meal in the log. Its ::after
            stretches over the whole meal, so a tap anywhere opens it, while
            Add and the remove buttons sit above it and stay their own targets
            (a link wrapping buttons is invalid and unreadable to a screen
            reader). */}
        <Box
          {...(logHref ? {
            component: RouterLink,
            to: logHref,
            'aria-label': `Open ${mealWord(mealType)} in the food log`,
          } : {})}
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: compact ? 'column' : 'row',
            alignItems: compact ? 'flex-start' : 'center',
            justifyContent: compact ? 'center' : 'space-between',
            gap: compact ? 0.5 : 3,
            minHeight: 44,
            color: 'inherit',
            textDecoration: 'none',
            ...(logHref ? {
              '&::after': { content: '""', position: 'absolute', inset: 0, zIndex: 0, borderRadius: compact ? '16px' : 0 },
              '&:focus-visible': { outline: 'none' },
              '&:focus-visible::after': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: -3 },
            } : {}),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, minWidth: 0 }}>
            <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, bgcolor: colour.fill }} />
            <Typography
              id={`meal-card-${mealType}-title`}
              component="h3"
              sx={{ fontSize: compact ? '1.125rem' : '1.0625rem', fontWeight: 600, lineHeight: 1.2, color: 'text.primary' }}
            >
              {label}
            </Typography>
          </Box>
          {amount && (
            <Typography sx={{ fontSize: '1rem', fontWeight: 600, whiteSpace: 'nowrap', color: 'text.primary', pl: compact ? 5 : 0 }}>
              {amount}
            </Typography>
          )}
          {empty && !compact && (
            <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>Nothing yet</Typography>
          )}
        </Box>
        {!compact && addButton}
      </Box>

      {empty && compact && (
        <Typography sx={{ fontSize: '1rem', color: 'text.secondary', py: 1 }}>Nothing yet</Typography>
      )}

      {foods.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, pl: compact ? 0 : 5, pb: compact ? 0 : 1 }}>
          {shown.map((food) => (
            <Box
              component="li"
              key={food.logId || food.name}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                py: compact || !onRemove ? 1 : 0,
                minHeight: compact ? 0 : onRemove ? 44 : 32,
                opacity: removingIds?.has?.(food.logId) ? 0.4 : 1,
                transition: 'opacity 200ms ease',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: compact ? '1.0625rem' : '1rem', color: compact ? 'text.primary' : 'text.secondary', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                {amountName(food.name, food.servings)}
              </Typography>
              {!compact && (
                <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                  {Math.round(food.calories || 0)}
                </Typography>
              )}
              {!compact && onRemove && (
                <IconButton
                  size="small"
                  aria-label={`Remove ${food.name} from ${mealWord(mealType)}`}
                  onClick={() => onRemove(food.logId)}
                  sx={{ color: 'text.secondary', width: 44, height: 44, mr: -2.5, ml: -1, position: 'relative', zIndex: 1 }}
                >
                  <RemoveIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
          {hidden > 0 && (
            <Box component="li" sx={{ py: 1 }}>
              <Typography sx={{ fontSize: '1rem', color: 'text.secondary' }}>and {hidden} more</Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Full's "Just added" strip: above the stretched link, so its own
          buttons stay their own targets. */}
      {justAdded && <Box sx={{ position: 'relative', zIndex: 1, py: 1 }}>{justAdded}</Box>}

      {compact && (
        <>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ pt: 2 }}>{addButton}</Box>
        </>
      )}
    </Root>
  );
}

/**
 * `date` (YYYY-MM-DD) makes each panel a link to that day's meal in the food
 * log; without it the panels are not links.
 *
 * `justAdded` is useJustAdded()'s value (Full): the panel a describe landed
 * on carries a "Just added" strip with Fix and Undo until the next action.
 *
 * `unknown` (review L1): the day couldn't be read and there is nothing from
 * before to show, so no panel claims "Nothing yet".
 *
 * Layout: Full is one card, a meal per row; Simple is tiles, two across on a
 * phone.
 */
export default function MealCards({ meals = {}, compact = false, onAdd, onRemove, removingIds, date, justAdded = null, unknown = false }) {
  const cards = MEAL_ORDER.map((mealType) => (
    <MealCard
      key={mealType}
      mealType={mealType}
      foods={meals[mealType]?.foods || []}
      calories={meals[mealType]?.calories || 0}
      compact={compact}
      onAdd={onAdd}
      onRemove={onRemove}
      removingIds={removingIds}
      logHref={date ? `/food-log?date=${date}&meal=${mealType}` : undefined}
      justAdded={justAdded?.renderFor?.(mealType, date) || null}
      unknown={unknown}
    />
  ));

  if (!compact) {
    return (
      <Surface data-testid="meal-cards" padded={false} sx={{ py: 1 }}>
        {cards}
      </Surface>
    );
  }

  return (
    <Box
      data-testid="meal-cards"
      sx={{
        display: 'grid',
        gap: { xs: 3, sm: 4 },
        // A "Nothing yet" tile keeps its own height instead of stretching to
        // a full neighbour's (review C8).
        alignItems: 'start',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' },
      }}
    >
      {cards}
    </Box>
  );
}
