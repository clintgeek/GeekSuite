import React, { useState, useEffect } from 'react';
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
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';
import { fitnessGeekService } from '../services/fitnessGeekService';
import { DisplayHeading, StatNumber, EmptyState, LabelPanel, FactHeadline, FactRow, Rule, ListRow, Page } from '../components/primitives';
import { localDateString } from '@geeksuite/utils';
import { errorMessage } from '../utils/errorMessage.js';
import { nearDay, clockTime } from '../utils/dates.js';
import { fmt } from '../utils/plainWords.js';

/** "today at 8:30 AM", "Thursday at 8:30 AM", "Oct 3 at 8:30 AM". */
const whenWords = (instant) => {
  const day = nearDay(instant);
  return `${day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day} at ${clockTime(instant)}`;
};

/** "7h 4m" from minutes. */
const hm = (minutes = 0) => `${minutes >= 60 ? `${Math.floor(minutes / 60)}h ` : ''}${minutes % 60}m`;

/** A run of headline numbers separated by hairlines: a name over a
 * number, no box around each. `cols` is the column count from `sm` up; a
 * phone gets two. */
const StatGrid = ({ children, cols = 4 }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: `repeat(${cols}, minmax(0, 1fr))` },
      mt: 1,
    }}
  >
    {children}
  </Box>
);

/** One headline number in a StatGrid. */
const Headline = ({ label, value, unit, index = 0, cols = 4 }) => (
  <Box
    sx={{
      py: 1.25,
      pr: 1.5,
      pl: { xs: index % 2 ? 1.5 : 0, sm: index % cols ? 1.5 : 0 },
      borderTop: (t) => (index >= 2 ? `1px solid ${t.palette.divider}` : 0),
      borderLeft: (t) => ({ xs: index % 2 ? `1px solid ${t.palette.divider}` : 0, sm: index % cols ? `1px solid ${t.palette.divider}` : 0 }),
      minWidth: 0,
    }}
  >
    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, lineHeight: 1.2, mb: 0.5 }}>{label}</Typography>
    <StatNumber value={value} unit={unit} size="display" />
  </Box>
);

// Activity type icons
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
    <ListRow first={first} sx={{ alignItems: 'flex-start', py: 1.5 }}>
      <Icon sx={{ fontSize: 24, color: 'text.primary', mt: 0.25, flexShrink: 0 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{ fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.25, textTransform: 'capitalize', overflowWrap: 'anywhere' }}
        >
          {activity.activityName || activity.activityType || 'Activity'}
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.25 }}>
          {activity.startTimeLocal ? `${nearDay(activity.startTimeLocal)} at ${clockTime(activity.startTimeLocal)}` : 'Time not known'}
        </Typography>
        {facts.length > 0 && (
          <Typography sx={{ fontSize: '0.9375rem', mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
            {facts.join(' · ')}
          </Typography>
        )}
      </Box>
      {activity.calories != null && (
        <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {`${fmt(activity.calories)} cal`}
        </Typography>
      )}
    </ListRow>
  );
};

const Activity = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [garminNotEnabled, setGarminNotEnabled] = useState(false);
  const [dailyData, setDailyData] = useState(null);
  const [sleepData, setSleepData] = useState(null);
  const [activities, setActivities] = useState([]);
  const [garminStatus, setGarminStatus] = useState(null);
  // "Refresh" at the foot of the page asks again without blanking it.
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setGarminNotEnabled(false);

    try {
      // Check Garmin status first
      const statusRes = await fitnessGeekService.getGarminStatus();
      setGarminStatus(statusRes?.data || statusRes);

      if (!statusRes?.data?.enabled && !statusRes?.enabled) {
        setGarminNotEnabled(true);
        setLoading(false);
        return;
      }

      // Fetch daily summary, sleep details, and activities in parallel.
      //
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

      if (dailyRes.status === 'fulfilled') {
        setDailyData(dailyRes.value?.data || dailyRes.value);
      }

      if (sleepRes.status === 'fulfilled') {
        setSleepData(sleepRes.value?.data || sleepRes.value);
      }

      if (activitiesRes.status === 'fulfilled') {
        const acts = activitiesRes.value?.data || activitiesRes.value || [];
        setActivities(Array.isArray(acts) ? acts : []);
      }
    } catch (err) {
      console.error('Error loading activity data:', err);
      setError(errorMessage(err, "Couldn’t load your activity. Try again."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const sleepText = dailyData?.sleepMinutes != null
    ? `${Math.floor(dailyData.sleepMinutes / 60)}h ${dailyData.sleepMinutes % 60}m`
    : null;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  const sleepFacts = sleepData && [
    sleepData.deepSleepMinutes != null && ['Deep', hm(sleepData.deepSleepMinutes)],
    sleepData.lightSleepMinutes != null && ['Light', hm(sleepData.lightSleepMinutes)],
    sleepData.remSleepMinutes != null && ['REM', hm(sleepData.remSleepMinutes)],
    sleepData.awakeSleepMinutes != null && ['Awake', hm(sleepData.awakeSleepMinutes)],
  ].filter(Boolean);
  const overnight = sleepData && [
    sleepData.avgSpO2 && ['Avg SpO₂', `${sleepData.avgSpO2}%`, sleepData.minSpO2 ? `Low: ${sleepData.minSpO2}%` : null],
    sleepData.avgOvernightHrv && ['Heart-rate variability (HRV)', `${sleepData.avgOvernightHrv} ms`, sleepData.hrvStatus || null],
    sleepData.avgRespiration && ['Breaths a minute', `${Math.round(sleepData.avgRespiration * 10) / 10}`,
      sleepData.minRespiration && sleepData.maxRespiration ? `${sleepData.minRespiration}–${sleepData.maxRespiration}` : null],
    sleepData.bodyBatteryChange != null && ['Body Battery', `+${sleepData.bodyBatteryChange}`, 'Recovery'],
  ].filter(Boolean);
  const quality = sleepData && [
    sleepData.avgSleepStress != null && ['Sleep stress', sleepData.avgSleepStress],
    sleepData.restlessMoments != null && ['Restless moments', `${sleepData.restlessMoments} ×`],
    sleepData.awakeCount != null && ['Awakenings', `${sleepData.awakeCount} ×`],
  ].filter(Boolean);

  return (
    <Page>
      {/* Editorial header */}
      <Box>
        <DisplayHeading size="page">Activity</DisplayHeading>
        <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
          Your Garmin fitness data and recent activities.
        </Typography>
      </Box>

      {garminNotEnabled ? (
        <GeekEmptyState
          icon={<WorkoutIcon sx={{ fontSize: 28 }} />}
          title="Garmin isn’t connected"
          description="Connect your Garmin account in Settings to see steps, sleep, heart rate and activities here."
          action={
            <Button component={RouterLink} to="/settings#garmin" variant="outlined">
              Connect Garmin
            </Button>
          }
        />
      ) : error ? (
        <GeekErrorState
          title="Couldn’t load your activity"
          error={error}
          onRetry={loadData}
        />
      ) : null}

      {/* The two-column desktop layout: today and the heart on the left, the
          night on the right. A phone gets them in a single stack. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: { xs: 1.75, md: 2.25 }, alignItems: 'start' }}>
        {dailyData && (
          <LabelPanel title="Today so far" level={1} sx={{ gridColumn: { md: '1 / -1' } }}>
            <StatGrid>
              <Headline index={0} label="Steps" value={dailyData.steps != null ? fmt(dailyData.steps) : null} />
              <Headline index={1} label="Calories from activity" value={dailyData.activeCalories != null ? fmt(dailyData.activeCalories) : null} unit="cal" />
              <Headline index={2} label="Resting heart rate" value={dailyData.restingHR} unit="bpm" />
              <Headline index={3} label="Sleep" value={sleepText} />
            </StatGrid>
          </LabelPanel>
        )}

        {dailyData?.heartRate && (
          <LabelPanel title="Heart rate today">
            <StatGrid cols={3}>
              <Headline index={0} cols={3} label="Lowest" value={dailyData.heartRate.minHeartRate} unit="bpm" />
              <Headline index={1} cols={3} label="Resting" value={dailyData.heartRate.restingHeartRate || dailyData.restingHR} unit="bpm" />
              <Headline index={2} cols={3} label="Highest" value={dailyData.heartRate.maxHeartRate} unit="bpm" />
            </StatGrid>
          </LabelPanel>
        )}

        {sleepData && (
          <LabelPanel
            title="Last night’s sleep"
            meta={(sleepData.sleepStartTime || sleepData.sleepEndTime) ? (
              <>
                {sleepData.sleepStartTime && clockTime(sleepData.sleepStartTime)}
                {sleepData.sleepStartTime && sleepData.sleepEndTime && ' to '}
                {sleepData.sleepEndTime && clockTime(sleepData.sleepEndTime)}
              </>
            ) : undefined}
          >
            {sleepData.sleepScore && (
              <FactHeadline caption="Sleep score" name="Score" value={sleepData.sleepScore} />
            )}

            {/* Show message if no detailed data available */}
            {!sleepData.deepSleepMinutes && !sleepData.lightSleepMinutes && !sleepData.remSleepMinutes && !sleepData.sleepScore && (
              <Box sx={{ py: 2 }}>
                <Typography sx={{ fontWeight: 700 }}>No sleep details for last night yet</Typography>
                <Typography variant="caption" color="text.secondary">
                  They show up after your watch syncs with Garmin Connect.
                </Typography>
              </Box>
            )}

            {sleepFacts.length > 0 && (
              <>
                <Rule weight="medium" sx={{ mt: 1 }} />
                {sleepFacts.map(([name, amount], i) => (
                  <FactRow key={name} first={i === 0} name={name} trailing={<b>{amount}</b>} />
                ))}
              </>
            )}

            {overnight.length > 0 && (
              <>
                <Rule weight="medium" sx={{ mt: 1 }} />
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, pt: 0.75 }}>Overnight</Typography>
                {overnight.map(([name, amount, note], i) => (
                  <FactRow key={name} first={i === 0} name={name} of={note} trailing={<b>{amount}</b>} />
                ))}
              </>
            )}

            {(quality.length > 0 || sleepData.sleepInsight) && (
              <>
                <Rule weight="medium" sx={{ mt: 1 }} />
                {quality.map(([name, amount], i) => (
                  <FactRow key={name} first={i === 0} name={name} trailing={<b>{amount}</b>} />
                ))}
                {sleepData.sleepInsight && (
                  <Typography sx={{ mt: 1, fontSize: '0.8125rem', color: 'text.secondary' }}>
                    {sleepData.sleepInsight.replace(/_/g, ' ').toLowerCase()}
                  </Typography>
                )}
              </>
            )}
          </LabelPanel>
        )}

        <LabelPanel title="Recent activities" sx={{ gridColumn: { md: '1 / -1' } }}>
          {activities.length > 0 ? (
            activities.map((activity, index) => (
              <ActivityCard key={activity.activityId || index} activity={activity} first={index === 0} />
            ))
          ) : (
            <Box sx={{ pt: 1.5 }}>
              <EmptyState
                icon={WorkoutIcon}
                title="No recent activities"
                copy="Activities from your Garmin device will show up here once they sync."
              />
            </Box>
          )}
        </LabelPanel>
      </Box>

      {/* When it was last fetched, and a way to fetch again. Garmin syncs
          through the day, and the only way to see a walk that just synced
          was to leave and come back. It is also the page's one control: the
          shell's scrolling <main> held nothing that could take focus, so a
          keyboard couldn't scroll it (axe scrollable-region-focusable). */}
      {!garminNotEnabled && !error && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
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
      )}
    </Page>
  );
};

export default Activity;
