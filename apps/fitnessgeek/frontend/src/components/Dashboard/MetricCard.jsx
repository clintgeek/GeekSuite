import React from 'react';
import {
  Card,
  CardContent,
  Avatar,
  Typography,
  LinearProgress,
  Box,
  Fade
} from '@mui/material';
import { useTheme } from '@mui/material/styles';

const MetricCard = ({
  title,
  value,
  subtitle,
  icon,
  color = 'primary',
  progress,
  progressLabel,
  progressValue,
  children,
  timeout = 300,
  ...props
}) => {
  const theme = useTheme();

  const getColorConfig = (colorName) => {
    const colorMap = {
      success: {
        gradient: `linear-gradient(135deg, ${theme.palette.grey[50]} 0%, ${theme.palette.grey[100]} 100%)`,
        bgcolor: theme.palette.success.light,
        iconColor: theme.palette.success.main
      },
      info: {
        gradient: `linear-gradient(135deg, ${theme.palette.grey[50]} 0%, ${theme.palette.grey[100]} 100%)`,
        bgcolor: theme.palette.info.light,
        iconColor: theme.palette.info.main
      },
      error: {
        gradient: `linear-gradient(135deg, ${theme.palette.grey[50]} 0%, ${theme.palette.grey[100]} 100%)`,
        bgcolor: theme.palette.error.light,
        iconColor: theme.palette.error.main
      },
      warning: {
        gradient: `linear-gradient(135deg, ${theme.palette.grey[50]} 0%, ${theme.palette.grey[100]} 100%)`,
        bgcolor: theme.palette.warning.light,
        iconColor: theme.palette.warning.main
      },
      primary: {
        gradient: `linear-gradient(135deg, ${theme.palette.grey[50]} 0%, ${theme.palette.grey[100]} 100%)`,
        bgcolor: theme.palette.primary.light,
        iconColor: theme.palette.primary.main
      }
    };
    return colorMap[colorName] || colorMap.primary;
  };

  const colorConfig = getColorConfig(color);

  return (
    <Fade in timeout={timeout}>
      <Card onClick={props.onClick} sx={{
        width: '100%',
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.palette.background.paper,
        boxShadow: theme.shadows[1],
        borderRadius: 2,
        position: 'relative',
        overflow: 'hidden',
        cursor: props.onClick ? 'pointer' : 'default'
      }}>
        <CardContent sx={{
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          height: '100%'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, flex: 1 }}>
            <Avatar
              sx={{
                bgcolor: colorConfig.iconColor,
                color: '#fff',
                mr: 2,
                width: { xs: 40, sm: 48 },
                height: { xs: 40, sm: 48 }
              }}
            >
              {icon}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 600,
                  fontSize: { xs: '1.5rem', sm: '2rem' },
                  color: theme.palette.text.primary
                }}
              >
                {value}
              </Typography>
              <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                {subtitle}
              </Typography>
            </Box>
          </Box>

          {typeof progress === 'number' && (
            <Box sx={{ mt: 'auto' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  {progressLabel}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                  {typeof progressValue === 'number' ? progressValue : Math.round(progress)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : theme.palette.grey[200],
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: colorConfig.iconColor
                  }
                }}
              />
            </Box>
          )}

          {children && (
            <Box sx={{ mt: 'auto', pt: 2 }}>
              {children}
            </Box>
          )}
        </CardContent>
      </Card>
    </Fade>
  );
};

export default MetricCard;