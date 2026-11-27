import React, { lazy, Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Typography,
  Box,
  Button,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import {
  MonitorHeart as BPIcon,
  CloudOff as CloudOffIcon,
  PictureAsPdf as PdfIcon
} from '@mui/icons-material';
import { useToast } from '@geeksuite/ui';
import { EmptyState, Page, SurfaceSkeleton, SuspenseSurface } from '../components/primitives';
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

// The "Readings by range" card's title names the window the range toggle chose.
const RANGE_WORDS = { '7': 'last 7 days', '30': 'last 30 days', '365': 'last year', all: 'all time' };
const BPHRChart = lazy(() => import('../components/BloodPressure/BPHRChart.jsx'));
const BPReport = lazy(() => import('../components/BloodPressure/BPReport.jsx'));

const BloodPressure = () => {
  const { notify } = useToast();
  const [bpLogs, setBPLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadProblem, setLoadProblem] = useState(false);
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
  //
  // A FAILED READ IS NOT "NO READINGS". A failed first load used to leave
  // `bpLogs` empty with only a toast, so the page drew a brand-new account's
  // "No readings yet" for someone with a year of readings and a bad signal.
  // `loadProblem` is that failure; the page says so and offers a retry. A
  // failed refresh behind readings already on screen keeps them and toasts.
  const loadBPData = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const failed = (message) => {
      if (silent) notify(message, { tone: 'error' });
      else setLoadProblem(true);
    };
    try {
      const response = await bpService.getBPLogs();
      if (response?.success && Array.isArray(response.data)) {
        setBPLogs(response.data.filter(Boolean));
        setLoadProblem(false);
      } else {
        failed('Couldn’t load your blood pressure readings. Try again.');
      }
    } catch (error) {
      failed(errorMessage(error, 'Couldn’t load your blood pressure readings. Try again.'));
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
      // inline (and for a duplicate offers to save it a minute later, naming
      // both times), so no second toast here.
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

  const gap = { xs: 4, md: 5 };
  const twoColumns = {
    display: { xs: 'flex', md: 'grid' },
    flexDirection: 'column',
    gridTemplateColumns: '400px minmax(0, 1fr)',
    gap,
    alignItems: { md: 'start' },
  };

  if (loading) {
    // The shape of the page that is coming, not a spinner in a void.
    return (
      <Page aria-busy="true" data-testid="bp-loading">
        <Box sx={twoColumns}>
          <SurfaceSkeleton rows={4} />
          <SurfaceSkeleton rows={4} height={320} />
        </Box>
      </Page>
    );
  }

  if (loadProblem && bpLogs.length === 0) {
    return (
      <Page>
        <EmptyState
          role="alert"
          icon={CloudOffIcon}
          title="Your readings didn’t load"
          copy="Nothing is lost. Check your connection and try again."
          action={(
            <Button variant="contained" onClick={() => loadBPData()} sx={{ minHeight: 48 }}>
              Try again
            </Button>
          )}
        />
      </Page>
    );
  }

  const hasLogs = bpLogs.length > 0;
  // Phone: one column, in the order a person needs it: log a reading, the
  // number, the charts, the readings. From md: two columns that pack
  // independently (the entry card, the number and the readings on the left
  // at about 400px; the range toggle and the charts it governs wide on the
  // right). On a phone the two column wrappers dissolve (`display:
  // contents`) and `order` puts the charts between the number and the list.
  const column = { display: { xs: 'contents', md: 'flex' }, flexDirection: 'column', gap, minWidth: 0 };

  return (
    <Page>
      <Box sx={twoColumns}>
        <Box sx={column}>
          {/* The entry first: one filled button on a phone, a card from md. */}
          <Box sx={{ order: 1 }}>
            <QuickAddBP
              onAdd={handleAddBP}
              autoOpen={autoOpenAdd}
              onAutoOpened={clearAddParam}
            />
          </Box>

          {hasLogs && (
            <>
              {/* The answer next: the week's average, and one sentence that
                  squares it with the latest reading (review D-1). */}
              <Box sx={{ order: 2 }}>
                <BPInsights bpLogs={bpLogs} />
              </Box>
              <Box sx={{ order: 5 }}>
                <BPLogList
                  logs={bpLogs}
                  onDelete={handleDeleteBP}
                  onEdit={handleEditBP}
                />
              </Box>
            </>
          )}
        </Box>

        <Box sx={column}>
          {!hasLogs ? (
            /* A brand-new account: one friendly card. The button above (the
               card, from md) is the way in, so this has no second one. */
            <Box sx={{ order: 2 }}>
              <EmptyState
                icon={BPIcon}
                title="No readings yet"
                copy="Log a reading and your average, your trend and every reading show up here."
              />
            </Box>
          ) : (
            <>
              {/* Time range and "View report" in one row. The range toggle
                  sits ABOVE the donut and the trend it governs, and the
                  donut's title names the window (review D-1). */}
              <Box sx={{ order: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
                {/* Whole words ("7 days", never "7d"). On a phone the control
                    takes the full row and its four segments share it, so the
                    words fit at 390px without wrapping; if a larger text size
                    ever makes them too wide it scrolls sideways inside its own
                    track rather than pushing the page. */}
                <ToggleButtonGroup
                  size="small"
                  value={timeRangeState}
                  exclusive
                  aria-label="Which readings to show"
                  data-testid="bp-range-toggle"
                  onChange={(_e, v) => { if (v) handleTimeRangeChange(v); }}
                  sx={{
                    width: { xs: '100%', sm: 'auto' },
                    overflowX: 'auto',
                    '& .MuiToggleButton-root': {
                      flex: { xs: '1 0 auto', sm: '0 0 auto' },
                      minHeight: { xs: 44, sm: 34 },
                      fontSize: '0.8125rem',
                      whiteSpace: 'nowrap',
                      // A touch tablet is not a mouse: keep the 44px target.
                      '@media (pointer: coarse)': { minHeight: 44 },
                    },
                  }}
                >
                  <ToggleButton value="7">7 days</ToggleButton>
                  <ToggleButton value="30">30 days</ToggleButton>
                  <ToggleButton value="365">1 year</ToggleButton>
                  <ToggleButton value="all">All</ToggleButton>
                </ToggleButtonGroup>
                {/* Second rank: the page's one filled button is the entry. */}
                <Button
                  onClick={() => setShowReport(true)}
                  variant="tonal"
                  startIcon={<PdfIcon />}
                  sx={{ minHeight: 44 }}
                >
                  View report
                </Button>
                {insufficientDataMessage && (
                  <Typography sx={{ flexBasis: '100%', fontSize: '0.875rem', color: 'text.secondary' }}>
                    {insufficientDataMessage}
                  </Typography>
                )}
              </Box>

              <Box sx={{ order: 3, minWidth: 0 }}>
                <SuspenseSurface rows={3} height={220}>
                  <BPCategoryDistribution bpLogs={filteredBPLogs} windowLabel={RANGE_WORDS[timeRangeState]} />
                </SuspenseSurface>
              </Box>

              <Box sx={{ order: 3, minWidth: 0 }}>
                <SuspenseSurface rows={4} height={320}>
                  <BPChartNivo
                    data={filteredBPLogs}
                    title="Your blood pressure over time"
                  />
                </SuspenseSurface>
              </Box>

              {/* Today's heart rate, only for a person whose watch sends it. */}
              {hrSeries && hrSeries.length > 0 && (
                <Box sx={{ order: 4, minWidth: 0 }}>
                  <SuspenseSurface rows={4} height={300}>
                    <BPHRChart data={hrSeries} title="Heart rate today, from your watch" />
                  </SuspenseSurface>
                </Box>
              )}
            </>
          )}
        </Box>
      </Box>

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
    </Page>
  );
};

export default BloodPressure;
