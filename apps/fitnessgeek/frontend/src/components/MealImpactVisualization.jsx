import React, { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  Grid,
  useTheme
} from '@mui/material';
import {
  Restaurant as MealIcon,
  FavoriteBorder as HeartIcon,
  Psychology as StressIcon,
  BatteryChargingFull as BatteryIcon
} from '@mui/icons-material';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

/**
 * Meal marker component for the chart
 */
function createMealMarkers(meals, color) {
  return meals.map(meal => ({
    type: 'line',
    xMin: meal.time,
    xMax: meal.time,
    borderColor: color,
    borderWidth: 2,
    borderDash: [5, 5],
    label: {
      display: true,
      content: `${meal.name} (${meal.calories}cal)`,
      position: 'start',
      backgroundColor: color,
      color: '#fff',
      padding: 4,
      font: {
        size: 10
      }
    }
  }));
}

/**
 * Calculate meal impact window (2 hours before/after)
 */
function getMealImpactData(intradayData, mealTime, windowMinutes = 120) {
  const mealDate = new Date(mealTime);
  const startTime = new Date(mealDate.getTime() - windowMinutes * 60 * 1000);
  const endTime = new Date(mealDate.getTime() + windowMinutes * 60 * 1000);

  return intradayData.filter(point => {
    const pointTime = new Date(point.time);
    return pointTime >= startTime && pointTime <= endTime;
  });
}

/**
 * Calculate average change after meal
 */
function calculateMealImpact(intradayData, mealTime) {
  const mealDate = new Date(mealTime);
  const preWindow = 30; // 30 min before
  const postWindow = 120; // 2 hours after

  const preMealStart = new Date(mealDate.getTime() - preWindow * 60 * 1000);
  const preMealEnd = mealDate;
  const postMealStart = new Date(mealDate.getTime() + 15 * 60 * 1000); // Skip immediate 15 min
  const postMealEnd = new Date(mealDate.getTime() + postWindow * 60 * 1000);

  const preMealData = intradayData.filter(point => {
    const t = new Date(point.time);
    return t >= preMealStart && t <= preMealEnd;
  });

  const postMealData = intradayData.filter(point => {
    const t = new Date(point.time);
    return t >= postMealStart && t <= postMealEnd;
  });

  if (preMealData.length === 0 || postMealData.length === 0) {
    return null;
  }

  const preAvg = preMealData.reduce((sum, p) => sum + p.value, 0) / preMealData.length;
  const postAvg = postMealData.reduce((sum, p) => sum + p.value, 0) / postMealData.length;
  const change = postAvg - preAvg;
  const percentChange = Math.round((change / preAvg) * 100);

  return {
    preAvg: Math.round(preAvg),
    postAvg: Math.round(postAvg),
    change: Math.round(change),
    percentChange
  };
}

/**
 * Meal impact analysis card
 */
function MealImpactCard({ meal, hrImpact, stressImpact, batteryImpact }) {
  const theme = useTheme();

  const getMealTime = () => {
    const date = new Date(meal.time);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getImpactColor = (change, metric) => {
    // For HR and Stress, increase is bad. For Battery, decrease is bad
    if (metric === 'battery') {
      return change < -10 ? 'error' : change > 5 ? 'success' : 'default';
    }
    return change > 10 ? 'error' : change < -5 ? 'success' : 'default';
  };

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <MealIcon color="primary" />
              <Box>
                <Typography variant="subtitle1" fontWeight="bold">
                  {meal.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {getMealTime()} • {meal.calories} cal • {meal.protein}g protein
                </Typography>
              </Box>
            </Stack>
          </Stack>

          <Divider />

          <Grid container spacing={2}>
            {hrImpact && (
              <Grid item xs={4}>
                <Stack spacing={0.5}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <HeartIcon fontSize="small" />
                    <Typography variant="caption" color="text.secondary">Heart Rate</Typography>
                  </Stack>
                  <Typography variant="body2">
                    {hrImpact.preAvg} → {hrImpact.postAvg} bpm
                  </Typography>
                  <Chip
                    label={`${hrImpact.change >= 0 ? '+' : ''}${hrImpact.change} bpm`}
                    size="small"
                    color={getImpactColor(hrImpact.change, 'hr')}
                  />
                </Stack>
              </Grid>
            )}

            {stressImpact && (
              <Grid item xs={4}>
                <Stack spacing={0.5}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <StressIcon fontSize="small" />
                    <Typography variant="caption" color="text.secondary">Stress</Typography>
                  </Stack>
                  <Typography variant="body2">
                    {stressImpact.preAvg} → {stressImpact.postAvg}
                  </Typography>
                  <Chip
                    label={`${stressImpact.change >= 0 ? '+' : ''}${stressImpact.change}`}
                    size="small"
                    color={getImpactColor(stressImpact.change, 'stress')}
                  />
                </Stack>
              </Grid>
            )}

            {batteryImpact && (
              <Grid item xs={4}>
                <Stack spacing={0.5}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <BatteryIcon fontSize="small" />
                    <Typography variant="caption" color="text.secondary">Energy</Typography>
                  </Stack>
                  <Typography variant="body2">
                    {batteryImpact.preAvg} → {batteryImpact.postAvg}
                  </Typography>
                  <Chip
                    label={`${batteryImpact.change >= 0 ? '+' : ''}${batteryImpact.change}`}
                    size="small"
                    color={getImpactColor(batteryImpact.change, 'battery')}
                  />
                </Stack>
              </Grid>
            )}
          </Grid>

          {/* Interpretation */}
          <Box>
            <Typography variant="caption" color="text.secondary">
              {hrImpact && hrImpact.change > 15 && '⚠️ Significant HR spike may indicate high-carb meal or insulin response. '}
              {stressImpact && stressImpact.change > 15 && '⚠️ Elevated stress after eating could indicate food sensitivity or digestive issues. '}
              {batteryImpact && batteryImpact.change < -15 && '⚠️ Large energy drop suggests meal was not satiating or caused blood sugar crash. '}
              {(!hrImpact || hrImpact.change < 10) && (!stressImpact || stressImpact.change < 10) && (!batteryImpact || batteryImpact.change > -10) &&
                '✓ Meal had minimal physiological impact - well-balanced.'}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Main MealImpactVisualization component
 */
export default function MealImpactVisualization({ date }) {
  const theme = useTheme();
  const [selectedMetric, setSelectedMetric] = useState('heartRate');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [intradayData, setIntradayData] = useState(null);
  const [meals, setMeals] = useState([]);
  const [mealImpacts, setMealImpacts] = useState([]);

  // Fetch intraday data and meals
  useEffect(() => {
    async function fetchData() {
      if (!date) return;

      setLoading(true);
      setError(null);

      try {
        // Fetch intraday health data and meals in parallel
        const [intradayResponse, mealsResponse] = await Promise.all([
          apiService.get(`/influx/intraday/${date}/${date}`),
          apiService.get(`/logs?date=${date}`)
        ]);

        setIntradayData(intradayResponse);

        // Transform meals to have time property (response format: { success, data: [...] })
        const logs = mealsResponse.data || mealsResponse.entries || [];
        const mealsWithTime = logs.map(entry => {
          // Try various date fields - FoodLog uses log_date and created_at
          const timestamp = entry.log_date || entry.created_at || entry.loggedAt || entry.createdAt;
          const dateObj = timestamp ? new Date(timestamp) : new Date();
          return {
            name: entry.name || entry.foodName || 'Meal',
            time: isNaN(dateObj.getTime()) ? new Date().toISOString() : dateObj.toISOString(),
            calories: entry.calories || 0,
            mealType: entry.meal_type || 'snack'
          };
        });
        setMeals(mealsWithTime);
      } catch (err) {
        console.error('Error fetching meal impact data:', err);
        setError(err.response?.data?.error || err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [date]);

  // Calculate meal impacts when data changes
  useEffect(() => {
    if (!intradayData || !meals || meals.length === 0) return;

    // Calculate impact for each meal
    const impacts = meals.map(meal => {
      const hrImpact = calculateMealImpact(intradayData.heartRate, meal.time);
      const stressImpact = calculateMealImpact(intradayData.stress, meal.time);
      const batteryImpact = calculateMealImpact(intradayData.bodyBattery, meal.time);

      return {
        meal,
        hrImpact,
        stressImpact,
        batteryImpact
      };
    });

    setMealImpacts(impacts);
  }, [intradayData, meals]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!meals || meals.length === 0) {
    return (
      <Alert severity="info">
        No meals logged for this date. Log meals to see their physiological impact!
      </Alert>
    );
  }

  // Prepare chart data
  const getChartData = () => {
    let data, color, label;

    switch (selectedMetric) {
      case 'heartRate':
        data = intradayData.heartRate;
        color = theme.palette.error.main;
        label = 'Heart Rate (bpm)';
        break;
      case 'stress':
        data = intradayData.stress;
        color = theme.palette.warning.main;
        label = 'Stress Level';
        break;
      case 'bodyBattery':
        data = intradayData.bodyBattery;
        color = theme.palette.success.main;
        label = 'Body Battery';
        break;
      default:
        data = [];
    }

    return { data, color, label };
  };

  const { data: chartData, color, label } = getChartData();

  const chartDataset = {
    labels: chartData.map(d => d.time),
    datasets: [{
      label,
      data: chartData.map(d => ({ x: d.time, y: d.value })),
      borderColor: color,
      backgroundColor: `${color}22`,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      fill: true,
      tension: 0.4
    }]
  };

  const mealMarkers = createMealMarkers(
    meals.map(m => ({
      time: m.time,
      name: m.name,
      calories: m.calories
    })),
    theme.palette.primary.main
  );

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      annotation: {
        annotations: mealMarkers
      },
      tooltip: {
        mode: 'index',
        intersect: false
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'hour',
          displayFormats: {
            hour: 'HH:mm'
          }
        },
        title: {
          display: true,
          text: 'Time'
        }
      },
      y: {
        beginAtZero: false,
        title: {
          display: true,
          text: label
        }
      }
    }
  };

  return (
    <Box>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">Meal Impact Analysis</Typography>
              <ToggleButtonGroup
                value={selectedMetric}
                exclusive
                onChange={(e, value) => value && setSelectedMetric(value)}
                size="small"
              >
                <ToggleButton value="heartRate">
                  <HeartIcon fontSize="small" sx={{ mr: 0.5 }} />
                  HR
                </ToggleButton>
                <ToggleButton value="stress">
                  <StressIcon fontSize="small" sx={{ mr: 0.5 }} />
                  Stress
                </ToggleButton>
                <ToggleButton value="bodyBattery">
                  <BatteryIcon fontSize="small" sx={{ mr: 0.5 }} />
                  Energy
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            <Box sx={{ height: 300 }}>
              <Line
                key={`meal-chart-${selectedMetric}-${date}`}
                data={chartDataset}
                options={chartOptions}
              />
            </Box>

            <Alert severity="info" icon={<MealIcon />}>
              <Typography variant="body2">
                Meal markers show when you ate. Look for patterns:
                <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
                  <li>HR spikes after meals = high-carb or insulin response</li>
                  <li>Stress increases = possible food sensitivity or digestive stress</li>
                  <li>Energy drops = blood sugar crash or non-satiating meal</li>
                </ul>
              </Typography>
            </Alert>
          </Stack>
        </CardContent>
      </Card>

      {/* Individual Meal Impact Cards */}
      <Typography variant="h6" sx={{ mb: 2 }}>Individual Meal Impacts</Typography>
      {mealImpacts.map((impact, idx) => (
        <MealImpactCard
          key={idx}
          meal={impact.meal}
          hrImpact={impact.hrImpact}
          stressImpact={impact.stressImpact}
          batteryImpact={impact.batteryImpact}
        />
      ))}
    </Box>
  );
}
