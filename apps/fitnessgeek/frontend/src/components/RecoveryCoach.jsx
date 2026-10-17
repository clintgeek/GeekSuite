import React, { useState, useEffect } from 'react';
import { influxService } from '../services/influxService';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  LinearProgress,
  Alert,
  AlertTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  CircularProgress
} from '@mui/material';
import {
  FitnessCenter as TrainingIcon,
  Restaurant as NutritionIcon,
  Bedtime as SleepIcon,
  Psychology as StressIcon,
  BatteryChargingFull as EnergyIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  TrendingUp as ReadinessIcon
} from '@mui/icons-material';

const PRIORITY_WORDS = { HIGH: 'Do this first', MEDIUM: 'Worth doing', LOW: 'Nice to have' };

/**
 * Readiness gauge component
 */
function ReadinessGauge({ score }) {
  const getColor = () => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'info';
    if (score >= 40) return 'warning';
    return 'error';
  };

  const getLabel = () => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Moderate';
    return 'Low';
  };

  const color = getColor();

  return (
    <Card variant="outlined" sx={{ background: `${color}.light`, borderColor: `${color}.main` }}>
      <CardContent>
        <Stack spacing={2} alignItems="center">
          <ReadinessIcon sx={{ fontSize: 48, color: `${color}.main` }} />
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h2" color={`${color}.main`} fontWeight="bold">
              {score}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Ready-for-today score
            </Typography>
            <Chip label={getLabel()} color={color} size="small" sx={{ mt: 1 }} />
          </Box>
          <Box sx={{ width: '100%' }}>
            <LinearProgress
              variant="determinate"
              value={score}
              color={color}
              aria-label={`Ready-for-today score: ${score} out of 100`}
              sx={{ height: 10, borderRadius: 1 }}
            />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Recommendation card
 */
function RecommendationCard({ recommendation }) {
  const getCategoryIcon = () => {
    switch (recommendation.category) {
      case 'RECOVERY': return <TrainingIcon />;
      case 'SLEEP': return <SleepIcon />;
      case 'STRESS': return <StressIcon />;
      case 'ENERGY': return <EnergyIcon />;
      case 'CARDIOVASCULAR': return <CheckIcon />;
      default: return <WarningIcon />;
    }
  };

  const getPriorityColor = () => {
    switch (recommendation.priority) {
      case 'HIGH': return 'error';
      case 'MEDIUM': return 'warning';
      case 'LOW': return 'info';
      default: return 'default';
    }
  };

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Stack direction="row" spacing={1} alignItems="center">
              {getCategoryIcon()}
              <Typography variant="h6">{recommendation.title}</Typography>
            </Stack>
            <Chip
              label={PRIORITY_WORDS[recommendation.priority] || recommendation.priority}
              color={getPriorityColor()}
              size="small"
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {recommendation.message}
          </Typography>
          <Alert severity={getPriorityColor()} icon={false}>
            <strong>Try this:</strong> {recommendation.action}
          </Alert>
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Main RecoveryCoach component
 */
export default function RecoveryCoach({ date }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!date) return;

    async function fetchRecommendations() {
      setLoading(true);

      try {
        const response = await influxService.getRecoveryRecommendations(date);
        // { available: false } from either "no data" or "influx unavailable" —
        // the existing !data.available empty-state covers both.
        setData(response);
      } catch (err) {
        // Defensive: backend should no longer 500, but handle it quietly.
        console.warn('Recovery recommendations unavailable:', err.message);
        setData({ available: false });
      } finally {
        setLoading(false);
      }
    }

    fetchRecommendations();
  }, [date]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!data || !data.available) {
    return (
      <Alert severity="info">
        <AlertTitle>Nothing to go on yet</AlertTitle>
        Recovery notes need last night’s sleep and today’s readings from the home data server.
      </Alert>
    );
  }

  const { readinessScore, recommendations } = data;

  return (
    <Box>
      <Stack spacing={3}>
        {/* Header.
            "Get Full AI Analysis" used to live here, wired to a native
            `alert('...coming soon')` in HealthDashboard — the one place in
            the app that broke the design language outright (a blocking
            browser alert instead of the app's own toast/empty-state system),
            promising an analysis feature that doesn't exist. Removed rather
            than wired to a fake destination; re-add it once there's a real
            AI analysis surface to send the recovery context to. */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h5">Recovery notes from the AI</Typography>
        </Stack>

        {/* Readiness Score */}
        <ReadinessGauge score={readinessScore} />

        {/* Training Recommendation */}
        <Alert
          severity={readinessScore >= 70 ? 'success' : readinessScore >= 50 ? 'warning' : 'error'}
          icon={<TrainingIcon />}
        >
          <AlertTitle>
            <strong>How hard to go today</strong>
          </AlertTitle>
          {readinessScore >= 80 && 'Well recovered. A hard workout is fine today.'}
          {readinessScore >= 70 && readinessScore < 80 && 'Recovered. A moderate to hard workout suits today.'}
          {readinessScore >= 50 && readinessScore < 70 && 'Partly recovered. Keep it moderate and listen to your body.'}
          {readinessScore >= 30 && readinessScore < 50 && 'Not well recovered. Keep it light: a walk, yoga or stretching.'}
          {readinessScore < 30 && 'Run down. Take a rest day and put sleep first.'}
        </Alert>

        {/* Recommendations */}
        {recommendations.length > 0 ? (
          <>
            <Typography variant="h6">For you today</Typography>
            {recommendations.map((rec, idx) => (
              <RecommendationCard key={idx} recommendation={rec} />
            ))}
          </>
        ) : (
          <Alert severity="success" icon={<CheckIcon />}>
            <AlertTitle>Nothing to change</AlertTitle>
            Nothing stands out today. Keep doing what you’re doing.
          </Alert>
        )}

        {/* General Tips */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <NutritionIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
              What to eat today
            </Typography>
            <List dense>
              {readinessScore < 60 && (
                <ListItem>
                  <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                  <ListItemText
                    primary="Put protein and whole foods first"
                    secondary="About 1g of protein per lb of body weight, plus oily fish and colorful vegetables."
                  />
                </ListItem>
              )}
              {data.context?.sleep?.deepSleepPercent < 20 && (
                <ListItem>
                  <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                  <ListItemText
                    primary="Support deep sleep with magnesium-rich foods"
                    secondary="Pumpkin seeds, dark chocolate, spinach. Consider 400mg magnesium glycinate supplement."
                  />
                </ListItem>
              )}
              {data.context?.current?.stress > 60 && (
                <ListItem>
                  <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                  <ListItemText
                    primary="Include adaptogens and B vitamins"
                    secondary="Ashwagandha, rhodiola, B-complex. Go easy on caffeine."
                  />
                </ListItem>
              )}
              <ListItem>
                <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                <ListItemText
                  primary="Stay hydrated"
                  secondary="About half your body weight in ounces of water, more if you work out."
                />
              </ListItem>
            </List>
          </CardContent>
        </Card>

        {/* Sleep Tips */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <SleepIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
              Tonight’s sleep
            </Typography>
            <List dense>
              {data.context?.sleep?.deepSleepPercent < 20 && (
                <>
                  <ListItem>
                    <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                    <ListItemText
                      primary="Cool your bedroom to 65–68°F"
                      secondary="A cooler room helps deep sleep"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                    <ListItemText
                      primary="Finish dinner by 7 PM"
                      secondary="A late meal can cut into deep sleep"
                    />
                  </ListItem>
                </>
              )}
              <ListItem>
                <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                <ListItemText
                  primary="No screens for an hour before bed"
                  secondary="Screen light can keep you awake"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                <ListItemText
                  primary="Keep the same bedtime"
                  secondary="Go to bed and get up at the same times every day, weekends too"
                />
              </ListItem>
            </List>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
