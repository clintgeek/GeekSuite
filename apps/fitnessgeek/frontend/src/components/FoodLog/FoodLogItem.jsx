import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ChevronRight as ChevronIcon } from '@mui/icons-material';
import { amountLabel, caloriesOf } from './amount.js';

/**
 * One logged food, as a row in its meal (DOCS/ONE_APP_PLAN.md §1.5): the
 * name, the amount when it isn't one serving ("×2", "6 oz"), and what it
 * came to. The whole row is one button that opens Edit, which is where
 * servings, the meal, the day, the nutrition and Remove live — so there is
 * no star, pencil or trash to aim at, and nothing to swipe.
 */
const FoodLogItem = ({ log, onEdit }) => {
  const theme = useTheme();
  const food = log?.food_item || log?.food_item_id;
  if (!food) return null;

  const calories = caloriesOf(log).toLocaleString('en-US');
  const amount = amountLabel(log);

  return (
    <ButtonBase
      onClick={() => onEdit?.(log)}
      aria-label={`Edit ${food.name}${amount ? `, ${amount}` : ''}, ${calories} cal`}
      data-testid="food-log-row"
      sx={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        minHeight: 48,
        py: 1.5,
        textAlign: 'left',
        borderRadius: '10px',
        '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: -3 },
        '@media (hover: hover)': { '&:hover': { backgroundColor: theme.palette.action.hover } },
      }}
    >
      <Typography
        component="span"
        sx={{ flex: 1, minWidth: 0, fontSize: '1rem', color: 'text.primary', lineHeight: 1.35, overflowWrap: 'anywhere' }}
      >
        {food.name}
        {amount && (
          <Box component="span" sx={{ color: 'text.secondary', ml: 1.5, whiteSpace: 'nowrap' }}>
            {amount}
          </Box>
        )}
      </Typography>
      <Typography component="span" sx={{ fontSize: '0.9375rem', color: 'text.secondary', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {calories} cal
      </Typography>
      <ChevronIcon aria-hidden sx={{ fontSize: 20, color: 'text.secondary', flexShrink: 0, mr: -1 }} />
    </ButtonBase>
  );
};

export default FoodLogItem;
