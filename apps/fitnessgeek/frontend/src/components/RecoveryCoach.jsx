import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
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
  CircularProgress,
  Button
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
              Readiness Score
            </Typography>
            <Chip label={getLabel()} color={color} size="small" sx={{ mt: 1 }} />
          </Box>
          <Box sx={{ width: '100%' }}>
            <LinearProgress
              variant="determinate"
              value={score}
              color={color}
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
              label={recommendation.priority}
              color={getPriorityColor()}
              size="small"
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {recommendation.message}
          </Typography>
          <Alert severity={getPriorityColor()} icon={false}>
            <strong>Action:</strong> {recommendation.action}
          </Alert>
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Main RecoveryCoach component
 */
export default function RecoveryCoach({ date, onRequestAIAnalysis }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!date) return;

    async function fetchRecommendations() {
      setLoading(true);
      setError(null);

      try {
        const response = await apiService.get(`/influx/recovery-recommendations/${date}`);
        setData(response);
      } catch (err) {
        console.error('Error fetching recovery recommendations:', err);
        setError(err.response?.data?.error || 'Failed to fetch recovery recommendations');
      } finally {
        setLoading(false);
      }
    }

    fetchRecommendations();
  }, [date]);

  const handleAIAnalysisClick = async () => {
    if (!onRequestAIAnalysis) return;

    try {
      // Get the full recovery context
      const response = await apiService.get(`/influx/recovery-context/${date}`);
      if (response.available) {
        onRequestAIAnalysis(response.promptText);
      }
    } catch (err) {
      console.error('Error fetching recovery context:', err);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        <AlertTitle>Error</AlertTitle>
        {error}
      </Alert>
    );
  }

  if (!data || !data.available) {
    return (
      <Alert severity="info">
        <AlertTitle>No Data Available</AlertTitle>
        Recovery recommendations require InfluxDB integration with sleep and intraday metrics.
      </Alert>
    );
  }

  const { readinessScore, recommendations } = data;

  return (
    <Box>
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h5">AI Recovery Coach</Typography>
          {onRequestAIAnalysis && (
            <Button
              variant="outlined"
              size="small"
              onClick={handleAIAnalysisClick}
            >
              Get Full AI Analysis
            </Button>
          )}
        </Stack>

        {/* Readiness Score */}
        <ReadinessGauge score={readinessScore} />

        {/* Training Recommendation */}
        <Alert
          severity={readinessScore >= 70 ? 'success' : readinessScore >= 50 ? 'warning' : 'error'}
          icon={<TrainingIcon />}
        >
          <AlertTitle>
            <strong>Training Recommendation</strong>
          </AlertTitle>
          {readinessScore >= 80 && 'Excellent recovery! Ready for high-intensity training or personal records.'}
          {readinessScore >= 70 && readinessScore < 80 && 'Good recovery. Moderate-to-high intensity training recommended.'}
          {readinessScore >= 50 && readinessScore < 70 && 'Moderate recovery. Stick to moderate intensity, listen to your body.'}
          {readinessScore >= 30 && readinessScore < 50 && 'Low recovery. Light activity only (walking, yoga, stretching).'}
          {readinessScore < 30 && 'Very low recovery. Take a full rest day. Prioritize sleep and recovery.'}
        </Alert>

        {/* Recommendations */}
        {recommendations.length > 0 ? (
          <>
            <Typography variant="h6">Personalized Recommendations</Typography>
            {recommendations.map((rec, idx) => (
              <RecommendationCard key={idx} recommendation={rec} />
            ))}
          </>
        ) : (
          <Alert severity="success" icon={<CheckIcon />}>
            <AlertTitle>All Systems Go!</AlertTitle>
            No specific concerns detected. Maintain your current recovery practices.
          </Alert>
        )}

        {/* General Tips */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <NutritionIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
              Today's Nutrition Focus
            </Typography>
            <List dense>
              {readinessScore < 60 && (
                <ListItem>
                  <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                  <ListItemText
                    primary="Prioritize protein and anti-inflammatory foods"
                    secondary="Target 1g protein per lb bodyweight. Include omega-3s, colorful vegetables."
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
                    primary="Include adaptogens and B-vitamins"
                    secondary="Ashwagandha, rhodiola, B-complex. Avoid excessive caffeine."
                  />
                </ListItem>
              )}
              <ListItem>
                <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                <ListItemText
                  primary="Stay hydrated"
                  secondary="Half your bodyweight in ounces of water. More if training."
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
              Tonight's Sleep Strategy
            </Typography>
            <List dense>
              {data.context?.sleep?.deepSleepPercent < 20 && (
                <>
                  <ListItem>
                    <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                    <ListItemText
                      primary="Cool your bedroom to 65-68°F"
                      secondary="Lower temperature promotes deep sleep and growth hormone release"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                    <ListItemText
                      primary="Finish dinner by 7pm"
                      secondary="Late meals interfere with deep sleep quality"
                    />
                  </ListItem>
                </>
              )}
              <ListItem>
                <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                <ListItemText
                  primary="No screens 1 hour before bed"
                  secondary="Blue light suppresses melatonin production"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><CheckIcon color="primary" /></ListItemIcon>
                <ListItemText
                  primary="Consistent sleep schedule"
                  secondary="Aim for same bedtime/wake time daily, even weekends"
                />
              </ListItem>
            </List>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
