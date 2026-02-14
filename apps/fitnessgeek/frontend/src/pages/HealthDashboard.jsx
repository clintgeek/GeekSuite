import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Stack,
  Tab,
  Tabs,
  Alert,
  AlertTitle,
  CircularProgress,
  Card,
  CardContent,
  Button
} from '@mui/material';
import {
  TrendingUp as DashboardIcon,
  Bedtime as SleepIcon,
  Restaurant as MealIcon,
  Psychology as CoachIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import { apiService } from '../services/apiService';
import IntradayDashboard from '../components/IntradayDashboard';
import SleepAnalysis from '../components/SleepAnalysis';
import MealImpactVisualization from '../components/MealImpactVisualization';
import RecoveryCoach from '../components/RecoveryCoach';
import InfluxDBSettings from '../components/InfluxDBSettings';

/**
 * Comprehensive Health Dashboard
 * Displays InfluxDB-powered health analytics
 */
export default function HealthDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    // Use local date format (YYYY-MM-DD) instead of UTC
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [influxEnabled, setInfluxEnabled] = useState(false);
  const [checkingInflux, setCheckingInflux] = useState(true);
  const [aiAnalysisPrompt, setAiAnalysisPrompt] = useState(null);

  useEffect(() => {
    checkInfluxStatus();
  }, []);

  async function checkInfluxStatus() {
    setCheckingInflux(true);
    try {
      const response = await apiService.get('/user/settings');
      setInfluxEnabled(response.influxEnabled || false);
    } catch (err) {
      console.error('Error checking InfluxDB status:', err);
    } finally {
      setCheckingInflux(false);
    }
  }

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
  };

  const handleAIAnalysisRequest = async (promptText) => {
    setAiAnalysisPrompt(promptText);
    // In a real implementation, this would open a modal or navigate to an AI chat interface
    // For now, just log it
    console.log('AI Analysis Requested:', promptText);
    alert('AI Analysis feature coming soon! This would open your AI analyzer with the recovery context.');
  };

  if (checkingInflux) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!influxEnabled) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Stack spacing={3}>
          <Typography variant="h4">
            <DashboardIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
            Health Dashboard
          </Typography>

          <Alert severity="info">
            <AlertTitle>InfluxDB Integration Required</AlertTitle>
            The Health Dashboard requires InfluxDB integration to display advanced analytics.
            Enable it in settings to unlock:
            <ul style={{ marginTop: 8, marginBottom: 0 }}>
              <li>Real-time intraday metrics (heart rate, stress, body battery)</li>
              <li>Comprehensive sleep analysis with HRV and cardiovascular recovery</li>
              <li>Meal impact visualization showing physiological responses</li>
              <li>AI-powered recovery coaching with personalized recommendations</li>
            </ul>
          </Alert>

          <Card>
            <CardContent>
              <InfluxDBSettings onSettingsChange={(newSettings) => {
                if (newSettings.influxEnabled) {
                  setInfluxEnabled(true);
                }
              }} />
            </CardContent>
          </Card>
        </Stack>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h4">
            <DashboardIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
            Health Dashboard
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<SettingsIcon />}
            onClick={() => setActiveTab(4)}
          >
            Settings
          </Button>
        </Stack>

        {/* Date Selector */}
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body1">Viewing Data For:</Typography>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                max={(() => {
                  const today = new Date();
                  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                })()}
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '14px'
                }}
              />
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  handleDateChange(`${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`);
                }}
              >
                Yesterday
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  const today = new Date();
                  handleDateChange(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
                }}
              >
                Today
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange} variant="fullWidth">
            <Tab icon={<DashboardIcon />} label="Overview" />
            <Tab icon={<SleepIcon />} label="Sleep Analysis" />
            <Tab icon={<MealIcon />} label="Meal Impact" />
            <Tab icon={<CoachIcon />} label="Recovery Coach" />
            <Tab icon={<SettingsIcon />} label="Settings" />
          </Tabs>
        </Box>

        {/* Tab Panels */}
        <Box>
          {activeTab === 0 && (
            <Stack spacing={3}>
              <Typography variant="h5">Daily Overview</Typography>
              <IntradayDashboard
                date={selectedDate}
              />
            </Stack>
          )}

          {activeTab === 1 && (
            <Stack spacing={3}>
              <Typography variant="h5">Sleep Analysis</Typography>
              <SleepAnalysis
                date={selectedDate}
              />
            </Stack>
          )}

          {activeTab === 2 && (
            <Stack spacing={3}>
              <Typography variant="h5">Meal Impact Analysis</Typography>
              <MealImpactVisualization
                date={selectedDate}
              />
            </Stack>
          )}

          {activeTab === 3 && (
            <Stack spacing={3}>
              <RecoveryCoach
                date={selectedDate}
                onRequestAIAnalysis={handleAIAnalysisRequest}
              />
            </Stack>
          )}

          {activeTab === 4 && (
            <Stack spacing={3}>
              <InfluxDBSettings onSettingsChange={(newSettings) => {
                setInfluxEnabled(newSettings.influxEnabled);
              }} />
            </Stack>
          )}
        </Box>
      </Stack>
    </Container>
  );
}
