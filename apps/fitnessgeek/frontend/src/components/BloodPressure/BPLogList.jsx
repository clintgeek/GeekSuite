import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Delete as DeleteIcon,
  MonitorHeart as BPIcon
} from '@mui/icons-material';

const BPLogList = ({ logs, onDelete, unit = "mmHg" }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const getBPStatus = (systolic, diastolic) => {
    // BP Categories based on American Heart Association guidelines
    if (systolic < 120 && diastolic < 80) return { status: 'Normal', color: '#10b981' };
    if (systolic < 130 && diastolic < 80) return { status: 'Elevated', color: '#f59e0b' };
    if (systolic < 140 || diastolic < 90) return { status: 'Stage 1', color: '#f97316' };
    if (systolic < 180 || diastolic < 120) return { status: 'Stage 2', color: '#ef4444' };
    return { status: 'Crisis', color: '#dc2626' };
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (logs.length === 0) {
    return (
      <Card sx={{
        width: '100%',
        display: 'block',
        backgroundColor: 'background.paper',
        borderRadius: 2,
        boxShadow: 1,
        border: 'none'
      }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: 100,
            color: theme.palette.text.secondary
          }}>
            <Typography variant="body2">
              No blood pressure readings recorded yet
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  // Sort logs by date (newest first)
  const sortedLogs = [...logs].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));

  return (
    <Card sx={{
      width: '100%',
      display: 'block',
      backgroundColor: 'background.paper',
      borderRadius: 2,
      boxShadow: 1,
      border: 'none'
    }}>
      <CardContent sx={{ p: 3 }}>

        <List sx={{ p: 0, m: 0, width: '100%' }}>
          {sortedLogs.map((log) => {
            const bpStatus = getBPStatus(log.systolic, log.diastolic);
            const isToday = new Date(log.log_date).toDateString() === new Date().toDateString();

            return (
              <ListItem
                disableGutters
                key={log.id || log._id}
                sx={{
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 1,
                  mb: 1,
                  backgroundColor: theme.palette.background.paper,
                  '&:last-child': { mb: 0 },
                  py: 1.5,
                  px: { xs: 2, md: 3 },
                  display: 'flex',
                  flexDirection: { xs: 'column', md: 'row' },
                  alignItems: { xs: 'stretch', md: 'center' },
                  justifyContent: { xs: 'flex-start', md: 'space-between' },
                  width: '100%',
                  gap: { xs: 0.5, md: 0 }
                }}
              >
                {/* Mobile Layout */}
                <Box sx={{ display: { xs: 'block', md: 'none' }, width: '100%' }}>
                  {/* Row 1: Icon + BP + Status + Delete */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <BPIcon sx={{ color: bpStatus.color, fontSize: 24 }} />
                      <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                        {log.systolic}/{log.diastolic} {unit}
                      </Typography>
                      <Chip
                        label={bpStatus.status}
                        size="small"
                        sx={{
                          backgroundColor: `${bpStatus.color}20`,
                          color: bpStatus.color,
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          height: 20
                        }}
                      />
                    </Box>
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => onDelete(log.id || log._id)}
                      sx={{ color: 'error.main', p: 0.5 }}
                      size="small"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  {/* Row 2: Pulse + Date */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pl: 5 }}>
                    {log.pulse && (
                      <Typography variant="body2" sx={{ fontWeight: 500, color: theme.palette.text.secondary }}>
                        ♥ {log.pulse} bpm
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(log.log_date)}
                      {isToday && ` • ${formatTime(log.log_date)}`}
                    </Typography>
                  </Box>
                </Box>

                {/* Desktop Layout */}
                <Box sx={{ display: { xs: 'none', md: 'contents' } }}>
                  {/* Left: Icon + BP Reading */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: '0 0 auto' }}>
                    <BPIcon sx={{ color: bpStatus.color, fontSize: 28 }} />
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {log.systolic}/{log.diastolic} {unit}
                    </Typography>
                  </Box>

                  {/* Pulse */}
                  <Box sx={{ flex: '0 0 auto' }}>
                    {log.pulse ? (
                      <Typography variant="body1" sx={{ fontWeight: 500, color: theme.palette.text.secondary }}>
                        ♥ {log.pulse} bpm
                      </Typography>
                    ) : (
                      <Typography variant="body1" sx={{ color: 'transparent' }}>
                        ♥ -- bpm
                      </Typography>
                    )}
                  </Box>

                  {/* Status Chip */}
                  <Box sx={{ flex: '0 0 auto' }}>
                    <Chip
                      label={bpStatus.status}
                      size="small"
                      sx={{
                        backgroundColor: `${bpStatus.color}20`,
                        color: bpStatus.color,
                        fontWeight: 600,
                        fontSize: '0.75rem'
                      }}
                    />
                  </Box>

                  {/* Date/Time */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '0 0 auto' }}>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(log.log_date)}
                    </Typography>
                    {isToday && (
                      <Typography variant="body2" color="text.secondary">
                        • {formatTime(log.log_date)}
                      </Typography>
                    )}
                  </Box>

                  {/* Delete Button */}
                  <Box sx={{ flex: '0 0 auto' }}>
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => onDelete(log.id || log._id)}
                      sx={{ color: 'error.main' }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </Box>
              </ListItem>
            );
          })}
        </List>
      </CardContent>
    </Card>
  );
};

export default BPLogList;