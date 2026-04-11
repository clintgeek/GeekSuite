import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  Button,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore as ExpandIcon,
  Close as RemoveIcon,
  Add as AddIcon,
  ChevronRight as ChevronIcon,
} from '@mui/icons-material';
import { useTheme, alpha, keyframes } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import { StatNumber } from '../primitives';

// ─── Meal type accent colors ───
const mealTypeColors = {
  breakfast: '#F59E0B', // amber — morning warmth
  lunch: '#10B981',     // emerald — midday fresh
  dinner: '#0D9488',    // teal — evening
  snack: '#7B61FF',     // violet — between
};

// ─── Gentle fade for removed items ───
const fadeOut = keyframes`
  to { opacity: 0; transform: translateX(12px); }
`;

/**
 * MealCard — interactive, expandable meal row for the dashboard.
 *
 * Collapsed state: meal name, item count, calorie total.
 * Expanded state: reveals each logged food with an inline remove button.
 *
 * Tapping anywhere on the row expands/collapses. The individual food rows
 * have their own remove button. The "add" link at the bottom jumps to the
 * food log for this meal.
 */
export default function MealCard({
  mealType = 'breakfast',
  foods = [],
  totalCalories = 0,
  onRemoveFood,
  expanded: controlledExpanded,
  onToggle,
  removingIds = new Set(),
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const accent = mealTypeColors[mealType] || theme.palette.primary.main;

  // Internal expanded state if not controlled
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (isControlled) {
      onToggle?.(mealType);
    } else {
      setInternalExpanded((v) => !v);
    }
  };

  const foodCount = foods.length;
  const totalCaloriesDisplay = Math.round(totalCalories || 0);
  const hasFoods = foodCount > 0;

  return (
    <Box
      sx={{
        borderBottom: `1px solid ${theme.palette.divider}`,
        '&:last-child': { borderBottom: 'none' },
      }}
    >
      {/* ─── Row header (always visible) ─── */}
      <Box
        onClick={hasFoods ? handleToggle : undefined}
        role={hasFoods ? 'button' : undefined}
        tabIndex={hasFoods ? 0 : undefined}
        aria-expanded={expanded}
        aria-label={`${mealType}: ${foodCount} items, ${totalCaloriesDisplay} calories. ${expanded ? 'Collapse' : 'Expand'}`}
        onKeyDown={(e) => {
          if (hasFoods && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handleToggle();
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          py: 1.25,
          px: 1,
          cursor: hasFoods ? 'pointer' : 'default',
          borderRadius: 1.5,
          transition: 'background-color 140ms ease',
          '&:hover': hasFoods
            ? {
                backgroundColor: alpha(accent, isDark ? 0.1 : 0.05),
              }
            : {},
          '&:focus-visible': {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: -2,
          },
        }}
      >
        {/* Accent dot — larger and more confident */}
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: accent,
            boxShadow: `0 0 0 3px ${alpha(accent, 0.2)}`,
            flexShrink: 0,
            transition: 'transform 200ms ease',
            transform: expanded ? 'scale(1.15)' : 'scale(1)',
          }}
        />

        {/* Meal name */}
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '0.875rem',
            textTransform: 'capitalize',
            color: ink,
            flex: 1,
            minWidth: 0,
          }}
        >
          {mealType}
        </Typography>

        {/* Item count */}
        {foodCount > 0 && (
          <Typography
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontVariantNumeric: 'tabular-nums',
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: muted,
              flexShrink: 0,
              letterSpacing: '0.02em',
            }}
          >
            {foodCount} {foodCount === 1 ? 'item' : 'items'}
          </Typography>
        )}

        {/* Calories */}
        <StatNumber
          value={hasFoods ? totalCaloriesDisplay : null}
          size="small"
          align="right"
          sx={{ minWidth: 64, justifyContent: 'flex-end' }}
        />

        {/* Expand indicator — only when there's content */}
        {hasFoods ? (
          <ExpandIcon
            sx={{
              fontSize: 18,
              color: muted,
              flexShrink: 0,
              transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        ) : (
          <ChevronIcon sx={{ fontSize: 18, color: 'transparent', flexShrink: 0 }} />
        )}
      </Box>

      {/* ─── Expanded details ─── */}
      <Collapse in={expanded && hasFoods} timeout={280} unmountOnExit>
        <Box
          sx={{
            pl: 3.5,
            pr: 1,
            pb: 1.5,
            pt: 0.25,
            backgroundColor: alpha(accent, isDark ? 0.05 : 0.025),
            borderLeft: `2px solid ${alpha(accent, 0.4)}`,
            ml: 1.25,
            borderRadius: '0 8px 8px 0',
          }}
        >
          {foods.map((food, idx) => {
            const isRemoving = food.logId && removingIds.has(food.logId);
            return (
              <Box
                key={food.logId || `${food.name}_${idx}`}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  alignItems: 'center',
                  gap: 1.25,
                  py: 0.75,
                  borderBottom:
                    idx < foods.length - 1
                      ? `1px dotted ${alpha(ink, 0.1)}`
                      : 'none',
                  animation: isRemoving ? `${fadeOut} 240ms forwards` : 'none',
                }}
              >
                {/* Food name + brand */}
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      color: ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.3,
                    }}
                    title={food.name}
                  >
                    {food.name}
                  </Typography>
                  {(food.brand || food.servings !== 1) && (
                    <Typography
                      sx={{
                        fontSize: '0.6875rem',
                        color: muted,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        mt: 0.125,
                      }}
                    >
                      {food.brand && <span>{food.brand}</span>}
                      {food.brand && food.servings !== 1 && <span>·</span>}
                      {food.servings !== 1 && (
                        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          ×{food.servings}
                        </span>
                      )}
                    </Typography>
                  )}
                </Box>

                {/* Calories for this item */}
                <Typography
                  sx={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: ink,
                  }}
                >
                  {food.calories}
                </Typography>

                {/* Remove button */}
                {food.logId && onRemoveFood && (
                  <Tooltip title="Remove from log" placement="left">
                    <IconButton
                      size="small"
                      aria-label={`Remove ${food.name} from log`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFood(food.logId);
                      }}
                      disabled={isRemoving}
                      sx={{
                        width: 22,
                        height: 22,
                        color: muted,
                        opacity: 0.6,
                        '&:hover': {
                          color: theme.palette.error.main,
                          backgroundColor: alpha(theme.palette.error.main, 0.1),
                          opacity: 1,
                        },
                      }}
                    >
                      <RemoveIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            );
          })}

          {/* Jump to food log for this meal type */}
          <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              component={RouterLink}
              to={`/food-log?meal=${mealType}`}
              size="small"
              startIcon={<AddIcon sx={{ fontSize: 14 }} />}
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: accent,
                minHeight: 28,
                px: 1,
                '&:hover': {
                  backgroundColor: alpha(accent, 0.1),
                },
              }}
            >
              Add more
            </Button>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
