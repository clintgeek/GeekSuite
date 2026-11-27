import React, { lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button } from '@mui/material';
import { CloudOff as CloudOffIcon } from '@mui/icons-material';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';
import { utcDateString } from '@geeksuite/utils';
import { shortDay } from '../utils/dates.js';
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
import { EmptyState, Page, SurfaceSkeleton, SuspenseSurface } from '../components/primitives';
import { useExperience } from '../contexts/ExperienceContext.jsx';

// The timeline is the only thing on this page that needs Nivo (~530 kB raw
// with @react-spring and the d3 scales behind it). Deferring it lets the
// quick-add, the number and the log list paint first; the boundary reserves the
// chart's height so nothing below it moves when the chart arrives.
const WeightTimeline = lazy(() => import('../components/Weight/WeightTimeline.jsx'));

const Weight = () => {
  const { goal: firstRunGoal } = useExperience();
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
    loadWeightData,
    clearSuccessMessage,
    clearErrorMessage,
    goalLoadFailed
  } = useWeight();
  // Body composition is its own hook with its own error state: a failed
  // body-comp query ends in an error card in that section, never here.
  const bodyComp = useBodyComp();
  const { notify } = useToast();

  // "See it on your Weight page" (Import a scan) lands on
  // `/weight#body-composition`: once both halves have drawn, bring the
  // section into view. On a phone it sits below the trend chart.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash !== '#body-composition' || loading || bodyComp.loading) return;
    document.getElementById('body-composition')?.scrollIntoView?.({ block: 'start' });
  }, [hash, loading, bodyComp.loading]);

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
    const n = parseFloat(log?.weight_value);
    const what = Number.isFinite(n) ? `${n.toFixed(1)} lb` : 'that weight';
    const when = log?.log_date
      ? ` from ${shortDay(utcDateString(log.log_date))}`
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

  // A FAILED READ IS NOT AN EMPTY LOG. `useWeight` reports a failed load only
  // as a 3-second message, and leaves `weightLogs` empty, so the page used to
  // draw a brand-new account ("No weigh-ins yet", "No weight goal yet") for
  // someone with a year of weigh-ins on a bad signal. Only a load flips
  // `loading`, so an error that arrives while it is true (or on the render
  // that clears it) is the load's; a failed save, delete or undo never is.
  const [loadProblem, setLoadProblem] = useState(false);
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (error && (loading || wasLoading.current)) setLoadProblem(true);
    wasLoading.current = loading;
  }, [error, loading]);
  // Any row on screen means there is something true to show.
  const failedToLoad = loadProblem && weightLogs.length === 0;
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    setLoadProblem(false);
    try {
      await loadWeightData();
    } finally {
      setRetrying(false);
    }
  };

  const gap = { xs: 4, md: 5 };

  if (loading) {
    // The shape of the page that is coming, not a spinner in a void.
    return (
      <Page aria-busy="true" data-testid="weight-loading">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '400px minmax(0, 1fr)' }, gap, alignItems: 'start' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap }}>
            <SurfaceSkeleton rows={0} />
            <SurfaceSkeleton rows={4} />
          </Box>
          <SurfaceSkeleton rows={4} height={320} />
        </Box>
      </Page>
    );
  }

  if (failedToLoad) {
    return (
      <Page>
        <EmptyState
          role="alert"
          icon={CloudOffIcon}
          title="Your weights didn’t load"
          copy="Nothing is lost. Check your connection and try again."
          action={(
            <Button variant="contained" onClick={retry} disabled={retrying} sx={{ minHeight: 48 }}>
              {retrying ? 'Trying…' : 'Try again'}
            </Button>
          )}
        />
      </Page>
    );
  }

  const hasLogs = weightLogs.length > 0;
  // Phone: one column, in the order a person needs it: the weigh-in, the
  // number, the trend, body composition, the log. From md: two columns that
  // pack independently (weigh-in, number and log on the left at about 400px;
  // the trend and body composition wide on the right). On a phone the two
  // column wrappers dissolve (`display: contents`) and `order` puts the
  // charts between the number and the log.
  const column = { display: { xs: 'contents', md: 'flex' }, flexDirection: 'column', gap, minWidth: 0 };

  return (
    <Page>
      <Box
        sx={{
          display: { xs: 'flex', md: 'grid' },
          flexDirection: 'column',
          gridTemplateColumns: '400px minmax(0, 1fr)',
          gap,
          alignItems: { md: 'start' },
        }}
      >
        <Box sx={column}>
          <Box sx={{ order: 1 }}>
            <QuickAddWeight
              onAdd={addWeightLog}
              existingLogs={weightLogs}
              unit="lbs"
              autoOpen={autoOpenAdd}
              onAutoOpened={clearAddParam}
            />
          </Box>
          <Box sx={{ order: 2 }}>
            <WeightProgress
              weightLogs={weightLogs}
              goal={weightGoal}
              currentWeight={currentWeight}
              unit="lbs"
              firstRunGoal={firstRunGoal}
              goalUnknown={Boolean(goalLoadFailed) && !weightGoal}
              onRetryGoal={loadWeightData}
              onEditGoal={() => navigate('/calorie-wizard')}
            />
          </Box>
          <Box sx={{ order: 5 }}>
            <WeightLogList
              logs={weightLogs}
              onDelete={handleDelete}
              onUpdate={updateWeightLog}
              unit="lbs"
            />
          </Box>
        </Box>

        <Box sx={column}>
          {/* No weigh-ins, no chart: the log's own empty state says what to
              do, once. */}
          {hasLogs && (
            <Box sx={{ order: 3, minWidth: 0 }}>
              <SuspenseSurface rows={4} height={320}>
                <WeightTimeline
                  weightLogs={weightLogs}
                  goal={weightGoal}
                  unit="lbs"
                />
              </SuspenseSurface>
            </Box>
          )}

          {/* Body composition: one tidy summary for a person with scans (the
              rest behind "More from your scans"); one quiet line for
              everyone else. */}
          <Box sx={{ order: 4, minWidth: 0, '&:empty': { display: 'none' } }}>
            <BodyCompositionSection
              summary={bodyComp.summary}
              scans={bodyComp.scans}
              loading={bodyComp.loading}
              error={bodyComp.error}
              scansError={bodyComp.scansError}
              onRetry={bodyComp.reload}
              defaultOpen={hash === '#body-composition'}
            />
          </Box>
        </Box>
      </Box>
    </Page>
  );
};

export default Weight;
