import React from 'react';
import { Box, Typography, Chip, CircularProgress, ButtonBase } from '@mui/material';
import {
  Star as FavoriteIcon,
  History as RecentIcon,
  RestaurantMenu as MealIcon,
  Check as CheckIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { netCarbs as calcNetCarbs } from '../../utils/ketoMath';
import { formatServing } from '../../utils/units.js';
import { fmt, grams } from '../../utils/plainWords.js';
import { displayName } from './entries.js';


/** A row wide enough for a one-line name and a macro column (B4). */
const WIDE_ROW = '@container (min-width: 800px)';
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
 * ONE ACTION PER ROW (review 2026-11-27). A row used to end in "+ Add" AND a
 * sliders icon labelled "Amount": two things to choose between before
 * anything was logged, and the reviewer could not say what the second did.
 * Now a row is one tap that adds one serving — the fastest path, and the one
 * Heather uses. Once it is added, the same corner says "Amount" instead of
 * "+ Add": that opens the serving sheet on the entry just written (servings,
 * ounces, cups, another meal) and CHANGES it. "Make it 2" as a separate pill
 * is gone with it: a second tap on the row is still one more serving, and
 * Amount has the stepper. The calories sit above that word, right-aligned,
 * at every width, so the name keeps the rest of the row.
 *
 * (The notes above about a "+ Add pill", "Make it 2" and a tune button
 * describe what this replaced.)
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

const SIDE_WIDTH = 76;

const FoodResultRow = ({
  food,
  onTap,
  onAdjust,
  // `added` is `{ servings }` once this row's food is in the log this sitting:
  // the subtitle counts, and the corner offers "Amount".
  added = null,
  ketoMode = false,
  dense = false,
  pending = false,
  disabled = false
}) => {
  const theme = useTheme();
  const muted = theme.palette.text.secondary;
  const primary = theme.palette.primary.main;
  const isMeal = food?.kind === 'meal' || food?.type === 'meal';
  const name = displayName(food?.name);

  const nutrition = (isMeal ? (food?.nutrition || food?.totalNutrition) : food?.nutrition) || {};
  const servings = !isMeal && Number(food?.requestedQuantity) > 0 ? Number(food.requestedQuantity) : 1;
  const calories = round((nutrition.calories_per_serving || 0) * servings);
  const protein = round((nutrition.protein_grams || 0) * servings, 1);
  const fat = round((nutrition.fat_grams || 0) * servings, 1);

  // Keto mode swaps the carb figure rather than adding a fourth number.
  const { netCarbs, isMissingFiber } = calcNetCarbs(nutrition);
  const carbValue = ketoMode
    ? round(netCarbs * servings, 1)
    : round((nutrition.carbs_grams || 0) * servings, 1);
  const carbLabel = ketoMode ? `Net carbs${isMissingFiber ? '*' : ''}` : 'Carbs';

  const sourceLabel = isMeal ? null : (SOURCE_LABEL[String(food?.source || '').toLowerCase()] || food?.source);
  const servingText = food?.serving?.size
    ? formatServing(food.serving.size, food.serving.unit || 'g')
    : null;

  const count = Number(food?.food_count) || (Array.isArray(food?.food_items) ? food.food_items.length : 0);
  const detail = isMeal
    ? ['Saved meal', count ? `${count} food${count === 1 ? '' : 's'}` : null]
    : [displayName(food?.brand), servingText, servings !== 1 ? `×${servings}` : null];
  const isAdded = Boolean(added && !isMeal);
  const canAdjust = Boolean(isAdded && onAdjust);
  const addedCount = Math.round((Number(added?.servings) || 1) * 100) / 100;
  // "Added" / "2 added", with a drawn check rather than a ✓ glyph (C11).
  const addedWords = addedCount !== 1 ? `${addedCount} added` : 'Added';
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
  // Labelled, never "P 18 · C 8 · F 10 g" (shared decision 2026-11-27).
  const macros = isMeal ? null : `Protein ${grams(protein)}g · ${carbLabel} ${grams(carbValue)}g · Fat ${grams(fat)}g`;

  // The row's right-hand corner: the calories over the one word that says
  // what a tap here does. The same box before and after an add, so nothing
  // moves under the finger.
  const side = (word) => (
    <Box
      component="span"
      sx={{
        width: SIDE_WIDTH,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 0.25,
        textAlign: 'right',
        opacity: disabled && !pending ? 0.6 : 1,
      }}
    >
      <Box component="span" data-testid="food-row-calories" sx={{ fontSize: '0.9375rem', fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
        {fmt(calories)} cal
      </Box>
      <Box component="span" aria-hidden sx={{ color: primary, fontSize: '0.875rem', fontWeight: 700, lineHeight: 1.3, minHeight: '1.3em', whiteSpace: 'nowrap' }}>
        {word}
      </Box>
    </Box>
  );

  return (
    <Box
      data-testid="food-row"
      sx={{
        // The wide layout follows the ROW's width, not the window's (UX review
        // 2026-11, B4): inside the 600 px add dialog on a 1280 px screen the
        // window said "wide" and names were cut to one word ("Breaded…").
        containerType: 'inline-size',
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: `1px solid ${theme.palette.divider}`,
        transition: 'background-color 120ms ease',
        '@media (hover: hover)': { '&:hover': { backgroundColor: theme.palette.action.hover } },
      }}
    >
      <ButtonBase
        onClick={tap}
        aria-disabled={inert || undefined}
        aria-busy={pending || undefined}
        aria-label={`${isAdded ? 'Add another' : 'Add'} ${name}, ${fmt(calories)} cal`}
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          textAlign: 'left',
          gap: 1.5,
          minHeight: dense ? 56 : 60,
          pl: 1.5,
          pr: canAdjust ? 0.5 : 1.5,
          py: 1.5,
          borderRadius: '12px',
          cursor: pending ? 'progress' : inert ? 'default' : 'pointer',
          '&:focus-visible': { outline: `2px solid ${primary}`, outlineOffset: -2 },
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
                // Two lines, where the end of the name is the part that
                // matters; one only when the row itself is wide.
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                [WIDE_ROW]: { WebkitLineClamp: 1 },
                whiteSpace: 'normal'
              }}
            >
              {name}
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
            {/* Tablet and narrow desktop: the macros, rather than a column. */}
            {!pending && macros && (
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontWeight: 400, color: muted, [WIDE_ROW]: { display: 'none' } }}>
                {hasSubtitle ? ' · ' : ''}{macros}
              </Box>
            )}
          </Typography>
        </Box>

        {!isMeal && (
          <Typography component="span" sx={{ display: 'none', [WIDE_ROW]: { display: 'block' }, flexShrink: 0, fontSize: '0.8125rem', color: muted, whiteSpace: 'nowrap' }}>
            {macros}
          </Typography>
        )}

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

        {!canAdjust && side(pending
          ? <CircularProgress size={16} color="inherit" aria-label={`Adding ${name}`} />
          : isAdded ? '' : '+ Add')}
      </ButtonBase>

      {/* Once it is in the log: the serving sheet, on that entry. */}
      {canAdjust && (
        <ButtonBase
          disabled={inert}
          onClick={() => { if (!inert) onAdjust?.(food); }}
          aria-label={`Change the amount of ${name}`}
          data-testid="amount-button"
          sx={{
            flexShrink: 0,
            minHeight: 48,
            pl: 1,
            pr: 1.5,
            borderRadius: '12px',
            '&:focus-visible': { outline: `2px solid ${primary}`, outlineOffset: -2 },
            '@media (hover: hover)': { '&:hover': { bgcolor: theme.palette.action.hover } },
          }}
        >
          {side(pending ? <CircularProgress size={16} color="inherit" aria-hidden /> : 'Amount')}
        </ButtonBase>
      )}
    </Box>
  );
};

export default FoodResultRow;
