import React from 'react';
import {
  Box,
  Typography,
  ListItem,
  IconButton,
} from '@mui/material';
import {
  EditOutlined as EditIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { getSourceName } from './FoodSourceUtils.jsx';
import { fmt, macroLine } from '../../utils/plainWords.js';

/**
 * FoodListItem — one saved food, a row in the Saved foods list.
 *
 * The name, then one quiet line: brand or source, then the numbers
 * ("Fage · 190 cal · P 18 · C 8 · F 10 g"). The line is two groups that
 * each stay whole; when the row is too narrow for both, the numbers move to
 * a second line together, and no separator dot is left hanging at the end of
 * the first (it used to read "Blue Diamond · 164 cal ·" over "P 6 · C 6").
 *
 * No source dot: it was a grey bullet on most rows and nobody could say what
 * the colours meant. The source is named in words when it is known.
 *
 * A row with no food at all draws nothing, and a food with no name or no
 * nutrition still draws, so one bad record cannot take the page down.
 */

// A dot before every group but the first on its line: each group carries its
// dot in its own left padding, and the wrapper clips whatever falls left of
// the line's start.
const SEP = 16;
const groupSx = {
  position: 'relative',
  pl: `${SEP}px`,
  whiteSpace: 'nowrap',
  minWidth: 0,
  '&::before': { content: '"·"', position: 'absolute', left: 0, width: SEP, textAlign: 'center', opacity: 0.6 },
};

const FoodListItem = ({ food, onEdit, onDelete }) => {
  const theme = useTheme();
  if (!food || typeof food !== 'object') return null;
  const name = String(food.name || '').trim() || 'Unnamed food';
  const sourceName = getSourceName(food.source);
  const nutrition = (food.nutrition && typeof food.nutrition === 'object') ? food.nutrition : {};
  const calories = Math.round(Number(nutrition.calories_per_serving) || 0);
  const isRecipe = Boolean(food.recipe);
  const makes = Number(food.recipe?.yield_servings);
  const brand = String(food.brand || '').trim();

  return (
    <ListItem
      data-testid="saved-food-row"
      sx={{
        px: 0,
        py: 2.5,
        gap: 1,
        alignItems: 'center',
        borderBottom: (t) => `1px solid ${t.palette.divider}`,
        '&:last-child': { borderBottom: 'none' },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: '1rem',
            color: 'text.primary',
            lineHeight: 1.3,
            overflowWrap: 'anywhere',
          }}
        >
          {name}
        </Typography>

        <Box sx={{ overflow: 'hidden', mt: 0.5 }}>
          <Typography
            component="span"
            sx={{
              fontSize: '0.8125rem',
              lineHeight: 1.5,
              color: 'text.secondary',
              display: 'flex',
              flexWrap: 'wrap',
              ml: `-${SEP}px`,
            }}
          >
            {brand && (
              <Box component="span" sx={{ ...groupSx, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {brand}
              </Box>
            )}
            {/* The source in words. As coloured ink it failed contrast (grey
                #757575 on the dark theme is 3.49:1, audited 2026-10-13). */}
            {sourceName && (
              <Box component="span" sx={{ ...groupSx, fontWeight: 500 }}>{sourceName}</Box>
            )}
            {isRecipe && (
              <Box component="span" sx={groupSx}>
                <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>Recipe</Box>
                {makes > 0 && (
                  <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', ml: 1 }}>
                    makes {Math.round(makes * 100) / 100}
                  </Box>
                )}
              </Box>
            )}
            <Box component="span" sx={{ ...groupSx, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(calories)} cal
              <Box component="span" aria-hidden sx={{ opacity: 0.6, mx: '6px' }}>·</Box>
              {macroLine({ protein: nutrition.protein_grams, carbs: nutrition.carbs_grams, fat: nutrition.fat_grams }, { dense: true })}
            </Box>
          </Typography>
        </Box>
      </Box>

      {/* Outlined icons in the secondary ink; Delete turns red only under a
          finger or pointer (visual review B7). 44px targets. */}
      <Box sx={{ display: 'flex', flexShrink: 0, mr: -2 }}>
        <IconButton
          aria-label={`Edit ${name}`}
          onClick={() => onEdit?.(food)}
          sx={{ width: 44, height: 44, color: 'text.secondary' }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton
          aria-label={`Delete ${name}`}
          onClick={() => onDelete?.(food)}
          sx={{
            width: 44,
            height: 44,
            color: 'text.secondary',
            '&:hover, &:active': { color: 'error.main', bgcolor: alpha(theme.palette.error.main, 0.1) },
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
    </ListItem>
  );
};

export default FoodListItem;
