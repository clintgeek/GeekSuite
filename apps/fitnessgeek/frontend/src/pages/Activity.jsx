import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Button,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import {
  DirectionsWalk as StepsIcon,
  FitnessCenter as WorkoutIcon,
  DirectionsRun as RunIcon,
  DirectionsBike as BikeIcon,
  Pool as SwimIcon,
  SportsGymnastics as GymIcon,
} from '@mui/icons-material';
import { GeekErrorState } from '@geeksuite/ui';
import Shell from './embeddedShell.jsx';
import { fitnessGeekService } from '../services/fitnessGeekService';
import { DisplayHeading, StatNumber, EmptyState, LabelPanel, FactHeadline, Rule, ListRow } from '../components/primitives';
import ConnectWatchCard from '../components/Reports/ConnectWatchCard.jsx';
import { EXPLAIN, hoursMinutes, sentenceWord } from '../components/Reports/watchWords.js';
import { localDateString } from '@geeksuite/utils';
import { errorMessage } from '../utils/errorMessage.js';
import { nearDay, clockTime } from '../utils/dates.js';
import { fmt } from '../utils/plainWords.js';

/** "today at 8:30 AM", "Thursday at 8:30 AM", "Oct 3 at 8:30 AM". */
const whenWords = (instant) => {
  const day = nearDay(instant);
  return `${day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day} at ${clockTime(instant)}`;
};

const rule = (t) => `1px solid ${t.palette.divider}`;

/** A run of headline numbers parted by hairlines: a name over a number, no
 * box around each. `cols` is the column count from `sm` up; a phone gets
 * `xsCols` (two, unless the run is three short numbers). */
const StatGrid = ({ children, cols = 4, xsCols = 2 }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: { xs: `repeat(${xsCols}, minmax(0, 1fr))`, sm: `repeat(${cols}, minmax(0, 1fr))` },
    }}
  >
    {React.Children.map(children, (child, index) => (
      React.isValidElement(child) ? React.cloneElement(child, { index, cols, xsCols }) : child
    ))}
  </Box>
);

/** One headline number in a StatGrid. The rules are drawn per breakpoint: a
 * hairline above every row but the first, and left of every column but the
 * first, whatever the column count is at that width. */
const Headline = ({ label, value, unit, index = 0, cols = 4, xsCols = 2 }) => (
  <Box
    sx={{
      py: 3,
      pr: 3,
      pl: { xs: index % xsCols ? 3 : 0, sm: index % cols ? 3 : 0 },
      borderTop: (t) => ({ xs: index >= xsCols ? rule(t) : 0, sm: index >= cols ? rule(t) : 0 }),
      borderLeft: (t) => ({ xs: index % xsCols ? rule(t) : 0, sm: index % cols ? rule(t) : 0 }),
      minWidth: 0,
    }}
  >
    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary', lineHeight: 1.2, mb: 1 }}>{label}</Typography>
    <StatNumber value={value} unit={unit} size="display" />
  </Box>
);

/** One row of the sleep card: a name (with an optional quiet note beside it
 * and a one-line plain explanation under it) and the number on the right. */
const Fact = ({ name, note, hint, value, first = false }) => (
  <ListRow first={first} sx={{ alignItems: 'baseline', py: 2.5 }}>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.3 }}>
        {name}
        {note && <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>{` · ${note}`}</Box>}
      </Typography>
      {hint && (
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.4, mt: 0.5 }}>{hint}</Typography>
      )}
    </Box>
    <Typography sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</Typography>
  </ListRow>
);

const activityIcons = {
  running: RunIcon,
  cycling: BikeIcon,
  swimming: SwimIcon,
  walking: StepsIcon,
  strength_training: GymIcon,
  default: WorkoutIcon,
};

const getActivityIcon = (type) => {
  const normalizedType = (type || '').toLowerCase().replace(/\s+/g, '_');
  return activityIcons[normalizedType] || activityIcons.default;
};

const ActivityCard = ({ activity, first }) => {
  const Icon = getActivityIcon(activity.activityType);
  const duration = activity.duration ? Math.round(activity.duration / 60) : null;
  const distance = activity.distance ? (activity.distance / 1000).toFixed(2) : null;
  const facts = [
    duration != null && `${duration} min`,
    distance && `${distance} km`,
    activity.averageHR && `${activity.averageHR} bpm avg`,
  ].filter(Boolean);

  return (
    <ListRow first={first} sx={{ alignItems: 'flex-start', py: 3 }}>
      <Icon sx={{ fontSize: 24, color: 'text.secondary', mt: 0.5, flexShrink: 0 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.3, textTransform: 'capitalize', overflowWrap: 'anywhere' }}
        >
          {activity.activityName || activity.activityType || 'Activity'}
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
          {[
            activity.startTimeLocal ? `${nearDay(activity.startTimeLocal)} at ${clockTime(activity.startTimeLocal)}` : null,
            ...facts,
          ].filter(Boolean).join(' · ') || 'Time not known'}
        </Typography>
      </Box>
      {activity.calories != null && (
        <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {`${fmt(activity.calories)} cal`}
        </Typography>
      )}
    </ListRow>
  );
};

const NO_FAILURES = { daily: false, sleep: false, activities: false };
const FAILED_NAMES = { daily: 'today’s numbers', sleep: 'last night’s sleep', activities: 'your recent activities' };

const Activity = ({ embedded = false }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [garminNotEnabled, setGarminNotEnabled] = useState(false);
  const [dailyData, setDailyData] = useState(null);
  const [sleepData, setSleepData] = useState(null);
  const [activities, setActivities] = useState([]);
  // Which of the three reads failed. A failed read is said in words; it is
  // never drawn as "no steps" or "no recent activities".
  const [failed, setFailed] = useState(NO_FAILURES);
  // "Refresh" at the foot of the page asks again without blanking it.
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    loadData();
    return () => { alive.current = false; };
  }, []);

  const loadData = async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const statusRes = await fitnessGeekService.getGarminStatus();
      if (!alive.current) return;

      if (!statusRes?.data?.enabled && !statusRes?.enabled) {
        setGarminNotEnabled(true);
        return;
      }
      setGarminNotEnabled(false);

      // The date is sent explicitly. Omitting it lets the resolver fall back
      // to the server's `new Date()`, and the containers run UTC — so after
      // 19:00 Central this page asked Garmin for TOMORROW and showed an empty
      // day. A server cannot know which day it is for its user; the client is
      // the only party that does.
      const today = localDateString();
      const [dailyRes, sleepRes, activitiesRes] = await Promise.allSettled([
        fitnessGeekService.getGarminDaily(today),
        fitnessGeekService.getGarminSleep(today),
        fitnessGeekService.getGarminActivities(0, 10),
      ]);
      if (!alive.current) return;

      const nowFailed = {
        daily: dailyRes.status === 'rejected',
        sleep: sleepRes.status === 'rejected',
        activities: activitiesRes.status === 'rejected',
      };
      // Nothing answered: that is the page failing, not three notes.
      if (nowFailed.daily && nowFailed.sleep && nowFailed.activities) {
        throw dailyRes.reason;
      }
      setFailed(nowFailed);

      // A source that failed keeps what it showed before (a quiet refresh
      // must not blank a card); one that answered replaces it.
      if (!nowFailed.daily) setDailyData(dailyRes.value?.data || dailyRes.value || null);
      if (!nowFailed.sleep) setSleepData(sleepRes.value?.data || sleepRes.value || null);
      if (!nowFailed.activities) {
        const acts = activitiesRes.value?.data || activitiesRes.value || [];
        setActivities(Array.isArray(acts) ? acts.filter(Boolean) : []);
      }
    } catch (err) {
      if (!alive.current) return;
      console.error('Error loading activity data:', err);
      setError(errorMessage(err, 'Couldn’t load your activity. Try again.'));
    } finally {
      if (alive.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const header = !embedded && <DisplayHeading size="page">Activity</DisplayHeading>;

  if (loading) {
    return (
      <Shell embedded={embedded}>
        {header}
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
          <CircularProgress aria-label="Loading your activity" />
        </Box>
      </Shell>
    );
  }

  // No watch: one friendly card and nothing else. No empty panels.
  if (garminNotEnabled) {
    return (
      <Shell embedded={embedded}>
        {header}
        <ConnectWatchCard
          copy="Connect a Garmin watch to see steps, sleep, heart rate and workouts here."
          action={(
            <Button component={RouterLink} to="/settings#garmin" variant="contained">
              Connect Garmin
            </Button>
          )}
        />
      </Shell>
    );
  }

  // The read failed: say so, and only that. An empty "Recent activities"
  // under an error reads as "you did nothing".
  if (error) {
    return (
      <Shell embedded={embedded}>
        {header}
        <GeekErrorState title="Couldn’t load your activity" error={error} onRetry={() => loadData()} />
      </Shell>
    );
  }

  const sleepText = dailyData?.sleepMinutes != null ? hoursMinutes(dailyData.sleepMinutes) : null;
  const sleep = sleepData || {};
  const sleepFacts = [
    sleep.deepSleepMinutes != null && ['Deep', hoursMinutes(sleep.deepSleepMinutes)],
    sleep.lightSleepMinutes != null && ['Light', hoursMinutes(sleep.lightSleepMinutes)],
    sleep.remSleepMinutes != null && ['REM (dreaming)', hoursMinutes(sleep.remSleepMinutes)],
    sleep.awakeSleepMinutes != null && ['Awake', hoursMinutes(sleep.awakeSleepMinutes)],
  ].filter(Boolean);
  const signed = (n) => `${Number(n) > 0 ? '+' : ''}${n}`;
  // [name, value, quiet note, plain explanation]
  const overnight = [
    sleep.avgOvernightHrv && ['Heart-rate variability (HRV)', `${sleep.avgOvernightHrv} ms`, sentenceWord(sleep.hrvStatus) || null, EXPLAIN.hrv],
    sleep.bodyBatteryChange != null && ['Body Battery', signed(sleep.bodyBatteryChange), 'overnight', EXPLAIN.bodyBattery],
    sleep.avgSleepStress != null && ['Stress while asleep', sleep.avgSleepStress, null, EXPLAIN.stress],
    sleep.avgRespiration && ['Breaths a minute', `${Math.round(sleep.avgRespiration * 10) / 10}`,
      sleep.minRespiration && sleep.maxRespiration ? `${sleep.minRespiration}–${sleep.maxRespiration}` : null, null],
    sleep.avgSpO2 && ['Blood oxygen (SpO₂)', `${sleep.avgSpO2}%`, sleep.minSpO2 ? `lowest ${sleep.minSpO2}%` : null, null],
    sleep.restlessMoments != null && ['Restless moments', sleep.restlessMoments, null, null],
    sleep.awakeCount != null && ['Times awake', sleep.awakeCount, null, null],
  ].filter(Boolean);
  const hasSleepDetail = !!sleep.sleepScore || sleepFacts.length > 0 || overnight.length > 0;

  const failedNames = Object.keys(FAILED_NAMES).filter((k) => failed[k]).map((k) => FAILED_NAMES[k]);
  // Connected, everything answered, and there is nothing yet: one sentence,
  // not three empty cards.
  const nothingYet = !dailyData && !sleepData && activities.length === 0 && failedNames.length === 0;

  const gap = { xs: 3, md: 4 };

  return (
    <Shell embedded={embedded}>
      {header}

      {failedNames.length > 0 && (
        <Box
          role="alert"
          data-testid="activity-partial-failure"
          sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}
        >
          <Typography sx={{ flex: '1 1 220px', fontSize: '0.9375rem' }}>
            {`Couldn’t load ${failedNames.join(' or ')}. The rest is up to date.`}
          </Typography>
          <Button variant="tonal" onClick={() => loadData({ quiet: true })} disabled={refreshing} sx={{ minHeight: 44 }}>
            Try again
          </Button>
        </Box>
      )}

      {nothingYet ? (
        <EmptyState
          icon={WorkoutIcon}
          title="Nothing from your watch yet"
          copy="Steps, sleep and workouts show here after your watch syncs with Garmin Connect."
        />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap, alignItems: 'start' }}>
          {dailyData && (
            <LabelPanel title="Today so far" level={1} sx={{ gridColumn: { md: '1 / -1' } }}>
              <StatGrid>
                <Headline label="Steps" value={dailyData.steps != null ? fmt(dailyData.steps) : null} />
                <Headline label="Calories from activity" value={dailyData.activeCalories != null ? fmt(dailyData.activeCalories) : null} unit="cal" />
                <Headline label="Resting heart rate" value={dailyData.restingHR} unit="bpm" />
                <Headline label="Sleep" value={sleepText} />
              </StatGrid>
            </LabelPanel>
          )}

          {dailyData?.heartRate && (
            <LabelPanel title="Heart rate today" sx={{ gridColumn: { md: '1 / -1' } }}>
              <StatGrid cols={3} xsCols={3}>
                <Headline label="Lowest" value={dailyData.heartRate.minHeartRate} unit="bpm" />
                <Headline label="Resting" value={dailyData.heartRate.restingHeartRate || dailyData.restingHR} unit="bpm" />
                <Headline label="Highest" value={dailyData.heartRate.maxHeartRate} unit="bpm" />
              </StatGrid>
            </LabelPanel>
          )}

          {/* From md up the night sits beside the workouts, so neither
              leaves half the row empty. */}
          {sleepData && (
            <LabelPanel
              title="Last night’s sleep"
              data-testid="activity-sleep"
              meta={(sleep.sleepStartTime || sleep.sleepEndTime) ? (
                <>
                  {sleep.sleepStartTime && clockTime(sleep.sleepStartTime)}
                  {sleep.sleepStartTime && sleep.sleepEndTime && ' to '}
                  {sleep.sleepEndTime && clockTime(sleep.sleepEndTime)}
                </>
              ) : undefined}
            >
              {sleep.sleepScore ? (
                <>
                  <FactHeadline name="Sleep score" value={sleep.sleepScore} />
                  <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }}>{EXPLAIN.sleepScore}</Typography>
                </>
              ) : null}

              {!hasSleepDetail && (
                <Box sx={{ py: 2 }}>
                  <Typography sx={{ fontWeight: 600 }}>No sleep details for last night yet</Typography>
                  <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }}>
                    They show up after your watch syncs with Garmin Connect.
                  </Typography>
                </Box>
              )}

              {sleepFacts.length > 0 && (
                <>
                  <Rule sx={{ mt: 3 }} />
                  {sleepFacts.map(([name, amount], i) => (
                    <Fact key={name} first={i === 0} name={name} value={amount} />
                  ))}
                </>
              )}

              {overnight.length > 0 && (
                <>
                  <Rule sx={{ mt: 1 }} />
                  {overnight.map(([name, amount, note, hint], i) => (
                    <Fact key={name} first={i === 0} name={name} note={note} hint={hint} value={amount} />
                  ))}
                </>
              )}

              {sleep.sleepInsight && (
                <Typography sx={{ mt: 2, fontSize: '0.8125rem', color: 'text.secondary' }}>
                  {`Garmin’s note: ${String(sleep.sleepInsight).replace(/_/g, ' ').toLowerCase()}.`}
                </Typography>
              )}
            </LabelPanel>
          )}

          <LabelPanel title="Recent activities" sx={{ gridColumn: { md: sleepData ? 'auto' : '1 / -1' } }}>
            {failed.activities && activities.length === 0 ? (
              <Typography data-testid="activities-failed" sx={{ color: 'text.secondary', fontSize: '0.9375rem', py: 1 }}>
                Couldn’t load your recent activities.
              </Typography>
            ) : activities.length > 0 ? (
              activities.map((activity, index) => (
                <ActivityCard key={activity.activityId || index} activity={activity} first={index === 0} />
              ))
            ) : (
              <Typography data-testid="activities-empty" sx={{ color: 'text.secondary', fontSize: '0.9375rem', py: 1 }}>
                No workouts yet. They show here after your watch syncs.
              </Typography>
            )}
          </LabelPanel>
        </Box>
      )}

      {/* When it was last fetched, and a way to fetch again. Garmin syncs
          through the day, and the only way to see a walk that just synced
          was to leave and come back. It is also the page's one control: the
          shell's scrolling <main> held nothing that could take focus, so a
          keyboard couldn't scroll it (axe scrollable-region-focusable). */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        {dailyData?.fetchedAt && (
          <Typography variant="caption" color="text.secondary">
            {`Updated ${whenWords(dailyData.fetchedAt)}`}
          </Typography>
        )}
        <Button
          onClick={() => loadData({ quiet: true })}
          disabled={refreshing}
          data-testid="activity-refresh"
          sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </Box>
    </Shell>
  );
};

export default Activity;
