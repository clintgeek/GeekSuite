import { useState, useEffect } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Note as NoteIcon,
  Book as BookIcon,
  FitnessCenter as FitnessIcon,
  AutoStories as StoryIcon,
  NatureOutlined as NatureIcon,
  Translate as TranslateIcon,
  Storage as StorageIcon,
  Memory as MemoryIcon,
  DataObject as DataObjectIcon,
  Apps as AppsIcon
} from '@mui/icons-material';
import { useBaseGeekAuth } from '../components/AuthContext';
import api from '../api';

// Icon resolver — maps DB-stored icon name strings to MUI components
const iconMap = {
  Dashboard: DashboardIcon,
  Note: NoteIcon,
  Book: BookIcon,
  FitnessCenter: FitnessIcon,
  AutoStories: StoryIcon,
  NatureOutlined: NatureIcon,
  Translate: TranslateIcon,
  Storage: StorageIcon,
  Memory: MemoryIcon,
  DataObject: DataObjectIcon,
  Apps: AppsIcon,
};
const resolveIcon = (iconName) => iconMap[iconName] || DashboardIcon;

// Hardcoded fallback — used only if the API registry is unreachable
const fallbackApps = [
  { name: 'basegeek', displayName: 'baseGeek', description: 'Auth & shared services', icon: 'Dashboard', color: '#e8a849', url: 'https://basegeek.clintgeek.com', tag: 'platform' },
  { name: 'notegeek', displayName: 'noteGeek', description: 'Notes & documents', icon: 'Note', color: '#a99df0', url: 'https://notegeek.clintgeek.com', tag: 'productivity' },
  { name: 'bujogeek', displayName: 'bujoGeek', description: 'Bullet journal & tasks', icon: 'Book', color: '#d4956a', url: 'https://bujogeek.clintgeek.com', tag: 'productivity' },
  { name: 'fitnessgeek', displayName: 'fitnessGeek', description: 'Nutrition & fitness', icon: 'FitnessCenter', color: '#7dac8e', url: 'https://fitnessgeek.clintgeek.com', tag: 'health' },
  { name: 'storygeek', displayName: 'storyGeek', description: 'Story plotting & writing', icon: 'AutoStories', color: '#c76b8e', url: 'https://storygeek.clintgeek.com', tag: 'creative' },
  { name: 'flockgeek', displayName: 'flockGeek', description: 'Flock management', icon: 'NatureOutlined', color: '#7dac8e', url: 'https://flockgeek.clintgeek.com', tag: 'management' },
  { name: 'babelgeek', displayName: 'babelGeek', description: 'Translation & language', icon: 'Translate', color: '#6db5c0', url: 'https://babelgeek.clintgeek.com', tag: 'learning' },
];

// Service status checks
const services = [
  { name: 'MongoDB', icon: StorageIcon, endpoint: '/mongo/status', key: 'mongo' },
  { name: 'Redis', icon: MemoryIcon, endpoint: '/redis/status', key: 'redis' },
  { name: 'InfluxDB', icon: DataObjectIcon, endpoint: '/influx/status', key: 'influx' },
];

export default function BaseGeekHome() {
  const { user } = useBaseGeekAuth();
  const [apps, setApps] = useState(fallbackApps);
  const [serviceStatus, setServiceStatus] = useState({});
  const [appHealth, setAppHealth] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());

  // Fetch apps from registry
  useEffect(() => {
    const fetchApps = async () => {
      try {
        const res = await api.get('/apps');
        if (res.data?.apps?.length > 0) {
          setApps(res.data.apps);
        }
      } catch {
        // Keep fallback
      }
    };
    fetchApps();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Infrastructure service checks
  useEffect(() => {
    const checkServices = async () => {
      const results = {};
      for (const svc of services) {
        try {
          const start = Date.now();
          const res = await api.get(svc.endpoint);
          const latency = Date.now() - start;
          results[svc.key] = {
            online: true,
            latency,
            version: res.data?.serverInfo?.version || res.data?.redisVersion || null,
          };
        } catch {
          results[svc.key] = { online: false, latency: null, version: null };
        }
      }
      setServiceStatus(results);
    };
    checkServices();
    const interval = setInterval(checkServices, 30000);
    return () => clearInterval(interval);
  }, []);

  // App health checks via backend proxy — re-runs when apps list changes
  useEffect(() => {
    if (!apps.length) return;
    const checkApps = async () => {
      const results = {};
      for (const app of apps) {
        const key = app.name.toLowerCase();
        try {
          const res = await api.get(`/health/app/${key}`);
          results[app.name] = {
            online: res.data.status === 'online',
            latency: res.data.latency,
            version: res.data.data?.version || null,
            checkedAt: res.data.checkedAt,
          };
        } catch {
          results[app.name] = { online: false, latency: null, version: null, checkedAt: new Date().toISOString() };
        }
      }
      setAppHealth(results);
    };
    checkApps();
    const interval = setInterval(checkApps, 60000);
    return () => clearInterval(interval);
  }, [apps]);

  const greeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <Box>
      {/* Greeting */}
      <Box sx={{ mb: 4, mt: 1 }}>
        <Typography variant="h3" sx={{
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'text.primary',
          mb: 0.5,
        }}>
          {greeting()}{user?.username ? `, ${user.username}` : ''}
        </Typography>
        <Typography sx={{
          color: 'text.secondary',
          fontSize: '0.9rem',
          fontFamily: '"Geist Mono", monospace',
        }}>
          {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Typography>
      </Box>

      {/* Services Status */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1.5, display: 'block' }}>
          Infrastructure
        </Typography>
        <Box sx={{
          display: 'flex',
          gap: 2,
          flexWrap: 'wrap',
        }}>
          {services.map((svc) => {
            const status = serviceStatus[svc.key];
            const isOnline = status?.online;
            const SvcIcon = svc.icon;
            return (
              <Box
                key={svc.key}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2,
                  py: 1.25,
                  borderRadius: '10px',
                  border: '1px solid',
                  borderColor: isOnline ? 'rgba(125, 172, 142, 0.20)' : 'rgba(199, 107, 107, 0.20)',
                  backgroundColor: isOnline ? 'rgba(125, 172, 142, 0.04)' : 'rgba(199, 107, 107, 0.04)',
                  minWidth: 160,
                  transition: 'all 150ms ease',
                }}
              >
                <SvcIcon sx={{ fontSize: 18, color: isOnline ? 'success.main' : 'error.main', opacity: 0.8 }} />
                <Box>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>
                    {svc.name}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: isOnline ? 'success.main' : status === undefined ? 'text.disabled' : 'error.main',
                      animation: isOnline ? 'pulse-dot 2s ease-in-out infinite' : 'none',
                    }} />
                    <Typography sx={{
                      fontSize: '0.675rem',
                      color: 'text.secondary',
                      fontFamily: '"Geist Mono", monospace',
                    }}>
                      {status === undefined ? 'checking...' : isOnline ? `${status.latency}ms` : 'offline'}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* App Launcher Grid */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1.5, display: 'block' }}>
          Applications
        </Typography>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: 'repeat(3, 1fr)',
            md: 'repeat(4, 1fr)',
          },
          gap: 2,
        }}>
          {apps.map((app) => {
            const AppIcon = resolveIcon(app.icon);
            const health = appHealth[app.name];
            const isOnline = health?.online;
            const isChecking = health === undefined;
            return (
              <Tooltip key={app.name} title={`Open ${app.displayName}`} arrow placement="top">
                <Box
                  component="a"
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 3,
                    borderRadius: '14px',
                    border: '1px solid',
                    borderColor: 'divider',
                    backgroundColor: 'background.paper',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'all 200ms ease',
                    position: 'relative',
                    '&:hover': {
                      borderColor: app.color,
                      backgroundColor: `${app.color}08`,
                      transform: 'translateY(-2px)',
                      boxShadow: `0 8px 24px ${app.color}12`,
                    },
                    '&:active': {
                      transform: 'translateY(0)',
                    },
                  }}
                >
                  {/* Status dot — top right */}
                  <Box sx={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}>
                    <Box sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: isChecking ? 'text.disabled' : isOnline ? 'success.main' : 'error.main',
                      animation: isOnline ? 'pulse-dot 2s ease-in-out infinite' : 'none',
                    }} />
                  </Box>

                  <Box sx={{
                    width: 48,
                    height: 48,
                    borderRadius: '12px',
                    backgroundColor: `${app.color}14`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 200ms ease',
                  }}>
                    <AppIcon sx={{ fontSize: 24, color: app.color }} />
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography sx={{
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      color: 'text.primary',
                      lineHeight: 1.2,
                      mb: 0.25,
                    }}>
                      {app.displayName}
                    </Typography>
                    <Typography sx={{
                      fontSize: '0.7rem',
                      color: 'text.secondary',
                      lineHeight: 1.3,
                    }}>
                      {app.description}
                    </Typography>
                  </Box>
                  {/* Health detail line */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography sx={{
                      fontSize: '0.6rem',
                      fontFamily: '"Geist Mono", monospace',
                      color: 'text.disabled',
                    }}>
                      {isChecking ? 'checking...' : isOnline ? `${health.latency}ms` : 'offline'}
                    </Typography>
                    {health?.version && (
                      <Typography sx={{
                        fontSize: '0.55rem',
                        fontFamily: '"Geist Mono", monospace',
                        color: 'text.disabled',
                        px: 0.6,
                        py: 0.1,
                        borderRadius: '3px',
                        border: '1px solid',
                        borderColor: 'divider',
                      }}>
                        v{health.version}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      </Box>

      {/* Footer note */}
      <Box sx={{
        mt: 4,
        pt: 3,
        borderTop: '1px solid',
        borderColor: 'divider',
      }}>
        <Typography sx={{
          fontSize: '0.75rem',
          color: 'text.disabled',
          fontFamily: '"Geist Mono", monospace',
        }}>
          GeekSuite — shared authentication across all applications
        </Typography>
      </Box>
    </Box>
  );
}