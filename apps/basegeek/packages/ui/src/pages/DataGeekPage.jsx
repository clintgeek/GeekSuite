import { Box, Paper, Tabs, Tab, Card, CardContent, Typography, CircularProgress, Grid, Divider, Stack } from '@mui/material';
import { useState, useEffect } from 'react';
import MongoStatus from '../components/MongoStatus';
import api from '../api';

function RedisStatus() {
  const [status, setStatus] = useState({
    isLoading: true,
    isConnected: false,
    error: null,
    redisVersion: null,
    uptime: null,
    connectedClients: null,
    usedMemory: null,
    totalKeys: null
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await api.get('/redis/status');
        setStatus({
          isLoading: false,
          isConnected: response.data.status === 'connected',
          error: null,
          redisVersion: response.data.redisVersion,
          uptime: response.data.uptime,
          connectedClients: response.data.connectedClients,
          usedMemory: response.data.usedMemory,
          totalKeys: response.data.totalKeys
        });
      } catch (error) {
        setStatus({
          isLoading: false,
          isConnected: false,
          error: error.response?.data?.message || error.message,
          redisVersion: null,
          uptime: null,
          connectedClients: null,
          usedMemory: null,
          totalKeys: null
        });
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (status.isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Redis Status
        </Typography>
        <Typography color={status.isConnected ? "success.main" : "error.main"} variant="subtitle1">
          {status.isConnected ? "Connected" : "Disconnected"}
        </Typography>
        {status.error && (
          <Typography color="error" variant="body2">
            Error: {status.error}
          </Typography>
        )}
        {status.isConnected && (
          <Grid container spacing={2} mt={2}>
            <Grid item xs={6}>
              <Typography variant="body2">Version: {status.redisVersion}</Typography>
              <Typography variant="body2">Uptime (s): {status.uptime}</Typography>
              <Typography variant="body2">Clients: {status.connectedClients}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2">Used Memory: {status.usedMemory}</Typography>
              <Typography variant="body2">Total Keys: {status.totalKeys}</Typography>
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  );
}

function formatPostgresUptime(uptime) {
  if (!uptime) return '';
  if (typeof uptime === 'string') return uptime;
  if (typeof uptime === 'object') {
    // Try to join all values (e.g., { hours: 1, minutes: 2, seconds: 3 })
    return Object.entries(uptime)
      .map(([k, v]) => `${v} ${k}`)
      .join(' ');
  }
  return String(uptime);
}

function PostgresStatus() {
  const [status, setStatus] = useState({
    isLoading: true,
    isConnected: false,
    error: null,
    version: null,
    uptime: null,
    dbSize: null,
    connectionCount: null
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await api.get('/postgres/status');
        setStatus({
          isLoading: false,
          isConnected: response.data.status === 'connected',
          error: null,
          version: response.data.version,
          uptime: response.data.uptime,
          dbSize: response.data.dbSize,
          connectionCount: response.data.connectionCount
        });
      } catch (error) {
        setStatus({
          isLoading: false,
          isConnected: false,
          error: error.response?.data?.message || error.message,
          version: null,
          uptime: null,
          dbSize: null,
          connectionCount: null
        });
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (status.isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Postgres Status
        </Typography>
        <Typography color={status.isConnected ? "success.main" : "error.main"} variant="subtitle1">
          {status.isConnected ? "Connected" : "Disconnected"}
        </Typography>
        {status.error && (
          <Typography color="error" variant="body2">
            Error: {status.error}
          </Typography>
        )}
        {status.isConnected && (
          <Grid container spacing={2} mt={2}>
            <Grid item xs={6}>
              <Typography variant="body2">Version: {status.version}</Typography>
              <Typography variant="body2">Uptime: {formatPostgresUptime(status.uptime)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2">DB Size: {status.dbSize}</Typography>
              <Typography variant="body2">Connections: {status.connectionCount}</Typography>
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  );
}

function InfluxStatus() {
  const [status, setStatus] = useState({
    isLoading: true,
    status: 'disconnected',
    error: null,
    config: null,
    measurements: { count: 0, samples: [] },
    stats: { pointsLastHour: null, lastPointTime: null }
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await api.get('/influx/status');
        setStatus({
          isLoading: false,
          status: response.data.status,
          error: response.data.status === 'error' ? response.data.message : null,
          config: response.data.config,
          measurements: response.data.measurements || { count: 0, samples: [] },
          stats: response.data.stats || { pointsLastHour: null, lastPointTime: null }
        });
      } catch (error) {
        setStatus({
          isLoading: false,
          status: 'error',
          error: error.response?.data?.message || error.message,
          config: null,
          measurements: { count: 0, samples: [] },
          stats: { pointsLastHour: null, lastPointTime: null }
        });
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (status.isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  const isConnected = status.status === 'connected';

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          InfluxDB Status
        </Typography>
        <Typography color={isConnected ? 'success.main' : 'error.main'} variant="subtitle1">
          {isConnected ? 'Connected' : status.status === 'unreachable' ? 'Unreachable' : 'Disconnected'}
        </Typography>
        {status.error && (
          <Typography color="error" variant="body2">
            Error: {status.error}
          </Typography>
        )}
        {isConnected && (
          <Stack spacing={2} mt={2}>
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Configuration
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2">Org: {status.config?.org}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">Bucket: {status.config?.bucket}</Typography>
                </Grid>
              </Grid>
            </Box>
            <Divider />
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Measurements
              </Typography>
              <Typography variant="body2">Total: {status.measurements.count}</Typography>
              {status.measurements.samples?.length > 0 && (
                <Typography variant="body2">
                  Samples: {status.measurements.samples.join(', ')}
                </Typography>
              )}
            </Box>
            <Divider />
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Recent Activity
              </Typography>
              <Typography variant="body2">
                Points (last hour): {status.stats.pointsLastHour ?? 'n/a'}
              </Typography>
              <Typography variant="body2">
                Last point: {status.stats.lastPointTime ? new Date(status.stats.lastPointTime).toLocaleString() : 'n/a'}
              </Typography>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

export default function DataGeekPage() {
  console.log('DataGeekPage component rendering');
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>DataGeek</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        Database and infrastructure status
      </Typography>

      <Box sx={{
        borderRadius: '12px',
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        mb: 3,
        overflow: 'hidden',
      }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} centered>
          <Tab label="Mongo" />
          <Tab label="Redis" />
          <Tab label="Postgres" />
          <Tab label="InfluxDB" />
        </Tabs>
      </Box>
      {tab === 0 && <MongoStatus />}
      {tab === 1 && <RedisStatus />}
      {tab === 2 && <PostgresStatus />}
      {tab === 3 && <InfluxStatus />}
    </Box>
  );
}