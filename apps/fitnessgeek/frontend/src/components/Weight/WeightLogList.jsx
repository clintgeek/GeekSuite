import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Divider
} from '@mui/material';
import {
  Delete as DeleteIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon
} from '@mui/icons-material';

const WeightLogList = ({ logs, onDelete, unit = 'lbs' }) => {

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
  };

  const getChangeIndicator = (currentLog, previousLog) => {
    if (!previousLog) return null;

    const change = currentLog.weight_value - previousLog.weight_value;
    if (change === 0) return null;

    return change > 0 ? (
      <TrendingUpIcon color="error" fontSize="small" />
    ) : (
      <TrendingDownIcon color="success" fontSize="small" />
    );
  };

  const getChangeText = (currentLog, previousLog) => {
    if (!previousLog) return null;

    const change = currentLog.weight_value - previousLog.weight_value;
    if (change === 0) return null;

    return (
      <Typography
        variant="caption"
        color={change > 0 ? 'error' : 'success'}
        sx={{ ml: 0.5 }}
      >
        {change > 0 ? '+' : ''}{change.toFixed(1)} {unit}
      </Typography>
    );
  };

  const sortedLogs = [...logs].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));

  return (
    <Card sx={{
      width: '100%',
      backgroundColor: 'background.paper',
      borderRadius: 2,
      boxShadow: 1,
      border: 'none'
    }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
          {sortedLogs.length > 0 ? (
            <List>
              {sortedLogs.map((log, index) => {
                const previousLog = sortedLogs[index + 1];
                const changeIndicator = getChangeIndicator(log, previousLog);
                const changeText = getChangeText(log, previousLog);

                return (
                  <React.Fragment key={log.id}>
                    <ListItem sx={{ py: 1.5 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography variant="h6" sx={{ fontWeight: 600, mr: 1 }}>
                              {parseFloat(log.weight_value).toFixed(1)} {unit}
                            </Typography>
                            {changeIndicator}
                            {changeText}
                          </Box>
                        }
                        secondary={
                          <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                            <Typography variant="body2" color="text.secondary">
                              {formatDate(log.log_date)}
                            </Typography>
                            {index === 0 && (
                              <Chip
                                label="Latest"
                                size="small"
                                color="primary"
                                sx={{ ml: 1 }}
                              />
                            )}
                          </Box>
                        }
                        primaryTypographyProps={{ component: 'div' }}
                        secondaryTypographyProps={{ component: 'div' }}
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          onClick={() => onDelete(log.id)}
                          color="error"
                          size="small"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                    {index < sortedLogs.length - 1 && <Divider />}
                  </React.Fragment>
                );
              })}
            </List>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                No weight logs yet. Start tracking your weight!
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default WeightLogList;