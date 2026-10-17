import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  IconButton,
  Tooltip
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { trackColor, macroColors } from '../../theme/theme.jsx';
import { fmt } from '../../utils/plainWords.js';
import {
  LocalFireDepartment as CaloriesIcon,
  FitnessCenter as ProteinIcon,
  Grain as CarbsIcon,
  Opacity as FatIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';

// RDA values for a 2000 calorie diet
const RDA_VALUES = {
  calories: 2000,
  protein: 50, // 10% of calories (2000 * 0.1 / 4 = 50g)
  carbs: 250,  // 50% of calories (2000 * 0.5 / 4 = 250g)
  fat: 65      // 30% of calories (2000 * 0.3 / 9 = 67g, rounded to 65)
};

const NutritionSummary = ({
  summary,
  showGoals = true,
  onCalorieSettingsClick
}) => {
  const theme = useTheme();
  // Macros have their own warm ramp (visual review B2): produce colours mean
  // meals only. Calories are basil, the app's own colour.
  const macro = theme.palette.macro || macroColors(theme.palette.mode);
  const track = trackColor(theme);
  const isDark = theme.palette.mode === 'dark';

  const {
    calories = 0,
    protein = 0,
    carbs = 0,
    fat = 0,
    calorieGoal = 0,
    proteinGoal = 0,
    carbsGoal = 0,
    fatGoal = 0
  } = summary || {};

  // Use RDA values as fallback when goals are 0
  const effectiveCalorieGoal = calorieGoal > 0 ? calorieGoal : RDA_VALUES.calories;
  const effectiveProteinGoal = proteinGoal > 0 ? proteinGoal : RDA_VALUES.protein;
  const effectiveCarbsGoal = carbsGoal > 0 ? carbsGoal : RDA_VALUES.carbs;
  const effectiveFatGoal = fatGoal > 0 ? fatGoal : RDA_VALUES.fat;

  const calorieProgress = Math.min((calories / effectiveCalorieGoal) * 100, 100);
  const proteinProgress = Math.min((protein / effectiveProteinGoal) * 100, 100);
  const carbsProgress = Math.min((carbs / effectiveCarbsGoal) * 100, 100);
  const fatProgress = Math.min((fat / effectiveFatGoal) * 100, 100);

  const nutritionItems = [
    {
      label: 'Calories',
      value: calories,
      goal: effectiveCalorieGoal,
      progress: calorieProgress,
      icon: CaloriesIcon,
      color: theme.palette.primary.main,
      unit: 'cal',
      hasGoal: true, // Always show progress for calories
      isRDA: calorieGoal === 0
    },
    {
      label: 'Protein',
      value: protein,
      goal: effectiveProteinGoal,
      progress: proteinProgress,
      icon: ProteinIcon,
      color: macro.protein,
      unit: 'g',
      hasGoal: true, // Always show progress for macros
      isRDA: proteinGoal === 0
    },
    {
      label: 'Carbs',
      value: carbs,
      goal: effectiveCarbsGoal,
      progress: carbsProgress,
      icon: CarbsIcon,
      color: macro.carbs,
      unit: 'g',
      hasGoal: true, // Always show progress for macros
      isRDA: carbsGoal === 0
    },
    {
      label: 'Fat',
      value: fat,
      goal: effectiveFatGoal,
      progress: fatProgress,
      icon: FatIcon,
      color: macro.fat,
      unit: 'g',
      hasGoal: true, // Always show progress for macros
      isRDA: fatGoal === 0
    }
  ];

  return (
    <Box sx={{
      backgroundColor: theme.palette.background.paper,
      borderRadius: 2,
      p: { xs: 1.5, sm: 3 },
      boxShadow: theme.shadows[1],
      border: 'none'
    }}>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
        gap: { xs: 1, sm: 2 }
      }}>
        {nutritionItems.map((item) => {
          const IconComponent = item.icon;
          const isOverGoal = item.value > item.goal;

          return (
            <Box
              key={item.label}
              sx={{
                textAlign: 'center',
                p: { xs: 1, sm: 1.5 },
                // A nested tile: a smaller radius than its card (review B6).
                borderRadius: '16px',
                backgroundColor: isDark ? alpha(theme.palette.text.primary, 0.04) : theme.palette.background.default,
                border: 'none',
                position: 'relative'
              }}
            >
              {item.label === 'Calories' && onCalorieSettingsClick && (
                <Tooltip title="Change your daily target">
                  <IconButton
                    size="small"
                    onClick={onCalorieSettingsClick}
                    sx={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      color: theme.palette.text.secondary
                    }}
                    aria-label="Change your daily target"
                  >
                    <SettingsIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
              )}
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 1
              }}>
                <Box sx={{
                  bgcolor: item.color,
                  color: theme.palette.getContrastText(item.color),
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mr: 0.75
                }}>
                  <IconComponent sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }} />
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: theme.palette.text.secondary,
                    fontWeight: 500,
                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                  }}
                >
                  {item.label}
                </Typography>
              </Box>

              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '1rem', sm: '1.25rem' },
                  color: isOverGoal ? theme.palette.error.main : theme.palette.text.primary,
                  mb: 0.5
                }}
              >
                {fmt(item.value)}
                <Typography
                  component="span"
                  variant="caption"
                  sx={{
                    color: theme.palette.text.secondary,
                    ml: 0.5,
                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                  }}
                >
                  {item.unit}
                </Typography>
              </Typography>

              {/* Show progress for all macros, with RDA indicator */}
              {showGoals && (
                <Box sx={{ mt: 1 }}>
                  <Box sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 0.5
                  }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: theme.palette.text.secondary,
                        fontSize: '0.75rem'
                      }}
                    >
                      {item.isRDA ? 'Typical day' : 'Target'}: {fmt(item.goal)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: theme.palette.text.secondary,
                        fontSize: '0.75rem'
                      }}
                    >
                      {Math.round(item.progress)}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={item.progress}
                    aria-label={`${item.label}: ${fmt(item.value)} ${item.unit} of ${fmt(item.goal)}${item.isRDA ? ' on a typical day' : ''}`}
                    sx={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: track,
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: item.color,
                        borderRadius: 2
                      }
                    }}
                  />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default NutritionSummary;