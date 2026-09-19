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
  Chip
} from '@mui/material';
import {
  Delete as DeleteIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon
} from '@mui/icons-material';
import { displayCalendarDate, localDateString, utcDateString } from '@geeksuite/utils';

const WeightLogList = ({ logs, onDelete, unit = 'lbs' }) => {

  // `log_date` is a CALENDAR date stored at UTC midnight, not an instant —
  // same class of bug already fixed in BPLogList. `new Date(dateString)` then
  // `.toDateString()`/`.toLocaleDateString()` reads that UTC midnight back in
  // the browser's own zone, which is the previous evening for anyone west of
  // UTC: a Central-time user's entry logged today rendered as yesterday's
  // date, and `date.toDateString() === today.toDateString()` (also LOCAL)
  // never matched, so "Today" never appeared. Comparing calendar-day strings
  // via `utcDateString`/`localDateString` and rendering with
  // `displayCalendarDate` (which forces `timeZone: 'UTC'`) fixes both.
  const formatDate = (dateString) => {
    const day = utcDateString(dateString);
    const today = localDateString();

    if (day === today) {
      return 'Today';
    }

    // "Yesterday" from the viewer's own local calendar, not
    // `Date.now() - 86400000` — that drifts across a DST transition.
    const now = new Date();
    const yesterday = localDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

    if (day === yesterday) {
      return 'Yesterday';
    }

    return displayCalendarDate(dateString, 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
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
                    <ListItem
                      sx={{
                        py: 1.5,
                        ...(index < sortedLogs.length - 1 && {
                          borderBottom: (t) => `1px solid ${t.palette.divider}`,
                        }),
                      }}
                    >
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
                          aria-label={`Delete the ${parseFloat(log.weight_value).toFixed(1)} ${unit} entry from ${formatDate(log.log_date)}`}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
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