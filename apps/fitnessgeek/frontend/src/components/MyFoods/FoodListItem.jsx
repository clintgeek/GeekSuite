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
import { fmt } from '../../utils/plainWords.js';
import { displayName } from '../FoodSearch/entries.js';

/**
 * FoodListItem — one saved food, a row in the Saved foods list.
 *
 * The name, then one quiet line that leads with the calories: "190 cal ·
 * Fage". The protein, carbs and fat are in the edit view, one tap away; the
 * row used to end in "P 18 · C 8 · F 10 g", which a new person could not read
 * (review 2026-11-27). Each group on the line stays whole when it wraps, and
 * no separator dot is left hanging at the end of a line.
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
  const name = displayName(String(food.name || '').trim()) || 'Unnamed food';
  const sourceName = getSourceName(food.source);
  const nutrition = (food.nutrition && typeof food.nutrition === 'object') ? food.nutrition : {};
  const calories = Math.round(Number(nutrition.calories_per_serving) || 0);
  const isRecipe = Boolean(food.recipe);
  const makes = Number(food.recipe?.yield_servings);
  const brand = displayName(String(food.brand || '').trim());

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
              fontSize: '0.875rem',
              lineHeight: 1.5,
              color: 'text.secondary',
              display: 'flex',
              flexWrap: 'wrap',
              ml: `-${SEP}px`,
            }}
          >
            <Box component="span" data-testid="saved-food-calories" sx={{ ...groupSx, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'text.primary' }}>
              {fmt(calories)} cal
            </Box>
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
