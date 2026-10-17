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
import { macroColors } from '../../theme/theme.jsx';
import { RestaurantMenu as NutritionIcon } from '@mui/icons-material';

const NutritionSummaryCard = ({
  protein = 0,
  carbs = 0,
  fat = 0,
  title = 'Today’s food',
  timeout = 700,
  // Keto mode props
  mode = 'standard',
  netCarbsConsumed = 0,
  netCarbLimit = 20,
  hasMissingFiber = false,
  ...props
}) => {
  const theme = useTheme();
  // The macro ramp (visual review B2), not success/warning/error: fat isn't an error.
  const m = theme.palette.macro || macroColors(theme.palette.mode);

  // Standard macro layout: Protein | Carbs | Fat
  // Keto macro layout:    Fat | Protein | Net Carbs
  const macros = mode === 'keto'
    ? [
        { label: 'Fat',      value: fat,              color: m.fat     },
        { label: 'Protein',  value: protein,           color: m.protein },
        {
          label: `Net carbs${hasMissingFiber ? '*' : ''}`,
          value: netCarbsConsumed,
          color: m.carbs,
          subLabel: `of ${netCarbLimit}g limit`,
        },
      ]
    : [
        { label: 'Protein', value: protein, color: m.protein },
        { label: 'Carbs',   value: carbs,   color: m.carbs },
        { label: 'Fat',     value: fat,     color: m.fat },
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
                      fontFamily: "inherit",
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