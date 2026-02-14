import { Box, Typography, useTheme } from '@mui/material';

const mealTypeColors = {
  breakfast: '#f59e0b',
  lunch: '#10b981',
  dinner: '#0D9488',
  snack: '#7B61FF',
};

export default function MealCard({
  mealType = 'breakfast',
  foods = [],
  totalCalories = 0
}) {
  const theme = useTheme();
  const color = mealTypeColors[mealType] || theme.palette.text.secondary;
  const totalCaloriesDisplay = Math.round(totalCalories || 0);
  const foodCount = foods.length;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 1,
        px: 0.5,
        borderBottom: `1px solid ${theme.palette.divider}`,
        '&:last-child': { borderBottom: 'none' },
      }}
    >
      {/* Color dot */}
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: 0,
        }}
      />

      {/* Meal name */}
      <Typography
        sx={{
          fontWeight: 600,
          fontSize: '0.8125rem',
          textTransform: 'capitalize',
          color: theme.palette.text.primary,
          flex: 1,
          minWidth: 0,
        }}
      >
        {mealType}
      </Typography>

      {/* Food count */}
      {foodCount > 0 && (
        <Typography
          sx={{
            fontSize: '0.6875rem',
            color: theme.palette.text.secondary,
            flexShrink: 0,
          }}
        >
          {foodCount} {foodCount === 1 ? 'item' : 'items'}
        </Typography>
      )}

      {/* Calories */}
      <Typography
        sx={{
          fontWeight: 700,
          fontSize: '0.8125rem',
          color: totalCaloriesDisplay > 0 ? theme.palette.text.primary : theme.palette.text.disabled,
          flexShrink: 0,
          minWidth: 48,
          textAlign: 'right',
        }}
      >
        {totalCaloriesDisplay > 0 ? `${totalCaloriesDisplay}` : '--'}
        <Box
          component="span"
          sx={{ fontWeight: 400, fontSize: '0.625rem', color: theme.palette.text.secondary, ml: 0.25 }}
        >
          cal
        </Box>
      </Typography>
    </Box>
  );
}
