import React from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Add as AddIcon,
  Close as RemoveIcon,
  FreeBreakfast as BreakfastIcon,
  LunchDining as LunchIcon,
  DinnerDining as DinnerIcon,
  Cookie as SnackIcon,
} from '@mui/icons-material';
import { MEAL_ORDER } from '../../theme/theme.jsx';
import { mealLabel, mealWord } from '../../utils/plainWords.js';

/**
 * Today's meals as four big cards (SIMPLE_AND_FULL_PLAN.md item 1): Breakfast,
 * Lunch, Dinner, Snacks, each in its produce colour and each with its own
 * "+ Add" that opens the add sheet already set to that meal — so there is no
 * separate meal picker to get wrong.
 *
 * The produce colour is a FILL (the badge, the button) and a soft tint, never
 * the text: lemon and leaf are unreadable as ink on cream. Every word on a
 * card is the theme's ink.
 *
 * `compact` (Simple) shows the first two foods and a count; Full lists every
 * food with a remove button, which Chef uses.
 */
const ICONS = { breakfast: BreakfastIcon, lunch: LunchIcon, dinner: DinnerIcon, snack: SnackIcon };

function MealCard({ mealType, foods = [], calories = 0, compact, onAdd, onRemove, removingIds }) {
  const theme = useTheme();
  const produce = theme.palette.produce?.[mealType] || {};
  const Icon = ICONS[mealType] || SnackIcon;
  const label = mealLabel(mealType);
  const shown = compact ? foods.slice(0, 2) : foods;
  const hidden = foods.length - shown.length;
  const cal = Math.round(calories || 0);

  return (
    <Box
      component="section"
      aria-labelledby={`meal-card-${mealType}-title`}
      data-testid={`meal-card-${mealType}`}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        p: { xs: 2, sm: 2.5 },
        borderRadius: '24px',
        bgcolor: produce.tint,
        border: `1px solid ${theme.palette.divider}`,
        minHeight: compact ? 188 : 0,
        overflow: 'hidden',
        // The produce edge along the top — a fill, not a word.
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 6,
          bgcolor: produce.fill,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 0.5 }}>
        <Box
          aria-hidden
          sx={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            bgcolor: produce.fill,
            color: produce.ink,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon sx={{ fontSize: 22 }} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography id={`meal-card-${mealType}-title`} component="h3" sx={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.2, color: 'text.primary' }}>
            {label}
          </Typography>
          <Typography sx={{ fontSize: '1rem', color: 'text.secondary', fontWeight: 600 }}>
            {foods.length === 0 ? 'Nothing yet' : `${cal.toLocaleString('en-US')} cal`}
          </Typography>
        </Box>
      </Box>

      {foods.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: compact ? 0.25 : 0.5 }}>
          {shown.map((food) => (
            <Box
              component="li"
              key={food.logId || food.name}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                opacity: removingIds?.has?.(food.logId) ? 0.4 : 1,
                transition: 'opacity 200ms ease',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: '1.0625rem', color: 'text.primary', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                {food.name}
              </Typography>
              {!compact && (
                <Typography sx={{ fontSize: '1rem', color: 'text.secondary', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {Math.round(food.calories || 0)}
                </Typography>
              )}
              {!compact && onRemove && (
                <IconButton
                  size="small"
                  aria-label={`Remove ${food.name} from ${mealWord(mealType)}`}
                  onClick={() => onRemove(food.logId)}
                  sx={{ color: 'text.secondary', width: 44, height: 44, mr: -1 }}
                >
                  <RemoveIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
          {hidden > 0 && (
            <Typography component="li" sx={{ fontSize: '1rem', color: 'text.secondary' }}>
              and {hidden} more
            </Typography>
          )}
        </Box>
      )}

      <Box sx={{ flex: 1 }} />
      <Button
        onClick={() => onAdd?.(mealType)}
        startIcon={<AddIcon />}
        aria-label={`Add to ${mealWord(mealType)}`}
        sx={{
          minHeight: 56,
          borderRadius: 999,
          bgcolor: produce.fill,
          color: produce.ink,
          fontSize: '1.125rem',
          fontWeight: 800,
          alignSelf: compact ? 'stretch' : 'flex-start',
          px: 3,
          '@media (hover: hover)': { '&:hover': { bgcolor: produce.fill, filter: 'brightness(0.96)' } },
          '&:focus-visible': { outline: `3px solid ${theme.palette.text.primary}`, outlineOffset: 2 },
        }}
      >
        Add
      </Button>
    </Box>
  );
}

export default function MealCards({ meals = {}, compact = false, onAdd, onRemove, removingIds }) {
  return (
    <Box
      data-testid="meal-cards"
      sx={{
        display: 'grid',
        gap: { xs: 1.5, sm: 2 },
        gridTemplateColumns: compact
          ? { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }
          : { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
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
        />
      ))}
    </Box>
  );
}
