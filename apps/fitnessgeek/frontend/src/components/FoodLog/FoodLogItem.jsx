import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  Tooltip,
  Avatar
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Restaurant as FoodIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { foodService } from '../../services/foodService.js';

const SWIPE_THRESHOLD = 60;

const FoodLogItem = ({
  log,
  onEdit,
  onDelete,
  showActions = true,
  swipeEnabled = true,
  isFavorite: initialFavorite = false,
  onFavoriteChange
}) => {
  const theme = useTheme();
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

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
      console.error('Failed to toggle favorite:', error);
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
      <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: '12px' }}>
        {/* Edit action (left side, revealed on swipe right) */}
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
            opacity: translateX > 0 ? 1 : 0,
            transition: 'opacity 0.15s ease',
            cursor: 'pointer',
            zIndex: 0
          }}
        >
          <Box sx={{ textAlign: 'center', color: 'white' }}>
            <EditIcon sx={{ fontSize: 24 }} />
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, fontSize: '0.7rem' }}>
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
            backgroundColor: '#ef4444',
            opacity: translateX < 0 ? 1 : 0,
            transition: 'opacity 0.15s ease',
            cursor: 'pointer',
            zIndex: 0
          }}
        >
          <Box sx={{ textAlign: 'center', color: 'white' }}>
            <DeleteIcon sx={{ fontSize: 24 }} />
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, fontSize: '0.7rem' }}>
              Delete
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

  return (
    <SwipeWrapper>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: { xs: 1.5, sm: 2 },
          p: { xs: 2, sm: 2.5 },
          backgroundColor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: '12px',
          transition: swipeEnabled ? 'none' : 'all 0.2s ease',
          ...(!swipeEnabled && {
            '&:hover': {
              backgroundColor: theme.palette.action.hover,
              borderColor: theme.palette.divider,
              boxShadow: theme.shadows[2],
              transform: 'translateX(4px)'
            }
          })
        }}
      >
      {/* Food Icon */}
      <Avatar
        sx={{
          backgroundColor: theme.palette.primary.main,
          width: { xs: 36, sm: 40 },
          height: { xs: 36, sm: 40 },
          flexShrink: 0,
        }}
      >
        <FoodIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
      </Avatar>

      {/* Food Info */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Food Name and Brand */}
        <Box sx={{ mb: 0.5 }}>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 700,
              fontSize: { xs: '0.9375rem', sm: '1rem' },
              color: theme.palette.text.primary,
              lineHeight: 1.3
            }}
          >
            {food_item.name}
          </Typography>
        </Box>

        {/* Brand */}
        {food_item.brand && (
          <Typography
            variant="caption"
            sx={{
              color: theme.palette.text.secondary,
              fontSize: { xs: '0.8125rem', sm: '0.875rem' },
              display: 'block',
              mb: 1
            }}
          >
            {food_item.brand}
          </Typography>
        )}

        {/* Nutrition Info - Condensed on narrow screens */}
        <Box sx={{
          display: { xs: 'none', sm: 'flex' },
          gap: 0.75,
          flexWrap: 'wrap',
          alignItems: 'center',
          mb: 1
        }}>
          <Chip
            label={`${totalCalories} cal`}
            size="small"
            sx={{
              height: 24,
              borderRadius: '999px',
              backgroundColor: theme.palette.primary.main,
              color: theme.palette.primary.contrastText,
              fontWeight: 700,
              fontSize: '0.75rem',
              '& .MuiChip-label': { px: 1.5 }
            }}
          />
          <Chip
            label={`P: ${totalProtein}g`}
            size="small"
            sx={{
              height: 24,
              borderRadius: '999px',
              backgroundColor: `${theme.palette.primary.main}1a`,
              color: theme.palette.primary.main,
              fontWeight: 600,
              fontSize: '0.75rem',
              border: `1px solid ${theme.palette.primary.main}33`,
              '& .MuiChip-label': { px: 1.25 }
            }}
          />
          <Chip
            label={`C: ${totalCarbs}g`}
            size="small"
            sx={{
              height: 24,
              borderRadius: '999px',
              backgroundColor: `${theme.palette.primary.main}1a`,
              color: theme.palette.primary.main,
              fontWeight: 600,
              fontSize: '0.75rem',
              border: `1px solid ${theme.palette.primary.main}33`,
              '& .MuiChip-label': { px: 1.25 }
            }}
          />
          <Chip
            label={`F: ${totalFat}g`}
            size="small"
            sx={{
              height: 24,
              borderRadius: '999px',
              backgroundColor: `${theme.palette.primary.main}1a`,
              color: theme.palette.primary.main,
              fontWeight: 600,
              fontSize: '0.75rem',
              border: `1px solid ${theme.palette.primary.main}33`,
              '& .MuiChip-label': { px: 1.25 }
            }}
          />
        </Box>
        {/* Mobile condensed nutrition display */}
        <Box sx={{
          display: { xs: 'flex', sm: 'none' },
          gap: 0.5,
          alignItems: 'center',
          mb: 1
        }}>
          <Chip
            label={`${totalCalories} cal`}
            size="small"
            sx={{
              height: 22,
              borderRadius: '999px',
              backgroundColor: theme.palette.primary.main,
              color: theme.palette.primary.contrastText,
              fontWeight: 700,
              fontSize: '0.7rem',
              '& .MuiChip-label': { px: 1 }
            }}
          />
          <Typography
            variant="caption"
            sx={{
              color: theme.palette.text.secondary,
              fontSize: '0.7rem',
              fontWeight: 500
            }}
          >
            {totalProtein}P / {totalCarbs}C / {totalFat}F
          </Typography>
        </Box>

        {/* Serving Indicator */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={`${servingsCount} serving${servingsCount !== 1 ? 's' : ''}`}
            size="small"
            sx={{
              height: 22,
              borderRadius: '999px',
              backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : theme.palette.background.default,
              color: theme.palette.text.secondary,
              fontWeight: 600,
              fontSize: '0.75rem',
              border: `1px solid ${theme.palette.divider}`,
              '& .MuiChip-label': { px: 1.25 }
            }}
          />
        </Box>

        {/* Notes */}
        {notes && (
          <Typography
            variant="caption"
            sx={{
              color: theme.palette.text.disabled,
              fontSize: '0.8125rem',
              mt: 1,
              display: 'block',
              fontStyle: 'italic',
              pl: 1,
              borderLeft: `2px solid ${theme.palette.divider}`
            }}
          >
            {notes}
          </Typography>
        )}
      </Box>

      {/* Action Buttons */}
      {showActions && (
        <Box sx={{ display: 'flex', gap: 0.75, flexShrink: 0 }}>
          <Tooltip title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
            <IconButton
              size="small"
              onClick={handleToggleFavorite}
              disabled={favoriteLoading}
              sx={{
                color: isFavorite ? '#f59e0b' : theme.palette.text.secondary,
                backgroundColor: isFavorite ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                border: `1px solid ${isFavorite ? 'rgba(245, 158, 11, 0.3)' : theme.palette.divider}`,
                '&:hover': {
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  borderColor: 'rgba(245, 158, 11, 0.4)'
                }
              }}
            >
              {isFavorite ? <StarIcon sx={{ fontSize: 18 }} /> : <StarBorderIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton
              size="small"
              onClick={handleEdit}
              sx={{
                color: theme.palette.primary.main,
                backgroundColor: `${theme.palette.primary.main}1a`,
                border: `1px solid ${theme.palette.primary.main}33`,
                '&:hover': {
                  backgroundColor: `${theme.palette.primary.main}33`,
                  borderColor: `${theme.palette.primary.main}4d`
                }
              }}
            >
              <EditIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton
              size="small"
              onClick={handleDelete}
              sx={{
                color: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                '&:hover': {
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  borderColor: 'rgba(239, 68, 68, 0.3)'
                }
              }}
            >
              <DeleteIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
      </Box>
    </SwipeWrapper>
  );
};

export default FoodLogItem;