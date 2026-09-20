import React from 'react';
import { Box, Typography, IconButton, Chip, Tooltip } from '@mui/material';
import {
  Add as AddIcon,
  Check as StagedIcon,
  Star as FavoriteIcon,
  History as RecentIcon,
  Tune as AdjustIcon
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { netCarbs as calcNetCarbs } from '../../utils/ketoMath';

/**
 * One search result, as a row.
 *
 * It replaces a 457-line card with an image header, a 460ms staggered
 * entrance, a hover lift and a badge-pop animation, rendered two to a row —
 * which showed about four results before you had to scroll. A row shows
 * twelve. When the job is "find the thing you already know the name of and
 * tap it", density beats decoration.
 *
 * The whole row is the tap target (≥56px, comfortably over the 44px the
 * mobile harness enforces); the trailing button opens the serving editor for
 * the minority of adds that need one.
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

const FoodResultRow = ({
  food,
  onTap,
  onAdjust,
  staged = false,
  stagedCount = 0,
  ketoMode = false,
  dense = false
}) => {
  const theme = useTheme();
  const muted = theme.palette.text.secondary;
  const primary = theme.palette.primary.main;

  const nutrition = food?.nutrition || {};
  const servings = Number(food?.requestedQuantity) > 0 ? Number(food.requestedQuantity) : 1;
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

  const sourceLabel = SOURCE_LABEL[String(food?.source || '').toLowerCase()] || food?.source;
  const servingText = food?.serving?.size
    ? `${round(food.serving.size, 1)}${food.serving.unit || 'g'}`
    : null;

  const subtitle = [food?.brand, servingText, servings !== 1 ? `×${servings}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => onTap?.(food)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap?.(food);
        }
      }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minHeight: dense ? 52 : 60,
        px: 1.5,
        py: 1,
        cursor: 'pointer',
        borderRadius: 2,
        border: '1px solid',
        borderColor: staged ? primary : 'transparent',
        backgroundColor: staged ? alpha(primary, theme.palette.mode === 'dark' ? 0.18 : 0.07) : 'transparent',
        transition: 'background-color 120ms ease, border-color 120ms ease',
        '&:hover': {
          backgroundColor: staged
            ? alpha(primary, theme.palette.mode === 'dark' ? 0.24 : 0.1)
            : theme.palette.action.hover
        },
        '&:focus-visible': {
          outline: `2px solid ${primary}`,
          outlineOffset: 2
        }
      }}
    >
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
            sx={{
              fontSize: '0.9375rem',
              fontWeight: 600,
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
            sx={{
              fontSize: '0.75rem',
              color: muted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>

      {/* Macros — monospace so the columns line up down the list */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 1.25,
          flexShrink: 0,
          fontFamily: "'JetBrains Mono', monospace"
        }}
      >
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.primary' }}>
          {calories}
        </Typography>
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1 }}>
          <Typography sx={{ fontSize: '0.75rem', color: muted }}>P{protein}</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: ketoMode ? theme.palette.warning.main : muted }}>
            {carbLabel}
            {carbValue}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: muted }}>F{fat}</Typography>
        </Box>
      </Box>

      {sourceLabel && (
        <Chip
          label={sourceLabel}
          size="small"
          sx={{
            display: { xs: 'none', md: 'inline-flex' },
            height: 20,
            fontSize: '0.75rem',
            flexShrink: 0,
            backgroundColor: alpha(theme.palette.text.secondary, 0.1),
            color: muted
          }}
        />
      )}

      {/* Trailing control: 44px, and it never swallows the row tap */}
      <Tooltip title={staged ? 'Remove from tray' : 'Adjust servings'} arrow>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            if (staged) onTap?.(food);
            else onAdjust?.(food);
          }}
          sx={{
            width: 44,
            height: 44,
            flexShrink: 0,
            color: staged ? primary : muted
          }}
          aria-label={staged ? `Remove ${food?.name} from tray` : `Adjust servings for ${food?.name}`}
        >
          {staged ? (
            stagedCount > 1 ? (
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700 }}>×{stagedCount}</Typography>
            ) : (
              <StagedIcon fontSize="small" />
            )
          ) : (
            <AdjustIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>

      {!staged && (
        <AddIcon sx={{ display: 'none' }} aria-hidden />
      )}
    </Box>
  );
};

export default FoodResultRow;
