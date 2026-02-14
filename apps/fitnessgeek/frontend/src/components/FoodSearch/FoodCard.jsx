import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Checkbox
} from '@mui/material';
import {
  Add as AddIcon,
  Restaurant as FoodIcon
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';

const getSourceName = (source) => {
  switch (source?.toLowerCase()) {
    case 'usda':
      return 'USDA';
    case 'nutritionix':
      return 'Nutritionix';
    case 'openfoodfacts':
      return 'Open Food Facts';
    case 'custom':
      return 'My Foods';
    case 'meal':
      return 'Saved Meal';
    default:
      return source || 'Unknown';
  }
};

const getSourceColor = (source) => {
  switch (source?.toLowerCase()) {
    case 'usda':
      return '#10b981'; // Green
    case 'nutritionix':
      return '#3b82f6'; // Blue
    case 'openfoodfacts':
      return '#f59e0b'; // Amber
    case 'custom':
      return '#0D9488'; // Teal
    case 'meal':
      return '#8b5cf6'; // Purple
    default:
      return '#78716C'; // Stone
  }
};

const FoodCard = ({
  food,
  onClick,
  onQuickAdd,
  showQuickAdd = false,
  compact = false,
  selectable = false,
  selected = false,
  onSelectToggle
}) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const secondary = theme.palette.text.secondary;
  const baseBorder = theme.palette.divider;
  const selectedBorder = primary;
  const baseBg = theme.palette.background.paper;
  const selectedBg = alpha(primary, theme.palette.mode === 'dark' ? 0.25 : 0.08);

  const handleClick = (e) => {
    // Don't trigger card click if quick add button was clicked
    if (e.target.closest('.quick-add-button')) {
      return;
    }
    onClick?.(food);
  };

  const handleQuickAdd = (e) => {
    e.stopPropagation();
    onQuickAdd?.(food);
  };

  const handleSelectToggle = (e) => {
    e.stopPropagation();
    onSelectToggle?.(food);
  };

  const nutrition = food.nutrition || {};
  const calories = Math.round(nutrition.calories_per_serving || 0);
  const protein = nutrition.protein_grams || 0;
  const carbs = nutrition.carbs_grams || 0;
  const fat = nutrition.fat_grams || 0;

  return (
    <Card
      onClick={handleClick}
      sx={{
        borderRadius: '16px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        border: '1px solid',
        borderColor: selected ? selectedBorder : baseBorder,
        backgroundColor: selected ? selectedBg : baseBg,
        position: 'relative',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: theme.shadows[6],
          borderColor: selectedBorder,
          '& .quick-add-button': {
            opacity: 1,
            transform: 'scale(1)'
          }
        }
      }}
    >
      {selectable && (
        <Checkbox
          checked={selected}
          onChange={handleSelectToggle}
          onClick={(e) => e.stopPropagation()}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            color: primary,
            '&.Mui-checked': {
              color: primary
            }
          }}
        />
      )}
      {/* Food Image (if available) */}
      {food.image && !compact && (
        <Box
          sx={{
            height: 120,
            background: `linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 100%), url(${food.image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            position: 'relative'
          }}
        >
          {/* Source badge on image */}
          <Chip
            label={getSourceName(food.source)}
            size="small"
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: alpha(theme.palette.background.paper, 0.95),
              backdropFilter: 'blur(8px)',
              fontWeight: 600,
              fontSize: '0.75rem',
              height: 24,
              borderRadius: '12px',
              color: getSourceColor(food.source)
            }}
          />
        </Box>
      )}

      <CardContent sx={{ p: compact ? 2 : 2.5, position: 'relative' }}>
        {/* Quick Add Button */}
        {showQuickAdd && (
          <IconButton
            className="quick-add-button"
            onClick={handleQuickAdd}
            sx={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 36,
              height: 36,
              background: `linear-gradient(135deg, ${primary}, ${theme.palette.primary.dark})`,
              color: theme.palette.primary.contrastText,
              opacity: 0,
              transform: 'scale(0.8)',
              transition: 'all 0.2s ease',
              boxShadow: `0 4px 12px ${alpha(primary, 0.35)}`,
              '&:hover': {
                background: `linear-gradient(135deg, ${theme.palette.primary.dark}, ${alpha(theme.palette.primary.dark, 0.9)})`,
                boxShadow: `0 6px 16px ${alpha(primary, 0.45)}`,
                transform: 'scale(1.05)'
              }
            }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        )}

        {/* Food Name & Brand */}
        <Box sx={{ mb: 1.5, pr: showQuickAdd ? 5 : 0 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              fontSize: compact ? '0.9375rem' : '1rem',
              mb: 0.5,
              color: theme.palette.text.primary,
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {food.name}
          </Typography>
          {food.brand && (
            <Typography
              variant="caption"
              sx={{
                color: secondary,
                fontSize: '0.8125rem',
                display: 'block'
              }}
            >
              {food.brand}
            </Typography>
          )}
        </Box>

        {/* Nutrition Badges - Full display on larger screens */}
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
          <Chip
            label={`${calories} cal`}
            size="small"
            sx={{
              borderRadius: '999px',
              background: `linear-gradient(135deg, ${primary}, ${theme.palette.primary.dark})`,
              color: theme.palette.primary.contrastText,
              fontWeight: 700,
              fontSize: '0.75rem',
              height: 24,
              '& .MuiChip-label': {
                px: 1.5
              }
            }}
          />
          <Chip
            label={`P: ${protein}g`}
            size="small"
            sx={{
              borderRadius: '999px',
              backgroundColor: alpha(primary, 0.12),
              color: theme.palette.primary.dark,
              fontWeight: 600,
              fontSize: '0.75rem',
              height: 24,
              border: `1px solid ${alpha(primary, 0.25)}`
            }}
          />
          <Chip
            label={`C: ${carbs}g`}
            size="small"
            sx={{
              borderRadius: '999px',
              backgroundColor: 'rgba(13, 148, 136, 0.1)',
              color: 'primary.main',
              fontWeight: 600,
              fontSize: '0.75rem',
              height: 24,
              border: '1px solid rgba(6, 182, 212, 0.2)'
            }}
          />
          <Chip
            label={`F: ${fat}g`}
            size="small"
            sx={{
              borderRadius: '999px',
              backgroundColor: 'rgba(13, 148, 136, 0.1)',
              color: 'primary.main',
              fontWeight: 600,
              fontSize: '0.75rem',
              height: 24,
              border: '1px solid rgba(6, 182, 212, 0.2)'
            }}
          />
        </Box>
        {/* Condensed nutrition display on mobile */}
        <Box sx={{ display: { xs: 'flex', sm: 'none' }, gap: 0.5, alignItems: 'center', mb: 1 }}>
          <Chip
            label={`${calories} cal`}
            size="small"
            sx={{
              borderRadius: '999px',
              background: `linear-gradient(135deg, ${primary}, ${theme.palette.primary.dark})`,
              color: theme.palette.primary.contrastText,
              fontWeight: 700,
              fontSize: '0.7rem',
              height: 22,
              '& .MuiChip-label': { px: 1 }
            }}
          />
          <Typography
            variant="caption"
            sx={{
              color: secondary,
              fontSize: '0.7rem',
              fontWeight: 500
            }}
          >
            {Math.round(protein)}P / {Math.round(carbs)}C / {Math.round(fat)}F
          </Typography>
        </Box>

        {/* Source Badge (if no image) */}
        {!food.image && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={getSourceName(food.source)}
              size="small"
              sx={{
                borderRadius: '999px',
                backgroundColor: alpha(theme.palette.text.secondary, 0.12),
                color: getSourceColor(food.source),
                fontWeight: 600,
                fontSize: '0.6875rem',
                height: 20,
                '& .MuiChip-label': {
                  px: 1
                }
              }}
            />
            {food.type === 'meal' && (
              <Chip
                icon={<FoodIcon sx={{ fontSize: 14 }} />}
                label="Meal"
                size="small"
                sx={{
                  borderRadius: '999px',
                  backgroundColor: alpha('#8b5cf6', 0.15),
                  color: '#8b5cf6',
                  fontWeight: 600,
                  fontSize: '0.6875rem',
                  height: 20,
                  '& .MuiChip-label': {
                    px: 1
                  },
                  '& .MuiChip-icon': {
                    ml: 0.5
                  }
                }}
              />
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default FoodCard;
