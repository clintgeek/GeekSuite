import React from 'react';
import {
  Box,
  Typography,
  ListItem,
  IconButton,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { getSourceColor, getSourceName } from './FoodSourceUtils.jsx';

/**
 * FoodListItem — a clean row rendered inside the parent Surface list.
 *
 * Matches the row pattern used by MyMeals.jsx: no per-row border, no hardcoded
 * colors. Source color appears as a 6px accent dot, not an avatar. Numbers use
 * JetBrains Mono with tabular-nums.
 */
const FoodListItem = ({ food, onEdit, onDelete }) => {
  const sourceColor = getSourceColor(food.source);
  const sourceName = getSourceName(food.source);
  const nutrition = food.nutrition || {};
  const calories = Math.round(nutrition.calories_per_serving || 0);

  return (
    <ListItem
      sx={{
        px: 2.5,
        py: 1.5,
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
        '&:last-child': { borderBottom: 'none' },
      }}
      secondaryAction={
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            aria-label={`Edit ${food.name}`}
            onClick={() => onEdit(food)}
            size="small"
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            aria-label={`Delete ${food.name}`}
            onClick={() => onDelete(food)}
            color="error"
            size="small"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      }
    >
      {/* Accent dot indicating source */}
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: sourceColor,
          flexShrink: 0,
          mr: 1.75,
          alignSelf: 'center',
        }}
      />

      <Box sx={{ flex: 1, minWidth: 0, pr: 2 }}>
        {/* Name + brand */}
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '1rem',
            color: 'text.primary',
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={food.name}
        >
          {food.name}
        </Typography>

        {/* Meta row — source · calories · P/C/F (mono + dots) */}
        <Typography
          component="span"
          sx={{
            fontSize: '0.8125rem',
            color: 'text.secondary',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 0.25,
            flexWrap: 'wrap',
          }}
        >
          {food.brand && (
            <>
              <Box
                component="span"
                sx={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 160,
                }}
              >
                {food.brand}
              </Box>
              <Box component="span" sx={{ opacity: 0.5 }}>·</Box>
            </>
          )}
          <Box
            component="span"
            sx={{ color: sourceColor, fontWeight: 600, letterSpacing: '0.02em' }}
          >
            {sourceName}
          </Box>
          <Box component="span" sx={{ opacity: 0.5 }}>·</Box>
          <Box
            component="span"
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {calories} kcal
          </Box>
          <Box component="span" sx={{ opacity: 0.5 }}>·</Box>
          <Box
            component="span"
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontVariantNumeric: 'tabular-nums',
              fontSize: '0.75rem',
            }}
          >
            {Math.round(nutrition.protein_grams || 0)}P/
            {Math.round(nutrition.carbs_grams || 0)}C/
            {Math.round(nutrition.fat_grams || 0)}F
          </Box>
        </Typography>
      </Box>
    </ListItem>
  );
};

export default FoodListItem;
