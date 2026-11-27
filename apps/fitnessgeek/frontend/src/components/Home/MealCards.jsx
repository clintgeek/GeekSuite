import React from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import { Add as AddIcon, Close as RemoveIcon } from '@mui/icons-material';
import { MEAL_ORDER, mealColors } from '../../theme/theme.jsx';
import { amountName, mealLabel, mealWord, mergeByName } from '../../utils/plainWords.js';
import { Surface, Rule, ListRow } from '../primitives';

/**
 * Today's meals as four label panels (SIMPLE_AND_FULL_PLAN.md item 1, The
 * Label): Breakfast, Lunch, Dinner, Snacks. Each has a heavy title with a
 * small square in its meal colour, its calories right, a medium rule, the
 * foods as rows, and its own "+ Add" that opens the add sheet already set to
 * that meal — so there is no separate meal picker to get wrong.
 *
 * The meal colour is a small mark only (the square), never a card
 * background; every word is the theme's ink, and "+ Add" is the app's blue.
 *
 * `compact` (Simple) shows the first two foods and a count; Full lists every
 * food with its calories and a remove button, which Chef uses.
 *
 * Amounts show (review L4): "Egg ×2" when an entry isn't one serving, and in
 * compact cards two entries with the same name merge into one line, "Egg ×2",
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

  return (
    <Surface
      component="section"
      id={`meal-card-${mealType}`}
      aria-labelledby={`meal-card-${mealType}-title`}
      data-testid={`meal-card-${mealType}`}
      sx={{
        // Clear of the sticky top bar when Home scrolls a card into view.
        scrollMarginTop: 88,
        display: 'flex',
        flexDirection: 'column',
        pt: { xs: 1, sm: 1.25 },
        pb: { xs: 0.5, sm: 0.75 },
      }}
    >
      {/* The header row is a link to this meal in the log. Its ::after
          stretches over the whole panel, so a tap anywhere opens it, while
          Add and the remove buttons sit above it and stay their own targets
          (a link wrapping buttons is invalid and unreadable to a screen
          reader). The row itself — not just the title — is the link, so its
          own box is a full-width tap target. */}
      <Box
        {...(logHref ? {
          component: RouterLink,
          to: logHref,
          'aria-label': `Open ${mealWord(mealType)} in the food log`,
        } : {})}
        sx={{
          display: 'flex',
          flexDirection: compact ? 'column' : 'row',
          alignItems: compact ? 'flex-start' : 'baseline',
          justifyContent: 'space-between',
          gap: compact ? 0.25 : 1.5,
          minHeight: 44,
          color: 'inherit',
          textDecoration: 'none',
          ...(logHref ? {
            '&::after': { content: '""', position: 'absolute', inset: 0, zIndex: 0 },
            '&:focus-visible': { outline: 'none' },
            '&:focus-visible::after': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: -3 },
          } : {}),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Box aria-hidden sx={{ width: 12, height: 12, flexShrink: 0, bgcolor: colour.fill }} />
          <Typography
            id={`meal-card-${mealType}-title`}
            component="h3"
            sx={{ fontSize: compact ? '1.25rem' : '1.375rem', fontWeight: 900, lineHeight: 1.1, color: 'text.primary' }}
          >
            {label}
          </Typography>
        </Box>
        {amount && (
          <Typography sx={{ fontSize: compact ? '1rem' : '1.125rem', fontWeight: 700, whiteSpace: 'nowrap', color: 'text.primary' }}>
            {amount}
          </Typography>
        )}
      </Box>
      <Rule weight="medium" sx={{ mt: 0.5 }} />

      {!unknown && foods.length === 0 && (
        <ListRow first>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary' }}>Nothing yet</Typography>
        </ListRow>
      )}

      {foods.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {shown.map((food, i) => (
            <ListRow
              component="li"
              key={food.logId || food.name}
              first={i === 0}
              sx={{
                py: compact || !onRemove ? 0.75 : 0,
                minHeight: compact ? 0 : 44,
                opacity: removingIds?.has?.(food.logId) ? 0.4 : 1,
                transition: 'opacity 200ms ease',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: compact ? '1.0625rem' : '1rem', color: 'text.primary', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                {amountName(food.name, food.servings)}
              </Typography>
              {!compact && (
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {Math.round(food.calories || 0)}
                </Typography>
              )}
              {!compact && onRemove && (
                <IconButton
                  size="small"
                  aria-label={`Remove ${food.name} from ${mealWord(mealType)}`}
                  onClick={() => onRemove(food.logId)}
                  sx={{ color: 'text.secondary', width: 44, height: 44, mr: -1.25, ml: -0.5, position: 'relative', zIndex: 1 }}
                >
                  <RemoveIcon fontSize="small" />
                </IconButton>
              )}
            </ListRow>
          ))}
          {hidden > 0 && (
            <ListRow component="li" sx={{ py: 0.75 }}>
              <Typography sx={{ fontSize: '1rem', color: 'text.secondary' }}>and {hidden} more</Typography>
            </ListRow>
          )}
        </Box>
      )}

      {/* Full's "Just added" strip: above the stretched link, so its own
          buttons stay their own targets. */}
      {justAdded && <Box sx={{ position: 'relative', zIndex: 1, py: 0.5 }}>{justAdded}</Box>}

      <Box sx={{ flex: 1 }} />
      {/* "+ Add": a blue text-link row in Full; Simple's is a big outlined
          button, still a secondary action (the filled one is the page's). */}
      <Box sx={{ borderTop: compact ? 0 : `1px solid ${theme.palette.divider}`, pt: compact ? 1 : 0, pb: compact ? 1 : 0 }}>
        <Button
          onClick={() => onAdd?.(mealType)}
          startIcon={<AddIcon aria-hidden />}
          aria-label={`Add to ${mealWord(mealType)}`}
          variant={compact ? 'outlined' : 'text'}
          fullWidth={compact}
          sx={{
            position: 'relative',
            zIndex: 1,
            minHeight: compact ? 52 : 44,
            fontSize: compact ? '1.125rem' : '1rem',
            fontWeight: 700,
            textTransform: 'none',
            color: 'primary.main',
            justifyContent: compact ? 'center' : 'flex-start',
            ...(compact
              ? { borderWidth: 2, borderColor: 'primary.main', '&:hover': { borderWidth: 2 } }
              : { px: 0, width: '100%', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }),
          }}
        >
          Add
        </Button>
      </Box>
    </Surface>
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
 * Layout: Full stacks on a phone and fills the width in a responsive grid
 * from `sm` up; Simple is two across on a phone, as dense as before.
 */
export default function MealCards({ meals = {}, compact = false, onAdd, onRemove, removingIds, date, justAdded = null, unknown = false }) {
  return (
    <Box
      data-testid="meal-cards"
      sx={{
        display: 'grid',
        gap: { xs: 1.5, sm: 2 },
        // Simple: a "Nothing yet" tile keeps its own height instead of
        // stretching to a full neighbour's (review C8).
        alignItems: compact ? 'start' : 'stretch',
        gridTemplateColumns: compact
          ? { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }
          : { xs: 'minmax(0, 1fr)', sm: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))' },
      }}
    >
      {MEAL_ORDER.map((mealType) => (
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
      ))}
    </Box>
  );
}
