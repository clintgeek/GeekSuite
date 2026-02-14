import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Today as TodayIcon } from '@mui/icons-material';
import {
  Restaurant as FoodIcon,
  MonitorWeight as WeightIcon,
  MonitorHeart as BPIcon
} from '@mui/icons-material';

const DashboardHeader = ({
  showDate = true,
  onQuickAction,
  ...props
}) => {
  const theme = useTheme();
  useMediaQuery(theme.breakpoints.down('sm'));

  const handleQuickAction = (action) => {
    if (onQuickAction) {
      onQuickAction(action);
    }
  };

  return (
    <Box sx={{
      p: { xs: 2, sm: 3 },
      pb: { xs: 1, sm: 3 },
      mb: 2,
      ...props.sx
    }}
      {...props}
    >
      {showDate && (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1
        }}>
          {/* Date Section */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1
          }}>
            <TodayIcon sx={{
              fontSize: { xs: '1.125rem', sm: '1.25rem' },
              color: theme.palette.text.secondary
            }} />
            <Typography
              variant="body1"
              sx={{
                fontSize: { xs: '0.8rem', sm: '0.9rem' },
                color: theme.palette.text.secondary
              }}
            >
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </Typography>
          </Box>

          {/* Quick Action Buttons */}
          <Box sx={{
            display: 'flex',
            gap: 0.5
          }}>
            <IconButton
              onClick={() => handleQuickAction('food')}
              sx={{
                bgcolor: `${theme.palette.success.main}15`,
                color: theme.palette.success.main,
                '&:hover': {
                  bgcolor: `${theme.palette.success.main}25`
                },
                width: { xs: 32, sm: 36 },
                height: { xs: 32, sm: 36 }
              }}
            >
              <FoodIcon sx={{ fontSize: { xs: '1rem', sm: '1.125rem' } }} />
            </IconButton>
            <IconButton
              onClick={() => handleQuickAction('weight')}
              sx={{
                bgcolor: `${theme.palette.info.main}15`,
                color: theme.palette.info.main,
                '&:hover': {
                  bgcolor: `${theme.palette.info.main}25`
                },
                width: { xs: 32, sm: 36 },
                height: { xs: 32, sm: 36 }
              }}
            >
              <WeightIcon sx={{ fontSize: { xs: '1rem', sm: '1.125rem' } }} />
            </IconButton>
            <IconButton
              onClick={() => handleQuickAction('bp')}
              sx={{
                bgcolor: `${theme.palette.error.main}15`,
                color: theme.palette.error.main,
                '&:hover': {
                  bgcolor: `${theme.palette.error.main}25`
                },
                width: { xs: 32, sm: 36 },
                height: { xs: 32, sm: 36 }
              }}
            >
              <BPIcon sx={{ fontSize: { xs: '1rem', sm: '1.125rem' } }} />
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default DashboardHeader;