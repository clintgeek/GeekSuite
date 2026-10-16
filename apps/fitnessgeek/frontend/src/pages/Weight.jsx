import React, { lazy, useCallback, useEffect } from 'react';
import { Box, Button, Typography, CircularProgress } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';
import { displayCalendarDate } from '@geeksuite/utils';
import { useWeight } from '../hooks/useWeight.js';
import { useBodyComp } from '../hooks/useBodyComp.js';
// Imported by file, not through `../components/Weight`. The barrel used to
// re-export the legacy WeightChart/WeightChartNivo/WeightSparkline* set, and
// nothing in this workspace declares `sideEffects: false` — so rollup kept
// those modules' top-level side effects even after shaking their bindings, and
// @nivo/line came back into this page's chunk as a bare side-effect import,
// undoing the lazy boundary below. Q52a deleted those five modules, but the
// by-file imports stay: the hazard is the barrel, not those particular files,
// and it comes back the moment anything chart-shaped is re-exported there.
import WeightProgress from '../components/Weight/WeightProgress.jsx';
import QuickAddWeight from '../components/Weight/QuickAddWeight.jsx';
import WeightLogList from '../components/Weight/WeightLogList.jsx';
import BodyCompositionSection from '../components/BodyComposition/BodyCompositionSection.jsx';
import { SuspenseSurface } from '../components/primitives';
import { useExperience } from '../contexts/ExperienceContext.jsx';

// The timeline is the only thing on this page that needs Nivo (~530 kB raw
// with @react-spring and the d3 scales behind it). Deferring it lets the
// progress ring, quick-add and log list paint first; the boundary reserves the
// chart's height so nothing below it moves when the chart arrives.
const WeightTimeline = lazy(() => import('../components/Weight/WeightTimeline.jsx'));

const Weight = () => {
  const { isSimple, goal: firstRunGoal } = useExperience();
  const navigate = useNavigate();
  // `?add=1` — the Today strip's "Weigh in" — opens the weight dialog directly.
  const [searchParams, setSearchParams] = useSearchParams();
  const autoOpenAdd = searchParams.get('add') === '1';
  const clearAddParam = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('add');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Use custom hook for weight operations
  const {
    weightLogs,
    weightGoal,
    loading,
    success,
    error,
    currentWeight,
    addWeightLog,
    updateWeightLog,
    deleteWeightLog,
    restoreWeightLog,
    clearSuccessMessage,
    clearErrorMessage
  } = useWeight();
  // Body composition is its own hook with its own error state: a failed
  // body-comp query ends in an error card in that section, never here.
  const bodyComp = useBodyComp();
  const { notify } = useToast();

  // Success/error come from useWeight's own auto-clearing state; forward each
  // to the shared toast stack in place of the local Snackbar pair, then clear
  // the source so a re-render doesn't re-fire it.
  useEffect(() => {
    if (!success) return;
    notify(success, { tone: 'success' });
    clearSuccessMessage();
  }, [success, notify, clearSuccessMessage]);

  useEffect(() => {
    if (!error) return;
    notify(error, { tone: 'error' });
    clearErrorMessage();
  }, [error, notify, clearErrorMessage]);

  // Delete with an Undo, the same grammar as food: "Removed … · Undo". One
  // mis-tap on the trash beside the pencil used to be permanent (B18).
  const handleDelete = async (logId) => {
    const log = weightLogs.find((l) => l.id === logId);
    const removed = await deleteWeightLog(logId);
    if (!removed) return; // the hook has already said why
    const what = log ? `${parseFloat(log.weight_value).toFixed(1)} lbs` : 'that weight';
    const when = log?.log_date
      ? ` from ${displayCalendarDate(log.log_date, 'en-US', { month: 'short', day: 'numeric' })}`
      : '';
    notify(`Removed ${what}${when}`, {
      tone: 'info',
      duration: 10000,
      action: log ? (
        <Button size="small" sx={{ color: 'inherit', fontWeight: 700 }} onClick={() => restoreWeightLog(log)}>
          Undo
        </Button>
      ) : undefined,
    });
  };

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh'
      }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  return (
    // Bottom padding clears the thumb-zone "Log weight" button (plan item 8).
    <Box sx={{ p: { xs: 2, sm: 3 }, pb: { xs: 14, md: 6 }, maxWidth: 960, mx: 'auto' }}>
      {/* The top bar says "Weight"; one plain line says what's here. */}
      <Typography sx={{ color: 'text.secondary', fontSize: '1.0625rem', mb: 2.5 }}>
        {isSimple
          ? 'Your weight over time, averaged so one heavy day doesn’t move the needle.'
          : 'Your weight and what it’s made of, averaged so one water day doesn’t move the needle.'}
      </Typography>

      {/* Progress Card */}
      <Box sx={{ mb: 3 }}>
        <WeightProgress
          weightLogs={weightLogs}
          goal={weightGoal}
          currentWeight={currentWeight}
          unit="lbs"
          firstRunGoal={firstRunGoal}
          onEditGoal={() => navigate('/calorie-wizard')}
        />
      </Box>

      {/* Timeline Chart */}
      <Box sx={{ mb: 3 }}>
        <SuspenseSurface rows={4} height={320}>
          <WeightTimeline
            weightLogs={weightLogs}
            goal={weightGoal}
            unit="lbs"
          />
        </SuspenseSurface>
      </Box>

      {/* Body composition — summary, change, fat/lean trend. Full only: body
          composition is one of the things Simple keeps out of the way. */}
      {!isSimple && (
      <Box sx={{ mb: 3 }}>
        <BodyCompositionSection
          summary={bodyComp.summary}
          scans={bodyComp.scans}
          loading={bodyComp.loading}
          error={bodyComp.error}
          scansError={bodyComp.scansError}
          onRetry={bodyComp.reload}
        />
      </Box>
      )}

      {/* Quick Add Weight (desktop card; the FAB on phones) */}
      <Box sx={{ mb: 3 }}>
        <QuickAddWeight
          onAdd={addWeightLog}
          unit="lbs"
          autoOpen={autoOpenAdd}
          onAutoOpened={clearAddParam}
        />
      </Box>

      {/* Weight Log List */}
      <Box sx={{ mb: 3 }}>
        <WeightLogList
          logs={weightLogs}
          onDelete={handleDelete}
          onUpdate={updateWeightLog}
          unit="lbs"
        />
      </Box>
    </Box>
  );
};

export default Weight;