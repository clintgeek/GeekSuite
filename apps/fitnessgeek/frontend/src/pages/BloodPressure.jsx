import React, { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  useTheme,
  useMediaQuery,
  Grid
} from '@mui/material';
import {
  MonitorHeart as BPIcon,
  Assessment as ReportIcon,
  PictureAsPdf as PdfIcon
} from '@mui/icons-material';
import BPChartNivo from '../components/BloodPressure/BPChartNivo.jsx';
import BPInsights from '../components/BloodPressure/BPInsights.jsx';
import BPCategoryDistribution from '../components/BloodPressure/BPCategoryDistribution.jsx';
import QuickAddBP from '../components/BloodPressure/QuickAddBP.jsx';
import BPLogList from '../components/BloodPressure/BPLogList.jsx';
import BPReport from '../components/BloodPressure/BPReport.jsx';
import BPHRChart from '../components/BloodPressure/BPHRChart.jsx';
import { bpService } from '../services/bpService.js';
import { fitnessGeekService } from '../services/fitnessGeekService.js';
import { getTodayLocal, formatDateLocal } from '../utils/dateUtils.js';
import logger from '../utils/logger.js';

const BloodPressure = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [bpLogs, setBPLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [hrSeries, setHrSeries] = useState([]);

  // Calculate the best default time range based on available data
  const getBestTimeRange = (data) => {
    if (!data || data.length === 0) return 'all';

    const sortedData = [...data].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));
    const mostRecentDate = new Date(sortedData[0].log_date);

    const ranges = [
      { key: '7', days: 7 },
      { key: '30', days: 30 },
      { key: '365', days: 365 },
      { key: 'all', days: Infinity }
    ];

    for (const range of ranges) {
      const cutoffDate = new Date(mostRecentDate.getTime() - (range.days * 24 * 60 * 60 * 1000));
      const filteredCount = data.filter(item => {
        if (range.key === 'all') return true;
        const logDate = new Date(item.log_date);
        return logDate >= cutoffDate;
      }).length;

      if (filteredCount >= 2) {
        return range.key;
      }
    }

    return 'all';
  };

  const [timeRangeState, setTimeRangeState] = useState(() => getBestTimeRange(bpLogs));

  // Update time range when data loads
  React.useEffect(() => {
    if (bpLogs.length > 0) {
      const bestRange = getBestTimeRange(bpLogs);
      setTimeRangeState(bestRange);
    }
  }, [bpLogs]);

  // Filter data based on selected time range
  const filteredBPLogs = useMemo(() => {
    if (!bpLogs || bpLogs.length === 0) return [];

    const sortedData = [...bpLogs].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));
    const mostRecentDate = new Date(sortedData[0].log_date);

    const ranges = {
      '7': 7,
      '30': 30,
      '365': 365,
      'all': Infinity
    };

    const daysToSubtract = ranges[timeRangeState];
    const cutoffDate = new Date(mostRecentDate.getTime() - (daysToSubtract * 24 * 60 * 60 * 1000));

    const filtered = bpLogs
      .filter(item => {
        if (timeRangeState === 'all') return true;
        const logDate = new Date(item.log_date);
        return logDate >= cutoffDate;
      })
      .sort((a, b) => new Date(a.log_date) - new Date(b.log_date));

    return filtered;
  }, [bpLogs, timeRangeState]);

  const handleTimeRangeChange = (newRange) => {
    setTimeRangeState(newRange);
  };

  // Auto-switch to better range if current range has insufficient data
  React.useEffect(() => {
    if (filteredBPLogs.length < 2 && filteredBPLogs.length > 0) {
      const betterRange = getBestTimeRange(bpLogs);
      if (betterRange !== timeRangeState) {
        setTimeRangeState(betterRange);
      }
    }
  }, [bpLogs, timeRangeState, filteredBPLogs.length]);

  // Check if we have enough data points for the selected range
  const hasEnoughData = filteredBPLogs.length >= 2;
  const insufficientDataMessage = !hasEnoughData && filteredBPLogs.length > 0 ?
    `Only ${filteredBPLogs.length} data point${filteredBPLogs.length === 1 ? '' : 's'} in this range. Try a larger time range.` : null;

  // Load BP data on mount
  useEffect(() => {
    loadBPData();
    loadHRSeries();
  }, []);

  const loadBPData = async () => {
    setLoading(true);
    try {
      const response = await bpService.getBPLogs();
      if (response.success) {
        setBPLogs(response.data);
      } else {
        setError('Failed to load blood pressure logs');
      }
    } catch (error) {
      setError('Failed to load blood pressure data');
      logger.error('Error loading BP data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHRSeries = async (date) => {
    try {
      const today = new Date();
      const local = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
      const ymd = (date || local.toISOString().split('T')[0]);
      const resp = await fitnessGeekService.get(`/fitness/garmin/heart-rate/${ymd}`);
      const data = resp.data || resp?.data?.data || resp;
      if (data && data.series) setHrSeries(data.series);
    } catch (e) {
      logger.warn('Failed to load HR series');
    }
  };

  const handleAddBP = async (bpData) => {
    try {
      const response = await bpService.createBPLog({
        systolic: bpData.systolic,
        diastolic: bpData.diastolic,
        pulse: bpData.pulse,
        date: bpData.date
      });

      if (response.success) {
        // Reload BP data to get the updated list
        await loadBPData();
        setSuccess('Blood pressure reading logged successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(response.message || 'Failed to add blood pressure reading');
      }
    } catch (error) {
      // Handle specific error cases
      if (error.message && error.message.includes('already exists for this date')) {
        const todayBP = getTodayBP();
        if (todayBP) {
          setError(`You already have a blood pressure reading for today (${todayBP.systolic}/${todayBP.diastolic}${todayBP.pulse ? `, pulse: ${todayBP.pulse}` : ''}). You can update the existing entry or delete it first.`);
        } else {
          setError('You already have a blood pressure reading for today. You can update the existing entry or delete it first.');
        }
      } else {
        setError('Failed to add blood pressure reading');
      }
      logger.error('Error adding BP reading:', error);
    }
  };

  const handleDeleteBP = async (logId) => {
    try {
      const response = await bpService.deleteBPLog(logId);

      if (response.success) {
        // Reload BP data to get the updated list
        await loadBPData();
        setSuccess('Blood pressure reading deleted successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(response.message || 'Failed to delete blood pressure reading');
      }
    } catch (error) {
      setError('Failed to delete blood pressure reading');
      logger.error('Error deleting BP reading:', error);
    }
  };

  const getCurrentBP = () => {
    if (bpLogs.length === 0) {
      return null;
    }
    const sortedLogs = [...bpLogs].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));
    return sortedLogs[0];
  };

  const getTodayBP = () => {
    const today = getTodayLocal();
    return bpLogs.find(log => {
      // Convert the stored UTC date to local date for comparison
      const logDate = new Date(log.log_date);
      const logDateLocal = formatDateLocal(logDate);
      return logDateLocal === today;
    });
  };

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '50vh',
        p: 2
      }}>
        <CircularProgress />
      </Box>
    );
  }

  const currentBP = getCurrentBP();
  const todayBP = getTodayBP();

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontWeight: 700,
            mb: 0.5,
            color: theme.palette.text.primary,
            letterSpacing: '-0.02em'
          }}
        >
          Blood Pressure
        </Typography>
        <Typography variant="body1" sx={{ color: theme.palette.text.secondary, fontSize: '1.0625rem' }}>
          Track your blood pressure and heart health
        </Typography>
      </Box>

      {/* Success/Error Messages */}
      {success && (
        <Box sx={{ mb: 3 }}>
          <Alert severity="success" onClose={() => setSuccess('')}>
            {success}
          </Alert>
        </Box>
      )}
      {error && (
        <Box sx={{ mb: 3 }}>
          <Alert severity="error" onClose={() => setError('')}>
            {error}
          </Alert>
        </Box>
      )}

      {/* Insights and Category Distribution - Stacked */}
      <Box sx={{ mb: 3 }}>
        <BPInsights bpLogs={bpLogs} />
      </Box>

      <Box sx={{ mb: 3 }}>
        <BPCategoryDistribution bpLogs={bpLogs} />
      </Box>

      {/* Blood Pressure Chart */}
      {bpLogs.length > 0 && (
        <>
          {/* Time Range Buttons and Export */}
          <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            mb: 3
          }}>
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <ButtonGroup
                size="medium"
                sx={{
                  '& .MuiButton-root': {
                    borderColor: theme.palette.divider,
                    color: theme.palette.text.secondary,
                    fontWeight: 600,
                    px: 2,
                    '&:hover': {
                      borderColor: theme.palette.primary.main,
                      backgroundColor: `${theme.palette.primary.main}1a`
                    }
                  },
                  '& .MuiButton-contained': {
                    backgroundColor: theme.palette.primary.main,
                    color: theme.palette.primary.contrastText,
                    borderColor: theme.palette.primary.main,
                    '&:hover': {
                      backgroundColor: theme.palette.primary.dark,
                      borderColor: theme.palette.primary.dark
                    }
                  }
                }}
              >
                <Button
                  onClick={() => handleTimeRangeChange('7')}
                  variant={timeRangeState === '7' ? 'contained' : 'outlined'}
                >
                  7d
                </Button>
                <Button
                  onClick={() => handleTimeRangeChange('30')}
                  variant={timeRangeState === '30' ? 'contained' : 'outlined'}
                >
                  30d
                </Button>
                <Button
                  onClick={() => handleTimeRangeChange('365')}
                  variant={timeRangeState === '365' ? 'contained' : 'outlined'}
                >
                  1y
                </Button>
                <Button
                  onClick={() => handleTimeRangeChange('all')}
                  variant={timeRangeState === 'all' ? 'contained' : 'outlined'}
                >
                  All
                </Button>
              </ButtonGroup>

              <Button
                onClick={() => setShowReport(true)}
                variant="outlined"
                startIcon={<PdfIcon />}
                sx={{
                  borderColor: theme.palette.primary.main,
                  color: theme.palette.primary.main,
                  fontWeight: 600,
                  px: 3,
                  borderRadius: '8px',
                  '&:hover': {
                    borderColor: theme.palette.primary.dark,
                    backgroundColor: `${theme.palette.primary.main}0d`
                  }
                }}
              >
                View Report
              </Button>
            </Box>

            {/* Insufficient data message */}
            {insufficientDataMessage && (
              <Typography variant="caption" sx={{
                color: theme.palette.warning.main,
                fontSize: '0.7rem',
                mt: 1,
                textAlign: 'center'
              }}>
                {insufficientDataMessage}
              </Typography>
            )}
          </Box>

          <Box sx={{ mb: 3 }}>
            <BPChartNivo
              data={filteredBPLogs}
              title="Blood Pressure Trend"
            />
          </Box>

          {/* Heart Rate series from Garmin */}
          {hrSeries && hrSeries.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <BPHRChart data={hrSeries} title="Heart Rate (Garmin)" />
            </Box>
          )}
        </>
      )}

      {/* Quick Add and Log List Grid */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <QuickAddBP onAdd={handleAddBP} unit="mmHg" existingTodayBP={todayBP} />
        </Grid>
        <Grid item xs={12} sx={{ width: '100%' }}>
          <BPLogList
            logs={bpLogs}
            onDelete={handleDeleteBP}
            unit="mmHg"
          />
        </Grid>
      </Grid>

      {/* BP Report Dialog */}
      {showReport && (
        <BPReport
          bpLogs={filteredBPLogs}
          onClose={() => setShowReport(false)}
        />
      )}
    </Box>
  );
};

export default BloodPressure;