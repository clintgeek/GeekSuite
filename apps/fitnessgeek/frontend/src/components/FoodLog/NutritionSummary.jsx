import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  IconButton,
  Tooltip
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
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
      color: theme.palette.success.main,
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
      color: theme.palette.info.main,
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
      color: theme.palette.warning.main,
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
      color: theme.palette.secondary.main,
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
                borderRadius: 1,
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : theme.palette.grey[50],
                border: 'none',
                position: 'relative'
              }}
            >
              {item.label === 'Calories' && onCalorieSettingsClick && (
                <Tooltip title="Calorie goal settings">
                  <IconButton
                    size="small"
                    onClick={onCalorieSettingsClick}
                    sx={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      color: theme.palette.text.disabled
                    }}
                    aria-label="calorie-goal-settings"
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
                  color: '#fff',
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
                {Math.round(item.value)}
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
                        fontSize: { xs: '0.625rem', sm: '0.75rem' }
                      }}
                    >
                      {item.isRDA ? 'RDA' : 'Goal'}: {item.goal}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: theme.palette.text.secondary,
                        fontSize: { xs: '0.625rem', sm: '0.75rem' }
                      }}
                    >
                      {Math.round(item.progress)}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={item.progress}
                    sx={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : theme.palette.grey[200],
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