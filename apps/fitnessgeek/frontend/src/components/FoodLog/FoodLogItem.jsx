import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  ButtonBase
} from '@mui/material';
import {
  EditOutlined as EditIcon,
  DeleteOutline as DeleteIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { mealColors } from '../../theme/theme.jsx';
import { useToast } from '@geeksuite/ui';
import { foodService } from '../../services/foodService.js';
import { errorMessage } from '../../utils/errorMessage.js';
import { netCarbs as calcNetCarbs } from '../../utils/ketoMath.js';
import { amountLabel } from './amount.js';
import { macroLine } from '../../utils/plainWords.js';
import { ListRow } from '../primitives';

const SWIPE_THRESHOLD = 60;

const FoodLogItem = ({
  log,
  onEdit,
  onDelete,
  showActions = true,
  swipeEnabled = true,
  isFavorite: initialFavorite = false,
  onFavoriteChange,
  mode = 'standard',
  // Simple (UX review L15): the name, the amount and "190 cal", and the whole
  // row opens Edit. No macro shorthand, no star/pencil/trash, no swipe —
  // Remove is inside Edit, with the usual Undo.
  simple = false,
  // The first row of a panel sits directly under the rule: no hairline above.
  first = false
}) => {
  const theme = useTheme();
  const starInk = (theme.palette.produce?.dinner || mealColors('dinner', theme.palette.mode)).text;
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const { notify } = useToast();

  // Bug this fixes: `isFavorite` used to default to false and NOTHING ever
  // passed real data in (MealSection rendered this with no favourite prop at
  // all), so every star rendered unfavourited regardless of truth and
  // tapping it always called addFavorite, never removeFavorite. The parent
  // now supplies real state (useFoodLog.js's `favoriteFoodIds`), but it can
  // arrive AFTER this component's first render — favourites load
  // asynchronously and separately from the logs themselves. `useState`'s
  // initializer only runs once, so without this effect a food that turns out
  // to be favourited would render its star unfilled forever once the initial
  // (pre-load) `false` had already been committed to state.
  useEffect(() => {
    setIsFavorite(initialFavorite);
  }, [initialFavorite]);

  // Swipe state
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontalSwipe = useRef(null);

  const food_item = log.food_item || log.food_item_id;
  const { servings, notes } = log;

  if (!food_item) {
    return null;
  }

  // Prefer the log's stored snapshot if available; fallback to the food item's base nutrition
  const nutrition = (log.nutrition && Object.keys(log.nutrition || {}).length > 0)
    ? log.nutrition
    : food_item.nutrition;
  const servingsCount = typeof servings === 'string' ? parseFloat(servings) || 1 : (servings || 1);

  const totalCalories = Math.round(nutrition.calories_per_serving * servingsCount);
  const totalProtein = Math.round(nutrition.protein_grams * servingsCount * 10) / 10;
  const totalCarbs = Math.round(nutrition.carbs_grams * servingsCount * 10) / 10;
  const totalFat = Math.round(nutrition.fat_grams * servingsCount * 10) / 10;

  const handleEditSimple = () => onEdit?.(log);

  // Keto: compute net carbs from the resolved nutrition snapshot (scaled by servings)
  const { netCarbs: rawNetCarbs, isMissingFiber } = calcNetCarbs(nutrition);
  const totalNetCarbs = Math.round(rawNetCarbs * servingsCount * 10) / 10;

  if (simple) {
    const amount = amountLabel(log);
    return (
      <ButtonBase
        onClick={handleEditSimple}
        aria-label={`Edit ${food_item.name}${amount ? `, ${amount}` : ''}, ${totalCalories.toLocaleString('en-US')} cal`}
        data-testid="food-log-row"
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          minHeight: 56,
          py: 1.25,
          textAlign: 'left',
          borderRadius: 0,
          borderTop: first ? 0 : `1px solid ${theme.palette.divider}`,
          '&:focus-visible': { outline: `3px solid ${theme.palette.text.primary}`, outlineOffset: 2 },
          '@media (hover: hover)': { '&:hover': { backgroundColor: theme.palette.action.hover } },
        }}
      >
        <Typography
          component="span"
          sx={{ flex: 1, minWidth: 0, fontSize: '1.0625rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.35, overflowWrap: 'anywhere' }}
        >
          {food_item.name}
          {amount && (
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400, ml: 0.75, whiteSpace: 'nowrap' }}>
              {amount}
            </Box>
          )}
        </Typography>
        <Typography component="span" sx={{ fontSize: '1.0625rem', fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {totalCalories.toLocaleString('en-US')} cal
        </Typography>
      </ButtonBase>
    );
  }

  const handleDelete = () => {
    if (onDelete && (log.id || log._id)) {
      onDelete(log.id || log._id);
    }
  };

  const handleEdit = () => {
    if (onEdit && log) {
      onEdit(log);
    }
  };

  const handleToggleFavorite = async () => {
    const foodId = food_item._id || food_item.id;
    if (!foodId || favoriteLoading) return;

    setFavoriteLoading(true);
    try {
      if (isFavorite) {
        await foodService.removeFavorite(foodId);
        setIsFavorite(false);
      } else {
        await foodService.addFavorite(foodId);
        setIsFavorite(true);
      }
      onFavoriteChange?.(foodId, !isFavorite);
    } catch (error) {
      // It used to fail in silence: the star just didn't change, and a second
      // tap did the same thing (left over from REVIEW_2026-10 B6).
      console.error('Failed to toggle favorite:', error);
      notify(
        errorMessage(error, isFavorite ? 'Couldn’t take that out of your favorites. Try again.' : 'Couldn’t add that to your favorites. Try again.'),
        { tone: 'error' }
      );
    } finally {
      setFavoriteLoading(false);
    }
  };

  // Swipe handlers
  const handleTouchStart = (e) => {
    if (!swipeEnabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging || !swipeEnabled) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - startX.current;
    const diffY = currentY - startY.current;

    // Determine swipe direction on first significant movement
    if (isHorizontalSwipe.current === null && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
      isHorizontalSwipe.current = Math.abs(diffX) > Math.abs(diffY);
    }

    // Only handle horizontal swipes
    if (isHorizontalSwipe.current) {
      e.preventDefault();
      const bounded = Math.max(-100, Math.min(100, diffX));
      setTranslateX(bounded);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging || !swipeEnabled) return;
    setIsDragging(false);
    isHorizontalSwipe.current = null;

    if (translateX < -SWIPE_THRESHOLD) {
      // Swiped left - trigger delete
      setTranslateX(-100);
    } else if (translateX > SWIPE_THRESHOLD) {
      // Swiped right - trigger edit
      setTranslateX(100);
    } else {
      setTranslateX(0);
    }
  };

  const handleSwipeAction = (action) => {
    setTranslateX(0);
    setTimeout(() => {
      if (action === 'delete') handleDelete();
      if (action === 'edit') handleEdit();
    }, 150);
  };

  const resetSwipe = () => {
    if (translateX !== 0) {
      setTranslateX(0);
    }
  };

  // Wrapper for swipe functionality
  const SwipeWrapper = ({ children }) => {
    if (!swipeEnabled) return children;

    return (
      <Box sx={{ position: 'relative', overflow: 'hidden' }}>
        {/* Edit action (left side, revealed on swipe right).
            This box (and its Delete sibling below) sits at rest with
            opacity 0 but was still IN the layout and still absolutely
            positioned over the real content, with no `pointer-events: none`
            to say otherwise. z-index put the real Edit/Delete buttons above
            it for a human's pointer, but this box shares the same icon (and
            so the same MUI `data-testid="EditIcon"`) and comes first in DOM
            order — so `page.locator('[data-testid="EditIcon"]').first()`
            (the mobile harness's 26-edit-log-dialog scene) always resolved
            to this invisible, non-swiped copy, whose own click handler only
            does anything once a real swipe has actually revealed it. Gating
            pointer-events on the same condition as its visibility closes
            that: at rest it's genuinely inert, and it still intercepts (and
            fires) exactly as before once a swipe reveals it. */}
        <Box
          onClick={() => handleSwipeAction('edit')}
          sx={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            opacity: translateX > 0 ? 1 : 0,
            pointerEvents: translateX > 0 ? 'auto' : 'none',
            transition: 'opacity 0.15s ease',
            cursor: 'pointer',
            zIndex: 0
          }}
        >
          <Box sx={{ textAlign: 'center', color: 'inherit' }}>
            <EditIcon sx={{ fontSize: 24 }} />
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, fontSize: '0.75rem' }}>
              Edit
            </Typography>
          </Box>
        </Box>

        {/* Delete action (right side, revealed on swipe left) */}
        <Box
          onClick={() => handleSwipeAction('delete')}
          sx={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.palette.error.main,
            color: theme.palette.error.contrastText,
            opacity: translateX < 0 ? 1 : 0,
            pointerEvents: translateX < 0 ? 'auto' : 'none',
            transition: 'opacity 0.15s ease',
            cursor: 'pointer',
            zIndex: 0
          }}
        >
          <Box sx={{ textAlign: 'center', color: 'inherit' }}>
            <DeleteIcon sx={{ fontSize: 24 }} />
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, fontSize: '0.75rem' }}>
              Remove
            </Typography>
          </Box>
        </Box>

        {/* Main content */}
        <Box
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={translateX !== 0 ? resetSwipe : undefined}
          sx={{
            transform: `translateX(${translateX}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease',
            position: 'relative',
            zIndex: 1
          }}
        >
          {children}
        </Box>
      </Box>
    );
  };

  const dense = macroLine({ protein: totalProtein, carbs: totalCarbs, fat: totalFat }, { dense: true });
  const full = `Protein ${totalProtein} g · Carbs ${totalCarbs} g · Fat ${totalFat} g`;
  const servingWords = servingsCount === 1 ? '1 serving' : `×${servingsCount}`;
  const macroSx = { color: theme.palette.text.secondary, fontSize: '0.875rem', whiteSpace: 'nowrap' };

  return (
    <SwipeWrapper>
      <ListRow
        first={first}
        sx={{
          alignItems: 'flex-start',
          // Phones: the three actions drop to their own line under the text
          // (they were squeezing the macro line into an orphaned "g").
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
          columnGap: { xs: 1.5, sm: 2 },
          rowGap: { xs: 0.25, sm: 0 },
          backgroundColor: theme.palette.background.paper,
        }}
      >
      {/* Food Info: name bold, amount beside it, macros as one muted line */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{ fontSize: '1rem', color: 'text.primary', lineHeight: 1.3, overflowWrap: 'anywhere' }}
        >
          <Box component="span" sx={{ fontWeight: 700 }}>{food_item.name}</Box>
          <Box component="span" sx={{ color: 'text.secondary', ml: 0.75, whiteSpace: 'nowrap' }}>{servingWords}</Box>
        </Typography>

        {food_item.brand && (
          <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', lineHeight: 1.3 }}>
            {food_item.brand}
          </Typography>
        )}

        <Typography component="div" sx={{ mt: 0.25, lineHeight: 1.4 }}>
          <Box component="span" sx={{ ...macroSx, display: { xs: 'inline', sm: 'none' } }}>{dense}</Box>
          <Box component="span" sx={{ ...macroSx, display: { xs: 'none', sm: 'inline' } }}>{full}</Box>
          {mode === 'keto' && (
            <Box component="span" sx={{ ...macroSx, fontWeight: 700, color: 'text.primary' }}>
              {' '}· {totalNetCarbs} g net carbs{isMissingFiber ? '*' : ''}
            </Box>
          )}
        </Typography>

        {notes && (
          <Typography
            sx={{
              color: theme.palette.text.secondary,
              fontSize: '0.8125rem',
              mt: 0.5,
              fontStyle: 'italic',
              pl: 1,
              borderLeft: `2px solid ${theme.palette.divider}`
            }}
          >
            {notes}
          </Typography>
        )}
      </Box>

      <Typography component="span" sx={{ fontSize: '1.0625rem', fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1.3 }}>
        {totalCalories.toLocaleString('en-US')} cal
      </Typography>

      {/* Action Buttons */}
      {showActions && (
        <Box sx={{
          display: 'flex',
          gap: 0.75,
          flexShrink: 0,
          // Phones: own line, right-aligned, 44px targets.
          flexBasis: { xs: '100%', sm: 'auto' },
          justifyContent: { xs: 'flex-end', sm: 'flex-start' },
          // Phones only. No reset from sm up: a zero there overrode the theme's
          // 44px touch floor on a landscape tablet.
          '@media (max-width:599.95px)': { '& .MuiIconButton-root': { minWidth: 44, minHeight: 44 } }
        }}>
          {/* One outlined icon set in the secondary ink (visual review B7).
              A favourite's star is lemon's deep ink (5.49:1), and Remove
              turns error red only under a finger or pointer, not at rest. */}
          <Tooltip title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
            <IconButton
              size="small"
              onClick={handleToggleFavorite}
              disabled={favoriteLoading}
              sx={{
                color: isFavorite ? starInk : theme.palette.text.secondary,
                '&:hover': { backgroundColor: alpha(starInk, 0.1) }
              }}
            >
              {isFavorite ? <StarIcon sx={{ fontSize: 20 }} /> : <StarBorderIcon sx={{ fontSize: 20 }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton
              size="small"
              onClick={handleEdit}
              sx={{
                color: theme.palette.text.secondary,
                '&:hover': { backgroundColor: theme.palette.action.hover }
              }}
            >
              <EditIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Remove">
            <IconButton
              size="small"
              onClick={handleDelete}
              sx={{
                color: theme.palette.text.secondary,
                '&:hover, &:active': {
                  color: theme.palette.error.main,
                  backgroundColor: alpha(theme.palette.error.main, 0.1)
                }
              }}
            >
              <DeleteIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
      </ListRow>
    </SwipeWrapper>
  );
};

export default FoodLogItem;