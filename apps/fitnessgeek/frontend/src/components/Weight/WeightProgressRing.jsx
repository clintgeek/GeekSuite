import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  useTheme,
  useMediaQuery
} from '@mui/material';

const WeightProgressRing = ({
  currentWeight,
  startWeight,
  targetWeight,
  goalDate,
  unit = 'lbs'
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Calculate progress
  const totalWeightLoss = parseFloat(startWeight) - parseFloat(targetWeight);
  const currentWeightLoss = parseFloat(startWeight) - parseFloat(currentWeight);
  const progressPercentage = Math.min(Math.max((currentWeightLoss / totalWeightLoss) * 100, 0), 100);

  // Calculate time progress
  const startDate = new Date();
  const endDate = new Date(goalDate);
  const totalDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
  const daysElapsed = (new Date() - startDate) / (1000 * 60 * 60 * 24);
  const timeProgress = Math.min(Math.max((daysElapsed / totalDays) * 100, 0), 100);

  // Determine if on track
  const isOnTrack = progressPercentage >= timeProgress;
  const progressColor = isOnTrack ? theme.palette.success.main : theme.palette.warning.main;

  const ringSize = isMobile ? 80 : 100;
  const strokeWidth = isMobile ? 6 : 8;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (progressPercentage / 100) * circumference;

  return (
    <Card sx={{
      width: '100%',
      backgroundColor: 'background.paper',
      borderRadius: 2,
      boxShadow: 1,
      border: 'none'
    }}>
      <CardContent sx={{ p: isMobile ? 2 : 3 }}>
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Progress Ring */}
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <svg
              width={ringSize}
              height={ringSize}
              style={{ transform: 'rotate(-90deg)' }}
            >
              {/* Background circle */}
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke={theme.palette.grey[200]}
                strokeWidth={strokeWidth}
              />
              {/* Progress circle */}
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke={progressColor}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
              />
            </svg>

            {/* Center text */}
            <Box sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center'
            }}>
              <Typography variant="h6" sx={{
                fontWeight: 600,
                color: theme.palette.text.primary,
                fontSize: isMobile ? '0.9rem' : '1.1rem',
                lineHeight: 1
              }}>
                {Math.round(progressPercentage)}%
              </Typography>
              <Typography variant="caption" sx={{
                color: theme.palette.text.secondary,
                fontSize: '0.6rem',
                display: 'block'
              }}>
                Complete
              </Typography>
            </Box>
          </Box>

          {/* Stats */}
          <Box sx={{ flex: 1, ml: 2 }}>
            <Typography variant="h6" sx={{
              fontWeight: 600,
              color: theme.palette.text.primary,
              fontSize: isMobile ? '1.1rem' : '1.25rem',
              mb: 0.5
            }}>
              {currentWeight} {unit}
            </Typography>

            <Typography variant="caption" sx={{
              color: theme.palette.text.secondary,
              fontSize: '0.7rem',
              display: 'block',
              mb: 0.5
            }}>
              {currentWeightLoss.toFixed(1)} {unit} lost
            </Typography>

            <Typography variant="caption" sx={{
              color: theme.palette.text.secondary,
              fontSize: '0.7rem',
              display: 'block'
            }}>
              {totalWeightLoss - currentWeightLoss} {unit} to go
            </Typography>
          </Box>
        </Box>

        {/* Status indicator */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mt: 2,
          p: 1,
          backgroundColor: theme.palette.grey[50],
          borderRadius: 1
        }}>
          <Typography variant="caption" sx={{
            color: theme.palette.text.secondary,
            fontSize: '0.7rem'
          }}>
            {isOnTrack ? 'On Track' : 'Behind Schedule'}
          </Typography>

          <Typography variant="caption" sx={{
            color: theme.palette.text.secondary,
            fontSize: '0.7rem'
          }}>
            {Math.round(timeProgress)}% time elapsed
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default WeightProgressRing;