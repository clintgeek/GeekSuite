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
  ...props
}) => {
  const theme = useTheme();

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
            <Grid xs={4}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h5" sx={{
                  fontWeight: 600,
                  color: theme.palette.success.main,
                  mb: 1
                }}>
                  {protein}g
                </Typography>
                <Typography variant="body2" sx={{
                  color: theme.palette.text.secondary,
                  fontWeight: 500
                }}>
                  Protein
                </Typography>
              </Box>
            </Grid>
            <Grid xs={4}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h5" sx={{
                  fontWeight: 600,
                  color: theme.palette.warning.main,
                  mb: 1
                }}>
                  {carbs}g
                </Typography>
                <Typography variant="body2" sx={{
                  color: theme.palette.text.secondary,
                  fontWeight: 500
                }}>
                  Carbs
                </Typography>
              </Box>
            </Grid>
            <Grid xs={4}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h5" sx={{
                  fontWeight: 600,
                  color: theme.palette.error.main,
                  mb: 1
                }}>
                  {fat}g
                </Typography>
                <Typography variant="body2" sx={{
                  color: theme.palette.text.secondary,
                  fontWeight: 500
                }}>
                  Fat
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Fade>
  );
};

export default NutritionSummaryCard;