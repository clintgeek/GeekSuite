import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  DirectionsWalk as StepsIcon,
  LocalFireDepartment as FireIcon,
  Bedtime as SleepIcon,
  Favorite as HeartIcon,
  FitnessCenter as WorkoutIcon,
  DirectionsRun as RunIcon,
  DirectionsBike as BikeIcon,
  Pool as SwimIcon,
  SportsGymnastics as GymIcon,
  AccessTime as TimeIcon,
  TrendingUp as TrendIcon,
  NightsStay as DeepSleepIcon,
  WbTwilight as LightSleepIcon,
  Psychology as RemIcon,
  Visibility as AwakeIcon,
} from '@mui/icons-material';
import { fitnessGeekService } from '../services/fitnessGeekService';
import { Surface, SectionLabel, DisplayHeading, StatNumber, EmptyState } from '../components/primitives';

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

// Local stat card — uses Surface + StatNumber primitives. Separate from the
// shared Dashboard/StatCard because this one has a left-aligned icon block.
const StatCard = ({ icon: Icon, label, value, unit, color, subtitle }) => {
  return (
    <Surface sx={{ height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: subtitle ? 2 : 0, gap: 1.5 }}>
        <Box
          sx={{
            bgcolor: `${color}20`,
            color,
            width: 44,
            height: 44,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon sx={{ fontSize: 24 }} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <SectionLabel sx={{ mb: 0.5 }}>{label}</SectionLabel>
          <StatNumber value={value} unit={unit} size="display" />
        </Box>
      </Box>
      {subtitle && (
        <Typography
          sx={{
            fontSize: '0.75rem',
            color: 'text.secondary',
            mt: 1,
          }}
        >
          {subtitle}
        </Typography>
      )}
    </Surface>
  );
};

const ActivityCard = ({ activity }) => {
  const theme = useTheme();
  const Icon = getActivityIcon(activity.activityType);
  const duration = activity.duration ? Math.round(activity.duration / 60) : null;
  const distance = activity.distance ? (activity.distance / 1000).toFixed(2) : null;

  return (
    <Surface sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
          <Box
            sx={{
              bgcolor: theme.palette.primary.main + '20',
              color: theme.palette.primary.main,
              width: 44,
              height: 44,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mr: 2,
              flexShrink: 0,
            }}
          >
            <Icon sx={{ fontSize: 24 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: '1.25rem',
                fontWeight: 400,
                color: 'text.primary',
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
                textTransform: 'capitalize',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {activity.activityName || activity.activityType || 'Activity'}
            </Typography>
            <Typography
              sx={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.6875rem',
                color: 'text.secondary',
                mt: 0.25,
                letterSpacing: '0.02em',
              }}
            >
              {activity.startTimeLocal ? new Date(activity.startTimeLocal).toLocaleString() : 'Unknown time'}
            </Typography>
          </Box>
        </Box>
        {activity.calories != null && (
          <Chip
            icon={<FireIcon sx={{ fontSize: 16 }} />}
            label={`${activity.calories} kcal`}
            size="small"
            sx={{
              bgcolor: theme.palette.warning.main + '20',
              color: theme.palette.warning.dark,
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
              flexShrink: 0,
            }}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 3, mt: 2, flexWrap: 'wrap' }}>
        {duration != null && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TimeIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography
              sx={{
                fontFamily: "'JetBrains Mono', monospace",
                fontVariantNumeric: 'tabular-nums',
                fontSize: '0.8125rem',
                color: 'text.secondary',
              }}
            >
              {duration} min
            </Typography>
          </Box>
        )}
        {distance && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TrendIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography
              sx={{
                fontFamily: "'JetBrains Mono', monospace",
                fontVariantNumeric: 'tabular-nums',
                fontSize: '0.8125rem',
                color: 'text.secondary',
              }}
            >
              {distance} km
            </Typography>
          </Box>
        )}
        {activity.averageHR && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <HeartIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography
              sx={{
                fontFamily: "'JetBrains Mono', monospace",
                fontVariantNumeric: 'tabular-nums',
                fontSize: '0.8125rem',
                color: 'text.secondary',
              }}
            >
              {activity.averageHR} bpm avg
            </Typography>
          </Box>
        )}
      </Box>
    </Surface>
  );
};

const Activity = () => {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dailyData, setDailyData] = useState(null);
  const [sleepData, setSleepData] = useState(null);
  const [activities, setActivities] = useState([]);
  const [garminStatus, setGarminStatus] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check Garmin status first
      const statusRes = await fitnessGeekService.getGarminStatus();
      setGarminStatus(statusRes?.data || statusRes);

      if (!statusRes?.data?.enabled && !statusRes?.enabled) {
        setError('Garmin integration is not enabled. Go to Settings to connect your Garmin account.');
        setLoading(false);
        return;
      }

      // Fetch daily summary, sleep details, and activities in parallel
      const [dailyRes, sleepRes, activitiesRes] = await Promise.allSettled([
        fitnessGeekService.getGarminDaily(),
        fitnessGeekService.getGarminSleep(),
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
      setError(err.message || 'Failed to load activity data');
    } finally {
      setLoading(false);
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

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 960, mx: 'auto' }}>
      {/* Editorial header */}
      <Box sx={{ mb: 3 }}>
        <SectionLabel sx={{ mb: 0.75 }}>Tracking · Activity</SectionLabel>
        <DisplayHeading size="page">Activity</DisplayHeading>
        <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
          Your Garmin fitness data and recent activities.
        </Typography>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Daily Stats */}
      {dailyData && (
        <>
          <Box sx={{ mb: 2 }}>
            <SectionLabel>Today's Summary</SectionLabel>
          </Box>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid item xs={6} sm={3}>
              <StatCard
                icon={StepsIcon}
                label="Steps"
                value={dailyData.steps?.toLocaleString()}
                color={theme.palette.primary.main}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard
                icon={FireIcon}
                label="Active Calories"
                value={dailyData.activeCalories}
                unit="kcal"
                color={theme.palette.warning.main}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard
                icon={HeartIcon}
                label="Resting HR"
                value={dailyData.restingHR}
                unit="bpm"
                color={theme.palette.error.main}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard
                icon={SleepIcon}
                label="Sleep"
                value={sleepText}
                color={theme.palette.info.main}
              />
            </Grid>
          </Grid>
        </>
      )}

      {/* Heart Rate Details */}
      {dailyData?.heartRate && (
        <>
          <Box sx={{ mb: 2 }}>
            <SectionLabel>Heart Rate</SectionLabel>
          </Box>
          <Surface sx={{ mb: 4 }}>
            <Grid container spacing={3}>
              <Grid item xs={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <SectionLabel sx={{ mb: 0.75, justifyContent: 'center' }}>Min</SectionLabel>
                  <StatNumber
                    value={dailyData.heartRate.minHeartRate}
                    unit="bpm"
                    size="display"
                    color={theme.palette.success.main}
                  />
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <SectionLabel sx={{ mb: 0.75, justifyContent: 'center' }}>Resting</SectionLabel>
                  <StatNumber
                    value={dailyData.heartRate.restingHeartRate || dailyData.restingHR}
                    unit="bpm"
                    size="display"
                    color={theme.palette.info.main}
                  />
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <SectionLabel sx={{ mb: 0.75, justifyContent: 'center' }}>Max</SectionLabel>
                  <StatNumber
                    value={dailyData.heartRate.maxHeartRate}
                    unit="bpm"
                    size="display"
                    color={theme.palette.error.main}
                  />
                </Box>
              </Grid>
            </Grid>
          </Surface>
        </>
      )}

      {/* Sleep Details */}
      {sleepData && (
        <>
          <Box sx={{ mb: 2 }}>
            <SectionLabel>Sleep Details</SectionLabel>
          </Box>
          <Surface sx={{ mb: 4 }}>
            <Box>
              {sleepData.sleepScore && (
                <Box sx={{ textAlign: 'center', mb: 3 }}>
                  <SectionLabel sx={{ justifyContent: 'center', mb: 1 }}>Sleep Score</SectionLabel>
                  <StatNumber
                    value={sleepData.sleepScore}
                    size="hero"
                    color={theme.palette.primary.main}
                    sx={{ display: 'flex', justifyContent: 'center' }}
                  />
                </Box>
              )}

              {/* Show message if no detailed data available */}
              {!sleepData.deepSleepMinutes && !sleepData.lightSleepMinutes && !sleepData.remSleepMinutes && !sleepData.sleepScore && (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                  <SleepIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">
                    No detailed sleep data available for today
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    Sleep data syncs after your device uploads to Garmin Connect
                  </Typography>
                </Box>
              )}

              {/* Sleep Stages */}
              {(sleepData.deepSleepMinutes != null || sleepData.lightSleepMinutes != null || sleepData.remSleepMinutes != null || sleepData.awakeSleepMinutes != null) && (
                <Grid container spacing={2}>
                  {sleepData.deepSleepMinutes != null && (
                    <Grid item xs={6} sm={3}>
                      <Box sx={{
                        textAlign: 'center',
                        p: 2,
                        borderRadius: 2,
                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.08)'
                      }}>
                        <DeepSleepIcon sx={{ color: '#6366f1', fontSize: 28, mb: 1 }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {Math.floor(sleepData.deepSleepMinutes / 60)}h {sleepData.deepSleepMinutes % 60}m
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Deep Sleep</Typography>
                      </Box>
                    </Grid>
                  )}
                  {sleepData.lightSleepMinutes != null && (
                    <Grid item xs={6} sm={3}>
                      <Box sx={{
                        textAlign: 'center',
                        p: 2,
                        borderRadius: 2,
                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)'
                      }}>
                        <LightSleepIcon sx={{ color: '#3b82f6', fontSize: 28, mb: 1 }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {Math.floor(sleepData.lightSleepMinutes / 60)}h {sleepData.lightSleepMinutes % 60}m
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Light Sleep</Typography>
                      </Box>
                    </Grid>
                  )}
                  {sleepData.remSleepMinutes != null && (
                    <Grid item xs={6} sm={3}>
                      <Box sx={{
                        textAlign: 'center',
                        p: 2,
                        borderRadius: 2,
                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(168, 85, 247, 0.1)' : 'rgba(168, 85, 247, 0.08)'
                      }}>
                        <RemIcon sx={{ color: '#a855f7', fontSize: 28, mb: 1 }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {Math.floor(sleepData.remSleepMinutes / 60)}h {sleepData.remSleepMinutes % 60}m
                        </Typography>
                        <Typography variant="caption" color="text.secondary">REM Sleep</Typography>
                      </Box>
                    </Grid>
                  )}
                  {sleepData.awakeSleepMinutes != null && (
                    <Grid item xs={6} sm={3}>
                      <Box sx={{
                        textAlign: 'center',
                        p: 2,
                        borderRadius: 2,
                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.08)'
                      }}>
                        <AwakeIcon sx={{ color: '#fbbf24', fontSize: 28, mb: 1 }} />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {Math.floor(sleepData.awakeSleepMinutes / 60)}h {sleepData.awakeSleepMinutes % 60}m
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Awake</Typography>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              )}

              {/* Sleep Time Range */}
              {(sleepData.sleepStartTime || sleepData.sleepEndTime) && (
                <Box sx={{ mt: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {sleepData.sleepStartTime && new Date(sleepData.sleepStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {sleepData.sleepStartTime && sleepData.sleepEndTime && ' → '}
                    {sleepData.sleepEndTime && new Date(sleepData.sleepEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                </Box>
              )}

              {/* Health Metrics Grid */}
              {(sleepData.avgSpO2 || sleepData.avgOvernightHrv || sleepData.avgRespiration || sleepData.bodyBatteryChange != null) && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
                    Health Metrics
                  </Typography>
                  <Grid container spacing={2}>
                    {/* SpO2 */}
                    {sleepData.avgSpO2 && (
                      <Grid item xs={6} sm={3}>
                        <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 1, bgcolor: theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.08)' }}>
                          <Typography variant="h6" sx={{ fontWeight: 600, color: '#ef4444' }}>
                            {sleepData.avgSpO2}%
                          </Typography>
                          <Typography variant="caption" color="text.secondary">Avg SpO2</Typography>
                          {sleepData.minSpO2 && (
                            <Typography variant="caption" display="block" color="text.disabled">
                              Low: {sleepData.minSpO2}%
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                    )}
                    {/* HRV */}
                    {sleepData.avgOvernightHrv && (
                      <Grid item xs={6} sm={3}>
                        <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 1, bgcolor: theme.palette.mode === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.08)' }}>
                          <Typography variant="h6" sx={{ fontWeight: 600, color: '#22c55e' }}>
                            {sleepData.avgOvernightHrv} ms
                          </Typography>
                          <Typography variant="caption" color="text.secondary">HRV</Typography>
                          {sleepData.hrvStatus && (
                            <Typography variant="caption" display="block" color="text.disabled">
                              {sleepData.hrvStatus}
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                    )}
                    {/* Respiration */}
                    {sleepData.avgRespiration && (
                      <Grid item xs={6} sm={3}>
                        <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 1, bgcolor: theme.palette.mode === 'dark' ? 'rgba(14, 165, 233, 0.1)' : 'rgba(14, 165, 233, 0.08)' }}>
                          <Typography variant="h6" sx={{ fontWeight: 600, color: '#0ea5e9' }}>
                            {sleepData.avgRespiration}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">Breaths/min</Typography>
                          {sleepData.minRespiration && sleepData.maxRespiration && (
                            <Typography variant="caption" display="block" color="text.disabled">
                              {sleepData.minRespiration}-{sleepData.maxRespiration}
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                    )}
                    {/* Body Battery */}
                    {sleepData.bodyBatteryChange != null && (
                      <Grid item xs={6} sm={3}>
                        <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 1, bgcolor: theme.palette.mode === 'dark' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.08)' }}>
                          <Typography variant="h6" sx={{ fontWeight: 600, color: '#fbbf24' }}>
                            +{sleepData.bodyBatteryChange}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">Body Battery</Typography>
                          <Typography variant="caption" display="block" color="text.disabled">
                            Recovery
                          </Typography>
                        </Box>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              )}

              {/* Stress & Quality Insights */}
              {(sleepData.avgSleepStress || sleepData.restlessMoments || sleepData.sleepInsight) && (
                <Box sx={{ mt: 3, p: 2, borderRadius: 1, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
                  <Grid container spacing={2} alignItems="center">
                    {sleepData.avgSleepStress && (
                      <Grid item xs={4}>
                        <Typography variant="caption" color="text.secondary" display="block">Sleep Stress</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{sleepData.avgSleepStress}</Typography>
                      </Grid>
                    )}
                    {sleepData.restlessMoments != null && (
                      <Grid item xs={4}>
                        <Typography variant="caption" color="text.secondary" display="block">Restless</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{sleepData.restlessMoments}x</Typography>
                      </Grid>
                    )}
                    {sleepData.awakeCount != null && (
                      <Grid item xs={4}>
                        <Typography variant="caption" color="text.secondary" display="block">Awakenings</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{sleepData.awakeCount}x</Typography>
                      </Grid>
                    )}
                  </Grid>
                  {sleepData.sleepInsight && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block', fontStyle: 'italic' }}>
                      {sleepData.sleepInsight.replace(/_/g, ' ').toLowerCase()}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          </Surface>
        </>
      )}

      {/* Recent Activities */}
      <Box sx={{ mb: 2 }}>
        <SectionLabel>Recent Activities</SectionLabel>
      </Box>
      {activities.length > 0 ? (
        activities.map((activity, index) => (
          <ActivityCard key={activity.activityId || index} activity={activity} />
        ))
      ) : (
        <EmptyState
          icon={WorkoutIcon}
          title="No recent activities"
          copy="Activities from your Garmin device will show up here once they sync."
        />
      )}

      {/* Last Sync Info */}
      {dailyData?.fetchedAt && (
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Last updated: {new Date(dailyData.fetchedAt).toLocaleString()}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default Activity;
