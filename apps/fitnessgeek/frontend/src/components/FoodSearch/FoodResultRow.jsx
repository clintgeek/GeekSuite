import React from 'react';
import { Box, Typography, Chip, CircularProgress, ButtonBase, Button } from '@mui/material';
import {
  Star as FavoriteIcon,
  History as RecentIcon,
  Tune as AdjustIcon,
  RestaurantMenu as MealIcon,
  Check as CheckIcon
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { netCarbs as calcNetCarbs } from '../../utils/ketoMath';
import { formatServing } from '../../utils/units.js';
import { fmt, grams } from '../../utils/plainWords.js';

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
 * A SECOND TAP ON THE ROW IS ANOTHER ONE, NOT ANOTHER ENTRY (L2). Her habit is
 * to tap the row again, not the pill; that used to write a second entry and
 * then offer "Make it 2" on it — three eggs. Now the composer adds a serving
 * to the entry already written, and the subtitle counts: "2 added ✓", with
 * the pill offering "Make it 3".
 *
 * LONG NAMES WRAP (L13, A4). Real OpenFoodFacts names are long and the end is
 * the part that tells them apart ("Fage Total 0% Greek…" vs "2%"), so the
 * name gets two lines on a phone and "190 cal" moves into the subtitle there
 * ("Fage · 6 oz · 190 cal"). Between a phone and a wide desktop the macros
 * go into the subtitle too, instead of crowding the name.
 *
 * The amount button says "Amount" (L14): a tooltip doesn't exist on a touch
 * screen, and an unlabelled sliders icon said nothing.
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
  openfoodfacts: 'Open Food Facts',
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
  // `added` is `{ servings }` once this row's food is in the log this sitting:
  // the subtitle counts, and the pill becomes "Make it N".
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
  const tonal = theme.palette.tonal || { bg: alpha(primary, 0.12), ink: primary };
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
  const isAdded = Boolean(added && !isMeal);
  const canMore = Boolean(isAdded && onMore);
  const addedCount = Math.round((Number(added?.servings) || 1) * 100) / 100;
  // "Added" / "2 added", with a drawn check rather than a ✓ glyph (C11).
  const addedWords = addedCount > 1 ? `${addedCount} added` : 'Added';
  const detailText = detail.filter(Boolean).join(' · ');
  const subtitle = pending
    ? 'Adding…'
    : (
      <>
        {isAdded && (
          <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
            {addedWords}
            <CheckIcon aria-hidden sx={{ fontSize: 18, ml: 0.25, verticalAlign: '-0.2em', color: primary }} />
          </Box>
        )}
        {isAdded && detailText ? ' · ' : ''}
        {detailText}
      </>
    );
  const hasSubtitle = pending || isAdded || Boolean(detailText);
  const inert = disabled || pending;
  const tap = () => { if (!inert) onTap?.(food); };
  const nextCount = Math.round(addedCount + 1);
  // Full's dense row form (review U-4): "P 18 · C 8 · F 10 g", whole grams.
  const macros = isMeal ? null : `P ${grams(protein)} · ${carbLabel} ${grams(carbValue)} · F ${grams(fat)} g`;

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
        // Tonal, not filled (visual review B1): eight filled basil pills
        // drowned Log it. One filled basil per view.
        bgcolor: tonal.bg,
        color: tonal.ink,
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
        aria-label={`${isAdded ? 'Add another' : 'Add'} ${food?.name}, ${fmt(calories)} cal`}
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
              <FavoriteIcon sx={{ fontSize: 14, color: theme.palette.produce?.dinner?.text || theme.palette.warning.main, flexShrink: 0 }} />
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
                lineHeight: 1.3,
                overflow: 'hidden',
                overflowWrap: 'anywhere',
                // Two lines on a phone, where the end of the name is the part
                // that matters; one is plenty on a wide screen.
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: { xs: 2, lg: 1 },
                whiteSpace: 'normal'
              }}
            >
              {food?.name}
            </Typography>
          </Box>
          <Typography
            component="span"
            data-testid="food-row-subtitle"
            sx={{
              display: 'block',
              fontSize: '0.875rem',
              lineHeight: 1.35,
              color: isAdded && !pending ? 'text.primary' : muted,
              fontWeight: isAdded && !pending ? 700 : 400,
            }}
          >
            {subtitle}
            {/* Phone: the calories live here, beside the brand and serving. */}
            {!pending && (
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                {hasSubtitle ? ' · ' : ''}{fmt(calories)} cal
              </Box>
            )}
            {/* Tablet and narrow desktop: the macros, rather than a column. */}
            {!pending && macros && (
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline', lg: 'none' } }}>
                {hasSubtitle ? ' · ' : ''}{macros}
              </Box>
            )}
          </Typography>
        </Box>

        <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'baseline', gap: 1.25, flexShrink: 0 }}>
          <Typography component="span" sx={{ fontSize: '0.9375rem', fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap' }}>
            {fmt(calories)} cal
          </Typography>
          {!isMeal && (
            <Box component="span" sx={{ display: { xs: 'none', lg: 'flex' }, gap: 1 }}>
              <Typography component="span" sx={{ fontSize: '0.8125rem', color: muted, whiteSpace: 'nowrap' }}>{macros}</Typography>
            </Box>
          )}
        </Box>

        {sourceLabel && (
          <Chip
            component="span"
            label={sourceLabel}
            size="small"
            // An info tag, not an action (visual review B5).
            variant="tag"
            sx={{
              display: { xs: 'none', md: 'inline-flex' },
              flexShrink: 0,
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
        <ButtonBase
          disabled={inert}
          onClick={() => { if (!inert) onAdjust?.(food); }}
          aria-label={`Change the amount of ${food?.name}`}
          data-testid="amount-button"
          sx={{
            width: 60,
            minHeight: 48,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.25,
            borderRadius: 2,
            color: theme.palette.text.secondary,
            opacity: inert ? 0.6 : 1,
            '&:focus-visible': { outline: `2px solid ${primary}`, outlineOffset: 2 },
            '@media (hover: hover)': { '&:hover': { bgcolor: theme.palette.action.hover } },
          }}
        >
          <AdjustIcon fontSize="small" aria-hidden />
          <Box component="span" aria-hidden sx={{ fontSize: '0.8125rem', fontWeight: 700, lineHeight: 1.1 }}>
            Amount
          </Box>
        </ButtonBase>
      )}
    </Box>
  );
};

export default FoodResultRow;
