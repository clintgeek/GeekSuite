import React, { lazy, Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { EmptyState, SuspenseSurface } from '../components/primitives';
import BPInsights from '../components/BloodPressure/BPInsights.jsx';
import QuickAddBP from '../components/BloodPressure/QuickAddBP.jsx';
import BPLogList from '../components/BloodPressure/BPLogList.jsx';
import AddBPDialog from '../components/BloodPressure/AddBPDialog.jsx';
import { bpService } from '../services/bpService.js';
import { fitnessGeekService } from '../services/fitnessGeekService.js';
import { localDateString, utcDateString } from '@geeksuite/utils';
import { shortDay } from '../utils/dates.js';
import logger from '../utils/logger.js';
import { errorMessage } from '../utils/errorMessage.js';
import { isBPDuplicate } from '../components/BloodPressure/bpTimeUtils.js';

// Charts and the report are lazy: between them they pulled Nivo (line + pie,
// ~530 kB raw), Recharts with its Redux/immer tail (~400 kB raw) and — through
// BPReport — jspdf + html2canvas onto this route's chunk, all before the page
// could paint its header, insights or log list. None of it is needed for the
// first frame, and the report is behind a button. Each boundary renders a
// SurfaceSkeleton the size of the card it replaces, so nothing jumps.
const BPChartNivo = lazy(() => import('../components/BloodPressure/BPChartNivo.jsx'));
const BPCategoryDistribution = lazy(() => import('../components/BloodPressure/BPCategoryDistribution.jsx'));

// The donut's title names the window the range toggle chose.
const RANGE_WORDS = { '7': 'last 7 days', '30': 'last 30 days', '365': 'last year', all: 'all time' };
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
  // `?add=1` — the Today strip's "Add BP" — opens the add dialog directly.
  const [searchParams, setSearchParams] = useSearchParams();
  const autoOpenAdd = searchParams.get('add') === '1';
  const clearAddParam = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('add');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Calculate the best default time range based on available data. It
  // starts at 30 days, as the plan said ("last 30 days"): a week of readings
  // used to open the donut on 7d. 7d is still a tap away.
  const getBestTimeRange = (data) => {
    if (!data || data.length === 0) return 'all';

    const sortedData = [...data].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));
    const mostRecentDate = new Date(sortedData[0].log_date);

    const ranges = [
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
    `Only ${filteredBPLogs.length} reading${filteredBPLogs.length === 1 ? '' : 's'} in this range. Try a longer one.` : null;

  // Load BP data on mount
  useEffect(() => {
    loadBPData();
    loadHRSeries();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load; loadBPData now closes over `notify` from useToast(), which the linter can't prove is stable.
  }, []);

  // `silent` refreshes in place: a reload after a save, delete or undo must
  // not swap the page for its spinner (and unmount an open dialog).
  const loadBPData = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await bpService.getBPLogs();
      if (response.success) {
        setBPLogs(response.data);
      } else {
        notify('Couldn’t load your blood pressure readings. Try again.', { tone: 'error' });
      }
    } catch (error) {
      notify(errorMessage(error, 'Couldn’t load your blood pressure readings. Try again.'), { tone: 'error' });
      logger.error('Error loading BP data:', error);
    } finally {
      if (!silent) setLoading(false);
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
        date: bpData.date,
        measured_at: bpData.measured_at
      });

      if (response.success && response.data) {
        // Reload BP data to get the updated list
        await loadBPData({ silent: true });
        notify('Blood pressure saved', { tone: 'success' });
      } else {
        // A soft failure is still a failure. Falling through here let
        // AddBPDialog's `await onAdd(...)` resolve normally, so it cleared the
        // form and closed exactly as if the reading had saved.
        throw new Error(response.message || 'Failed to add blood pressure reading');
      }
    } catch (error) {
      // The old "one reading per calendar day" rejection is gone — multiple
      // readings a day are the normal case now (see the shared schema's
      // header). What can still collide is the exact same instant, which
      // the gateway reports as `extensions.code: 'BP_DUPLICATE'` (contract
      // C1). This used to test `error.message` for "already been recorded" —
      // text the gateway never sent, so the duplicate case fell through to
      // the generic toast. The form that made the reading shows the error
      // inline (with "Save it one minute later" for a duplicate), so no
      // second toast here.
      logger.error(isBPDuplicate(error) ? 'BP reading collided with an existing one' : 'Error adding BP reading:', error);
      // Re-throw, like handleSaveEditBP below. Without this the dialog closed
      // and blanked the form on every failure while a 3-second toast was the
      // only trace — so a reading logged on bad signal was simply gone, and
      // by the time it was noticed the number had been forgotten. The inline
      // <Alert> AddBPDialog renders for exactly this case could never fire,
      // because nothing ever rejected.
      throw error;
    }
  };

  // Edit-in-place: `bpService.updateBPLog` already existed but nothing in the
  // frontend called it — a typo meant delete-and-retype, which also lost the
  // reading's place in the day (see BPLogList.jsx's edit affordance).
  // `editingLog` holds the row being edited; a separate AddBPDialog instance
  // (not QuickAddBP's "add" one) opens pre-filled from it.
  const [editingLog, setEditingLog] = useState(null);

  const handleEditBP = (log) => {
    setEditingLog(log);
  };

  const handleCloseEdit = () => {
    setEditingLog(null);
  };

  const handleSaveEditBP = async (bpData) => {
    const id = editingLog?.id || editingLog?._id;
    try {
      const response = await bpService.updateBPLog(id, {
        systolic: bpData.systolic,
        diastolic: bpData.diastolic,
        pulse: bpData.pulse,
        date: bpData.date,
        measured_at: bpData.measured_at
      });

      if (response.success && response.data) {
        await loadBPData({ silent: true });
        notify('Saved', { tone: 'success' });
        setEditingLog(null);
      } else {
        // Same reasoning as handleAddBP: a falsy `success` must not look like
        // a saved edit.
        throw new Error(response.message || 'Failed to update blood pressure reading');
      }
    } catch (error) {
      // Shown inline by the edit dialog (see handleAddBP).
      logger.error('Error updating BP reading:', error);
      // Re-throw so AddBPDialog's own try/catch keeps the dialog open and
      // shows the error inline, instead of closing on a failed save.
      throw error;
    }
  };

  // Re-create a deleted reading from the row we had on screen. It comes back
  // as a new row (a delete can't hand back the old id), with the same
  // numbers, day and instant.
  const undoDelete = async (log) => {
    try {
      const response = await bpService.createBPLog({
        systolic: log.systolic,
        diastolic: log.diastolic,
        pulse: log.pulse ?? null,
        date: utcDateString(log.log_date),
        measured_at: log.measured_at,
        notes: log.notes || undefined,
      });
      if (!response?.success || !response?.data) throw new Error('no row');
      await loadBPData({ silent: true });
      notify('Undone ✓', { tone: 'success' });
    } catch (error) {
      logger.error('Error undoing BP delete:', error);
      notify(errorMessage(error, 'Couldn’t undo — try again'), { tone: 'error' });
    }
  };

  const handleDeleteBP = async (logId) => {
    const log = bpLogs.find((l) => (l.id || l._id) === logId);
    try {
      const response = await bpService.deleteBPLog(logId);

      // `deleteBloodPressure` answers a Boolean; apiService wraps it as
      // `{ success: true, data: false }` when nothing was deleted, which
      // used to read as "deleted successfully".
      if (response?.success && response.data !== false) {
        await loadBPData({ silent: true });
        const what = log ? `${log.systolic}/${log.diastolic}` : 'that reading';
        const when = log?.log_date
          ? ` from ${shortDay(utcDateString(log.log_date))}`
          : '';
        // Same grammar as food: "Removed … · Undo", long enough to reach.
        notify(`Removed ${what}${when}`, {
          tone: 'info',
          duration: 10000,
          action: log ? (
            <Button size="small" sx={{ color: 'inherit', fontWeight: 700 }} onClick={() => undoDelete(log)}>
              Undo
            </Button>
          ) : undefined,
        });
      } else {
        notify('Couldn’t remove that reading. Try again.', { tone: 'error' });
      }
    } catch (error) {
      notify(errorMessage(error, 'Couldn’t remove that reading. Try again.'), { tone: 'error' });
      logger.error('Error deleting BP reading:', error);
    }
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

  return (
    // On a phone the page's last card clears the "Add BP" ThumbFab (visual
    // review C1): it used to sit over the end of the readings list.
    <Box sx={{ p: { xs: 2, sm: 3 }, pb: { xs: 'calc(88px + env(safe-area-inset-bottom))', md: 3 }, maxWidth: 960, mx: 'auto' }}>
      {/* Editorial header */}
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ color: 'text.secondary', fontSize: '1.0625rem' }}>
          Track your blood pressure and heart health over time.
        </Typography>
      </Box>

      {/* The answer first: the week's average, in words (review D-1). A
          brand-new account has no average, and on a phone its only way in
          was the floating button: give the page its own first step. */}
      <Box sx={{ mb: 3 }}>
        {bpLogs.length === 0 ? (
          <EmptyState
            icon={BPIcon}
            title="No readings yet"
            copy="Log a reading and I’ll show your average here."
            action={(
              <Button
                variant="contained"
                size="large"
                onClick={() => setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('add', '1');
                  return next;
                })}
                sx={{ minHeight: 56, fontWeight: 800 }}
              >
                Log your first reading
              </Button>
            )}
          />
        ) : (
          <BPInsights bpLogs={bpLogs} />
        )}
      </Box>

      {/* Charts. The range toggle sits ABOVE the donut and the trend it
          governs, and the donut's title names the window (review D-1). */}
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
              aria-label="Which readings to show"
              data-testid="bp-range-toggle"
              onChange={(_e, v) => { if (v) handleTimeRangeChange(v); }}
              sx={{
                '& .MuiToggleButton-root': {
                  minHeight: { xs: 44, sm: 34 },
                  minWidth: { xs: 56, sm: 44 },
                  fontSize: '0.8125rem',
                },
              }}
            >
              <ToggleButton value="7" aria-label="7 days">7d</ToggleButton>
              <ToggleButton value="30" aria-label="30 days">30d</ToggleButton>
              <ToggleButton value="365" aria-label="1 year">1y</ToggleButton>
              <ToggleButton value="all">All</ToggleButton>
            </ToggleButtonGroup>
            <Button
              onClick={() => setShowReport(true)}
              variant="tonal"
              size="small"
              startIcon={<PdfIcon />}
            >
              View report
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
            <SuspenseSurface rows={3} height={220}>
              <BPCategoryDistribution bpLogs={filteredBPLogs} windowLabel={RANGE_WORDS[timeRangeState]} />
            </SuspenseSurface>
          </Box>

          <Box sx={{ mb: 3 }}>
            <SuspenseSurface rows={4} height={320}>
              <BPChartNivo
                data={filteredBPLogs}
                title="Your blood pressure over time"
              />
            </SuspenseSurface>
          </Box>

          {/* Heart Rate series from Garmin */}
          {hrSeries && hrSeries.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <SuspenseSurface rows={4} height={300}>
                <BPHRChart data={hrSeries} title="Heart rate (Garmin)" />
              </SuspenseSurface>
            </Box>
          )}
        </>
      )}

      {/* Quick Add and Log List Grid */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <QuickAddBP
            onAdd={handleAddBP}
            unit="mmHg"
            autoOpen={autoOpenAdd}
            onAutoOpened={clearAddParam}
          />
        </Grid>
        {/* The empty state above already says "No readings yet". */}
        {bpLogs.length > 0 ? (
          <Grid item xs={12} sx={{ width: '100%' }}>
            <BPLogList
              logs={bpLogs}
              onDelete={handleDeleteBP}
              onEdit={handleEditBP}
              unit="mmHg"
            />
          </Grid>
        ) : null}
      </Grid>

      {/* Edit dialog — a separate instance from QuickAddBP's own "add"
          dialog, opened from a BPLogList row and pre-filled from it. See
          `handleEditBP` above. */}
      <AddBPDialog
        open={Boolean(editingLog)}
        onClose={handleCloseEdit}
        onAdd={handleSaveEditBP}
        mode="edit"
        initialValues={editingLog}
      />

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