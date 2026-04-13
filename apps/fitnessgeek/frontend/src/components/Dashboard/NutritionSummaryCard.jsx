import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Fade,
  Grid
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { RestaurantMenu as NutritionIcon } from '@mui/icons-material';

const NutritionSummaryCard = ({
  protein = 0,
  carbs = 0,
  fat = 0,
  title = "Today's Nutrition",
  timeout = 700,
  // Keto mode props
  mode = 'standard',
  netCarbsConsumed = 0,
  netCarbLimit = 20,
  hasMissingFiber = false,
  ...props
}) => {
  const theme = useTheme();

  // Standard macro layout: Protein | Carbs | Fat
  // Keto macro layout:    Fat | Protein | Net Carbs
  const macros = mode === 'keto'
    ? [
        { label: 'Fat',      value: fat,              color: theme.palette.error.main   },
        { label: 'Protein',  value: protein,           color: theme.palette.success.main },
        {
          label: `Net Carbs${hasMissingFiber ? '*' : ''}`,
          value: netCarbsConsumed,
          color: theme.palette.warning.main,
          subLabel: `/ ${netCarbLimit}g limit`,
        },
      ]
    : [
        { label: 'Protein', value: protein, color: theme.palette.success.main },
        { label: 'Carbs',   value: carbs,   color: theme.palette.warning.main },
        { label: 'Fat',     value: fat,     color: theme.palette.error.main   },
      ];

  return (
    <Fade in timeout={timeout}>
      <Card sx={{
        width: '100%',
        backgroundColor: theme.palette.background.paper,
        borderRadius: 2,
        p: { xs: 2, sm: 3 },
        boxShadow: theme.shadows[1]
      }}>
        <CardContent sx={{ p: 3 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              mb: 3,
              color: theme.palette.text.primary,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            <NutritionIcon color="primary" sx={{ fontSize: '1.25rem' }} />
            {title}
          </Typography>

          <Grid container spacing={3}>
            {macros.map((macro) => (
              <Grid key={macro.label} xs={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" sx={{
                    fontWeight: 600,
                    color: macro.color,
                    mb: 0.5
                  }}>
                    {Math.round(macro.value)}g
                  </Typography>
                  {macro.subLabel && (
                    <Typography variant="caption" sx={{
                      display: 'block',
                      color: theme.palette.text.secondary,
                      fontFamily: "'JetBrains Mono', monospace",
                      mb: 0.25,
                    }}>
                      {macro.subLabel}
                    </Typography>
                  )}
                  <Typography variant="body2" sx={{
                    color: theme.palette.text.secondary,
                    fontWeight: 500
                  }}>
                    {macro.label}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>

          {/* Asterisk footnote for missing fiber data in keto mode */}
          {mode === 'keto' && hasMissingFiber && (
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                mt: 2,
                color: theme.palette.text.secondary,
              }}
            >
              * No fiber data available — shown as total carbs
            </Typography>
          )}
        </CardContent>
      </Card>
    </Fade>
  );
};

export default NutritionSummaryCard;