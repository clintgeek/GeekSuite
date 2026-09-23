import React, { lazy, useEffect } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';
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
import { SectionLabel, DisplayHeading, SuspenseSurface } from '../components/primitives';

// The timeline is the only thing on this page that needs Nivo (~530 kB raw
// with @react-spring and the d3 scales behind it). Deferring it lets the
// progress ring, quick-add and log list paint first; the boundary reserves the
// chart's height so nothing below it moves when the chart arrives.
const WeightTimeline = lazy(() => import('../components/Weight/WeightTimeline.jsx'));

const Weight = () => {
  const navigate = useNavigate();

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
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 960, mx: 'auto' }}>
      {/* Editorial header */}
      <Box sx={{ mb: 3 }}>
        <SectionLabel sx={{ mb: 0.75 }}>Tracking · Weight &amp; body</SectionLabel>
        <DisplayHeading size="page">Weight &amp; body</DisplayHeading>
        <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
          Your weight and what it&rsquo;s made of, averaged so one water day doesn&rsquo;t move the needle.
        </Typography>
      </Box>

      {/* Progress Card */}
      <Box sx={{ mb: 3 }}>
        <WeightProgress
          weightLogs={weightLogs}
          goal={weightGoal}
          currentWeight={currentWeight}
          unit="lbs"
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

      {/* Body composition — summary, change, fat/lean trend */}
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

      {/* Quick Add Weight (desktop card; the FAB on phones) */}
      <Box sx={{ mb: 3 }}>
        <QuickAddWeight onAdd={addWeightLog} unit="lbs" />
      </Box>

      {/* Weight Log List */}
      <Box sx={{ mb: 3 }}>
        <WeightLogList
          logs={weightLogs}
          onDelete={deleteWeightLog}
          onUpdate={updateWeightLog}
          unit="lbs"
        />
      </Box>
    </Box>
  );
};

export default Weight;