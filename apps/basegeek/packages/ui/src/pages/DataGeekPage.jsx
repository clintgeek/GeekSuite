import { Box, Tabs, Tab, Typography, CircularProgress } from '@mui/material';
import Readouts from '../signalbox/Readouts';
import { Dymo } from '../signalbox/Labels';
import { Cabinet } from '../signalbox/Cabinet';
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
    <Cabinet number={2} title="Redis" connected={status.isConnected} error={status.error}>
      {status.isConnected && (
        <Readouts
          items={[
            { label: 'Version', value: status.redisVersion },
            { label: 'Uptime', value: formatSeconds(status.uptime) },
            { label: 'Clients', value: status.connectedClients },
            { label: 'Used memory', value: status.usedMemory },
            { label: 'Total keys', value: status.totalKeys?.toLocaleString?.() ?? status.totalKeys },
          ]}
        />
      )}
    </Cabinet>
  );
}

/** Seconds as "5d 22h 19m" — Redis reports uptime in seconds. */
function formatSeconds(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return seconds;
  const d = Math.floor(n / 86400);
  const h = Math.floor((n % 86400) / 3600);
  const m = Math.floor((n % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
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
    <Cabinet number={3} title="Postgres" connected={status.isConnected} error={status.error}>
      {status.isConnected && (
        <>
          <Readouts
            items={[
              { label: 'Uptime', value: formatPostgresUptime(status.uptime) },
              { label: 'DB size', value: status.dbSize },
              { label: 'Connections', value: status.connectionCount },
            ]}
          />
          {status.version && (
            <Typography variant="body2" sx={{ mt: 1.5, color: 'text.secondary', fontFamily: 'fontFamilyMono', overflowWrap: 'anywhere' }}>
              {status.version}
            </Typography>
          )}
        </>
      )}
    </Cabinet>
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
    <Cabinet
      number={4}
      title="InfluxDB"
      connected={isConnected}
      stateWord={isConnected ? 'connected' : status.status === 'unreachable' ? 'unreachable' : 'disconnected'}
      error={status.error}
    >
      {isConnected && (
        <>
          <Readouts
            items={[
              { label: 'Org', value: status.config?.org },
              { label: 'Bucket', value: status.config?.bucket },
              { label: 'Measurements', value: status.measurements.count },
              { label: 'Points, last hour', value: status.stats.pointsLastHour?.toLocaleString?.() ?? 'n/a' },
              { label: 'Last point', value: status.stats.lastPointTime ? new Date(status.stats.lastPointTime).toLocaleString() : 'n/a' },
            ]}
          />
          {status.measurements.samples?.length > 0 && (
            <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Samples:</Typography>
              {status.measurements.samples.map((m) => <Dymo key={m}>{m}</Dymo>)}
            </Box>
          )}
        </>
      )}
    </Cabinet>
  );
}

export default function DataGeekPage() {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
        The relay room: each shared database in its own cabinet, re-read every 30 seconds.
      </Typography>

      <Box sx={(theme) => ({
        borderRadius: 1,
        border: `1px solid ${theme.palette.line.strong}`,
        bgcolor: theme.palette.box.tape.black,
        mb: 3,
        overflow: 'hidden',
        '& .MuiTab-root': { color: '#b0b6be', minHeight: 48 },
        '& .MuiTab-root.Mui-selected': { color: theme.palette.box.plate.shine },
        '& .MuiTabs-scrollButtons': { color: '#ece6d6' },
      })}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ '& .MuiTabs-flexContainer': { justifyContent: { xs: 'flex-start', sm: 'center' } } }}
        >
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