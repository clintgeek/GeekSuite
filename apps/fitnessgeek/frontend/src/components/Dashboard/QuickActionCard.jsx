import React from 'react';
import {
  Card,
  CardContent,
  Avatar,
  Typography,
  Box
} from '@mui/material';
import { useTheme } from '@mui/material/styles';

const QuickActionCard = ({
  title,
  icon,
  color = 'primary',
  onClick,
  ...props
}) => {
  const theme = useTheme();

  const getColorConfig = (colorName) => {
    const colorMap = {
      success: theme.palette.success.main,
      info: theme.palette.info.main,
      error: theme.palette.error.main,
      warning: theme.palette.warning.main,
      primary: theme.palette.primary.main
    };
    return colorMap[colorName] || colorMap.primary;
  };

  return (
    <Card sx={{
      width: '100%',
      minHeight: 120,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      backgroundColor: theme.palette.background.paper,
      boxShadow: theme.shadows[1],
      borderRadius: 2,
      cursor: 'pointer',
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: theme.shadows[4]
      }
    }}
      onClick={onClick}
      {...props}
    >
      <CardContent sx={{
        p: 2,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        height: '100%'
      }}>
        <Avatar sx={{
          bgcolor: `${getColorConfig(color)}15`,
          color: getColorConfig(color),
          width: { xs: 40, sm: 48 },
          height: { xs: 40, sm: 48 },
          mb: 1
        }}>
          {icon}
        </Avatar>
        <Typography variant="body2" sx={{
          fontWeight: 500,
          color: theme.palette.text.primary
        }}>
          {title}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default QuickActionCard;