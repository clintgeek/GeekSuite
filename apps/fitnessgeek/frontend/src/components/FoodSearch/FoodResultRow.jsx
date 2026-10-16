import React from 'react';
import { Box, Typography, IconButton, Chip, Tooltip, CircularProgress, ButtonBase, Button } from '@mui/material';
import {
  Star as FavoriteIcon,
  History as RecentIcon,
  Tune as AdjustIcon,
  RestaurantMenu as MealIcon
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { netCarbs as calcNetCarbs } from '../../utils/ketoMath';
import { formatServing } from '../../utils/units.js';

/**
 * One food in the "exact food" list, as a row.
 *
 * It replaces a 457-line card with an image header, a 460ms staggered
 * entrance, a hover lift and a badge-pop animation, rendered two to a row —
 * which showed about four results before you had to scroll. A row shows
 * twelve. When the job is "find the thing you already know the name of and
 * tap it", density beats decoration.
 *
 * WHAT A TAP DOES IS ON THE ROW NOW (REVIEW_2026-10 §4.4). The row used to log
 * on a tap with nothing saying so: the "+" was `display:none` and the calorie
 * number had no unit. Each row now ends in a visible "+ Add" pill and says
 * "190 cal". The whole row is still the add (24 of Heather's 27 entries came
 * from tapping one), and the pill is part of it.
 *
 * HOW MANY, IN ONE TAP. Heather logs two eggs by tapping "Egg" twice, a
 * minute apart (§2a); she has never opened the serving sheet. So once a row's
 * add lands, its pill becomes "Make it 2" — the same size, in the same place,
 * so nothing moves — and the next tap changes that entry to two servings
 * rather than writing a second one. Then "Make it 3", and so on. A long-press
 * was the other candidate; nobody finds a long-press, and a button that says
 * what it does needs no explaining. The tune button still opens the serving
 * sheet for amounts in ounces or cups.
 *
 * The main area and the trailing buttons are siblings, not nested: a button
 * inside a button is unreachable to a screen reader (axe nested-interactive).
 *
 * `pending` is this row's own write in flight: it says "Adding…" at once,
 * because the answer can take a few seconds on a phone and a row that does
 * nothing visible gets tapped again. `disabled` is any write in flight in the
 * box — the row ignores taps until it's done (REVIEW_2026-10 B7).
 *
 * A saved meal (`kind: 'meal'` from suggest, CONTRACTS-DONE C6) is a row too,
 * with its whole-meal calories; it has no "Make it 2", because it is several
 * entries, not one.
 */

const SOURCE_LABEL = {
  usda: 'USDA',
  openfoodfacts: 'OFF',
  fatsecret: 'Brand',
  nutritionix: 'Nutritionix',
  calorieninjas: 'Estimate',
  custom: 'Yours',
  local: 'Catalog',
  meal: 'Meal',
  ai: 'AI'
};

const round = (value, places = 0) => {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const PILL_WIDTH = 84;

const FoodResultRow = ({
  food,
  onTap,
  onAdjust,
  // "Make it N": `added` is `{ servings }` for the row whose add just landed.
  added = null,
  onMore,
  ketoMode = false,
  dense = false,
  pending = false,
  disabled = false
}) => {
  const theme = useTheme();
  const muted = theme.palette.text.secondary;
  const primary = theme.palette.primary.main;
  const isMeal = food?.kind === 'meal' || food?.type === 'meal';

  const nutrition = (isMeal ? (food?.nutrition || food?.totalNutrition) : food?.nutrition) || {};
  const servings = !isMeal && Number(food?.requestedQuantity) > 0 ? Number(food.requestedQuantity) : 1;
  const calories = round((nutrition.calories_per_serving || 0) * servings);
  const protein = round((nutrition.protein_grams || 0) * servings, 1);
  const fat = round((nutrition.fat_grams || 0) * servings, 1);

  // Keto mode swaps the carb figure rather than adding a fourth number —
  // one column, labelled, so the row still reads at phone width.
  const { netCarbs, isMissingFiber } = calcNetCarbs(nutrition);
  const carbValue = ketoMode
    ? round(netCarbs * servings, 1)
    : round((nutrition.carbs_grams || 0) * servings, 1);
  const carbLabel = ketoMode ? `net${isMissingFiber ? '*' : ''}` : 'C';

  const sourceLabel = isMeal ? null : (SOURCE_LABEL[String(food?.source || '').toLowerCase()] || food?.source);
  const servingText = food?.serving?.size
    ? formatServing(food.serving.size, food.serving.unit || 'g')
    : null;

  const count = Number(food?.food_count) || (Array.isArray(food?.food_items) ? food.food_items.length : 0);
  const detail = isMeal
    ? ['Saved meal', count ? `${count} food${count === 1 ? '' : 's'}` : null]
    : [food?.brand, servingText, servings !== 1 ? `×${servings}` : null];
  const canMore = Boolean(added && onMore && !isMeal);
  const subtitle = pending
    ? 'Adding…'
    : [canMore ? 'Added ✓' : null, ...detail].filter(Boolean).join(' · ');
  const inert = disabled || pending;
  const tap = () => { if (!inert) onTap?.(food); };
  const nextCount = Math.round((Number(added?.servings) || 1) + 1);

  const pill = (
    <Box
      component="span"
      aria-hidden
      sx={{
        width: PILL_WIDTH,
        minHeight: 44,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        bgcolor: primary,
        color: theme.palette.primary.contrastText,
        fontSize: '0.9375rem',
        fontWeight: 800,
        opacity: disabled && !pending ? 0.6 : 1,
      }}
    >
      {pending ? <CircularProgress size={18} color="inherit" aria-label={`Adding ${food?.name}`} /> : '+ Add'}
    </Box>
  );

  return (
    <Box
      data-testid="food-row"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        borderRadius: 2,
        transition: 'background-color 120ms ease',
        '@media (hover: hover)': { '&:hover': { backgroundColor: theme.palette.action.hover } },
      }}
    >
      <ButtonBase
        onClick={tap}
        aria-disabled={inert || undefined}
        aria-busy={pending || undefined}
        aria-label={`${canMore ? 'Add another' : 'Add'} ${food?.name}, ${calories} cal`}
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          textAlign: 'left',
          gap: 1.5,
          minHeight: dense ? 56 : 60,
          px: 1.5,
          py: 1,
          borderRadius: 2,
          cursor: pending ? 'progress' : inert ? 'default' : 'pointer',
          '&:focus-visible': { outline: `2px solid ${primary}`, outlineOffset: 2 },
        }}
      >
        {isMeal && <MealIcon sx={{ color: primary, flexShrink: 0 }} aria-hidden />}
        {/* Name + provenance */}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {food?.shelf === 'favorite' && (
              <FavoriteIcon sx={{ fontSize: 14, color: theme.palette.warning.main, flexShrink: 0 }} />
            )}
            {food?.shelf === 'recent' && (
              <RecentIcon sx={{ fontSize: 14, color: muted, flexShrink: 0 }} />
            )}
            <Typography
              component="span"
              sx={{
                fontSize: '1rem',
                fontWeight: 700,
                color: 'text.primary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {food?.name}
            </Typography>
          </Box>
          {subtitle && (
            <Typography
              component="span"
              sx={{
                display: 'block',
                fontSize: '0.8125rem',
                color: canMore && !pending ? 'text.primary' : muted,
                fontWeight: canMore && !pending ? 700 : 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, flexShrink: 0 }}>
          <Typography component="span" sx={{ fontSize: '0.9375rem', fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap' }}>
            {calories} cal
          </Typography>
          {!isMeal && (
            <Box component="span" sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1 }}>
              <Typography component="span" sx={{ fontSize: '0.8125rem', color: muted }}>P{protein}</Typography>
              <Typography component="span" sx={{ fontSize: '0.8125rem', color: muted }}>
                {carbLabel}
                {carbValue}
              </Typography>
              <Typography component="span" sx={{ fontSize: '0.8125rem', color: muted }}>F{fat}</Typography>
            </Box>
          )}
        </Box>

        {sourceLabel && (
          <Chip
            component="span"
            label={sourceLabel}
            size="small"
            variant="outlined"
            sx={{
              display: { xs: 'none', md: 'inline-flex' },
              height: 24,
              fontSize: '0.8125rem',
              flexShrink: 0,
              color: muted,
              borderColor: theme.palette.divider,
            }}
          />
        )}

        {!canMore && pill}
      </ButtonBase>

      {canMore && (
        <Button
          variant="outlined"
          onClick={() => { if (!inert) onMore?.(food, nextCount); }}
          disabled={inert}
          aria-label={`Make it ${nextCount} ${food?.name}`}
          sx={{
            width: PILL_WIDTH,
            minWidth: PILL_WIDTH,
            minHeight: 44,
            flexShrink: 0,
            borderRadius: 999,
            borderWidth: 2,
            fontSize: '0.9375rem',
            fontWeight: 800,
            px: 1,
            whiteSpace: 'nowrap',
            '@media (hover: hover)': { '&:hover': { borderWidth: 2, bgcolor: alpha(primary, 0.08) } },
          }}
        >
          Make it {nextCount}
        </Button>
      )}

      {/* The serving sheet, for amounts in ounces or cups. Not for a meal. */}
      {!isMeal && onAdjust && (
        <Tooltip title="Change the amount" arrow>
          <span>
            <IconButton
              disabled={inert}
              onClick={() => { if (!inert) onAdjust?.(food); }}
              sx={{ width: 44, height: 44, flexShrink: 0, color: muted }}
              aria-label={`Change the amount of ${food?.name}`}
            >
              <AdjustIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Box>
  );
};

export default FoodResultRow;
