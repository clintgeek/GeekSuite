import React, { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
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
import { useToast } from '@geeksuite/ui';
import { SectionLabel, DisplayHeading, SuspenseSurface } from '../components/primitives';
import BPInsights from '../components/BloodPressure/BPInsights.jsx';
import QuickAddBP from '../components/BloodPressure/QuickAddBP.jsx';
import BPLogList from '../components/BloodPressure/BPLogList.jsx';
import { bpService } from '../services/bpService.js';
import { fitnessGeekService } from '../services/fitnessGeekService.js';
import { localDateString, utcDateString } from '@geeksuite/utils';
import logger from '../utils/logger.js';

// Charts and the report are lazy: between them they pulled Nivo (line + pie,
// ~530 kB raw), Recharts with its Redux/immer tail (~400 kB raw) and — through
// BPReport — jspdf + html2canvas onto this route's chunk, all before the page
// could paint its header, insights or log list. None of it is needed for the
// first frame, and the report is behind a button. Each boundary renders a
// SurfaceSkeleton the size of the card it replaces, so nothing jumps.
const BPChartNivo = lazy(() => import('../components/BloodPressure/BPChartNivo.jsx'));
const BPCategoryDistribution = lazy(() => import('../components/BloodPressure/BPCategoryDistribution.jsx'));
const BPHRChart = lazy(() => import('../components/BloodPressure/BPHRChart.jsx'));
const BPReport = lazy(() => import('../components/BloodPressure/BPReport.jsx'));

const BloodPressure = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { notify } = useToast();
  const [bpLogs, setBPLogs] = useState([]);
  const [loading, setLoading] = useState(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load; loadBPData now closes over `notify` from useToast(), which the linter can't prove is stable.
  }, []);

  const loadBPData = async () => {
    setLoading(true);
    try {
      const response = await bpService.getBPLogs();
      if (response.success) {
        setBPLogs(response.data);
      } else {
        notify('Failed to load blood pressure logs', { tone: 'error' });
      }
    } catch (error) {
      notify('Failed to load blood pressure data', { tone: 'error' });
      logger.error('Error loading BP data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHRSeries = async (date) => {
    try {
      const ymd = (date || localDateString());
      // `getGarminHeartRate` goes to this app's REST backend. Calling
      // `fitnessGeekService.get(...)` here sent the path through the GraphQL
      // router instead, which has no mapping for /fitness/garmin/heart-rate —
      // so every call threw "Rest proxy gap" and the chart was always empty.
      const data = await fitnessGeekService.getGarminHeartRate(ymd);
      if (data && Array.isArray(data.series)) setHrSeries(data.series);
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
        notify('Blood pressure reading logged successfully!', { tone: 'success' });
      } else {
        notify(response.message || 'Failed to add blood pressure reading', { tone: 'error' });
      }
    } catch (error) {
      // Handle specific error cases
      if (error.message && error.message.includes('already exists for this date')) {
        const todayBP = getTodayBP();
        if (todayBP) {
          notify(`You already have a blood pressure reading for today (${todayBP.systolic}/${todayBP.diastolic}${todayBP.pulse ? `, pulse: ${todayBP.pulse}` : ''}). You can update the existing entry or delete it first.`, { tone: 'error' });
        } else {
          notify('You already have a blood pressure reading for today. You can update the existing entry or delete it first.', { tone: 'error' });
        }
      } else {
        notify('Failed to add blood pressure reading', { tone: 'error' });
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
        notify('Blood pressure reading deleted successfully!', { tone: 'success' });
      } else {
        notify(response.message || 'Failed to delete blood pressure reading', { tone: 'error' });
      }
    } catch (error) {
      notify('Failed to delete blood pressure reading', { tone: 'error' });
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
    const today = localDateString();
    return bpLogs.find(log => {
      // log_date is stored as a UTC-midnight calendar date (the local day the
      // reading was logged on), so it must be read back with utcDateString —
      // localDateString(new Date(log.log_date)) rolls it back a day west of UTC.
      return utcDateString(log.log_date) === today;
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
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 960, mx: 'auto' }}>
      {/* Editorial header */}
      <Box sx={{ mb: 3 }}>
        <SectionLabel sx={{ mb: 0.75 }}>Tracking · Blood Pressure</SectionLabel>
        <DisplayHeading size="page">Blood Pressure</DisplayHeading>
        <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
          Track your blood pressure and heart health over time.
        </Typography>
      </Box>

      {/* Insights and Category Distribution - Stacked */}
      <Box sx={{ mb: 3 }}>
        <BPInsights bpLogs={bpLogs} />
      </Box>

      <Box sx={{ mb: 3 }}>
        <SuspenseSurface rows={3} height={220}>
          <BPCategoryDistribution bpLogs={bpLogs} />
        </SuspenseSurface>
      </Box>

      {/* Blood Pressure Chart */}
      {bpLogs.length > 0 && (
        <>
          {/* Time Range + Report — matches Reports page control bar */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'stretch', sm: 'center' },
              justifyContent: 'space-between',
              gap: 2,
              mb: 3,
            }}
          >
            <ToggleButtonGroup
              size="small"
              value={timeRangeState}
              exclusive
              onChange={(_e, v) => { if (v) handleTimeRangeChange(v); }}
              sx={{
                '& .MuiToggleButton-root': {
                  minHeight: { xs: 44, sm: 34 },
                  minWidth: { xs: 56, sm: 44 },
                  fontSize: '0.8125rem',
                },
              }}
            >
              <ToggleButton value="7">7d</ToggleButton>
              <ToggleButton value="30">30d</ToggleButton>
              <ToggleButton value="365">1y</ToggleButton>
              <ToggleButton value="all">All</ToggleButton>
            </ToggleButtonGroup>
            <Button
              onClick={() => setShowReport(true)}
              variant="outlined"
              size="small"
              startIcon={<PdfIcon />}
            >
              View Report
            </Button>
          </Box>

          {insufficientDataMessage && (
            <Typography
              sx={{
                display: 'block',
                fontSize: '0.75rem',
                color: 'warning.main',
                mb: 2,
                textAlign: 'center',
              }}
            >
              {insufficientDataMessage}
            </Typography>
          )}

          <Box sx={{ mb: 3 }}>
            <SuspenseSurface rows={4} height={320}>
              <BPChartNivo
                data={filteredBPLogs}
                title="Blood Pressure Trend"
              />
            </SuspenseSurface>
          </Box>

          {/* Heart Rate series from Garmin */}
          {hrSeries && hrSeries.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <SuspenseSurface rows={4} height={300}>
                <BPHRChart data={hrSeries} title="Heart Rate (Garmin)" />
              </SuspenseSurface>
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
        // A modal has no layout to reserve, so this boundary falls back to
        // nothing rather than to a skeleton card behind the backdrop.
        <Suspense fallback={null}>
          <BPReport
            bpLogs={filteredBPLogs}
            onClose={() => setShowReport(false)}
          />
        </Suspense>
      )}
    </Box>
  );
};

export default BloodPressure;