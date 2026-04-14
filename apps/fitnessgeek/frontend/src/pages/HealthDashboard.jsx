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
  Button,
  TextField
} from '@mui/material';
import {
  TrendingUp as DashboardIcon,
  Bedtime as SleepIcon,
  Restaurant as MealIcon,
  Psychology as CoachIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import { useAuth } from '@geeksuite/auth';
import { apiService } from '../services/apiService';
import IntradayDashboard from '../components/IntradayDashboard';
import SleepAnalysis from '../components/SleepAnalysis';
import MealImpactVisualization from '../components/MealImpactVisualization';
import RecoveryCoach from '../components/RecoveryCoach';
import InfluxDBSettings from '../components/InfluxDBSettings';
import { SectionLabel, DisplayHeading } from '../components/primitives';

const TAB_TITLES = [
  'Overview',
  'Sleep Analysis',
  'Meal Impact',
  'Recovery Coach',
  'Settings',
];

/**
 * Comprehensive Health Dashboard
 * Displays InfluxDB-powered health analytics
 */
export default function HealthDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);

  // Reflect the current tab in document.title so browser history is readable
  useEffect(() => {
    const tabName = TAB_TITLES[activeTab] || 'Health Dashboard';
    const previousTitle = document.title;
    document.title = `${tabName} · Health Dashboard · FitnessGeek`;
    return () => {
      document.title = previousTitle;
    };
  }, [activeTab]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    // Use local date format (YYYY-MM-DD) instead of UTC
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${ year }-${ month }-${ day }`;
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
      const settings = response?.data || response || {};
      setInfluxEnabled(settings.influxEnabled || false);
    } catch (err) {
      console.warn('Could not load InfluxDB settings:', err.message);
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
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Stack spacing={3}>
          <Box>
            <SectionLabel sx={{ mb: 0.75 }}>Integrations · Advanced</SectionLabel>
            <DisplayHeading size="page">Health Dashboard</DisplayHeading>
          </Box>

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
        {/* Editorial header */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-end" spacing={2}>
          <Box>
            <SectionLabel sx={{ mb: 0.75 }}>Integrations · Advanced</SectionLabel>
            <DisplayHeading size="page">Health Dashboard</DisplayHeading>
            <Typography sx={{ color: 'text.secondary', mt: 0.5, fontSize: '0.9375rem' }}>
              Deep analytics powered by your InfluxDB health data.
            </Typography>
          </Box>
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
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              alignItems={{ xs: 'stretch', sm: 'center' }}
            >
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                Viewing:
              </Typography>
              <TextField
                type="date"
                size="small"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                inputProps={{
                  max: (() => {
                    const today = new Date();
                    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  })()
                }}
                sx={{ minWidth: { xs: '100%', sm: 180 } }}
              />
              <Stack direction="row" spacing={1}>
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

        {/* Tab Panels — no redundant heading, tab label already names the section */}
        <Box>
          {activeTab === 0 && <IntradayDashboard date={selectedDate} />}
          {activeTab === 1 && <SleepAnalysis date={selectedDate} />}
          {activeTab === 2 && <MealImpactVisualization date={selectedDate} />}
          {activeTab === 3 && (
            <RecoveryCoach
              date={selectedDate}
              onRequestAIAnalysis={handleAIAnalysisRequest}
            />
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
