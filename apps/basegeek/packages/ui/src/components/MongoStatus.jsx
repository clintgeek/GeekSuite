import { useState, useEffect } from 'react';
import { Typography, Box, CircularProgress } from '@mui/material';
import api from '../api';
import Panel from '../signalbox/Panel';
import Readouts from '../signalbox/Readouts';
import { Dymo } from '../signalbox/Labels';
import { Cabinet } from '../signalbox/Cabinet';

const formatBytes = (bytes, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
};

export default function MongoStatus() {
  const [status, setStatus] = useState({
    isLoading: true,
    isConnected: false,
    error: null,
    serverInfo: null,
    databases: []
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await api.get('/mongo/status');
        setStatus({
          isLoading: false,
          isConnected: true,
          error: null,
          serverInfo: response.data.serverInfo,
          databases: response.data.databases || []
        });
      } catch (error) {
        setStatus({
          isLoading: false,
          isConnected: false,
          error: error.response?.data?.message || error.message,
          serverInfo: null,
          databases: []
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
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Cabinet number={1} title="MongoDB" connected={status.isConnected} error={status.error}>
        {status.serverInfo && (
          <Readouts
            items={[
              { label: 'Version', value: status.serverInfo.version },
              { label: 'Uptime', value: formatUptime(status.serverInfo.uptime) },
              { label: 'Host', value: status.serverInfo.host },
              { label: 'Connections', value: status.serverInfo.connections },
              ...(status.serverInfo.memory
                ? [
                  { label: 'Memory resident', value: formatBytes(status.serverInfo.memory.resident) },
                  { label: 'Memory virtual', value: formatBytes(status.serverInfo.memory.virtual) },
                ]
                : []),
            ]}
          />
        )}
      </Cabinet>
      {status.databases.map((db) => (
        <Panel key={db.name} title={`Database: ${db.name}`} headingComponent="h3">
          {db.stats && (
            <Readouts
              items={[
                { label: 'Collections', value: db.stats.collections },
                { label: 'Objects', value: db.stats.objects?.toLocaleString?.() ?? db.stats.objects },
                { label: 'Avg object', value: formatBytes(db.stats.avgObjSize) },
                { label: 'Data size', value: formatBytes(db.stats.dataSize) },
                { label: 'Storage size', value: formatBytes(db.stats.storageSize) },
                { label: 'Index size', value: formatBytes(db.stats.indexSize) },
              ]}
            />
          )}
          {db.collections && db.collections.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Dymo sx={{ mb: 1 }}>Collections</Dymo>
              <Box component="ul" sx={{ m: 0, p: 0 }}>
                {db.collections.map((collection) => (
                  <Box
                    component="li"
                    key={collection.name}
                    sx={{
                      listStyle: 'none',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'baseline',
                      columnGap: 2,
                      rowGap: 0.25,
                      py: 1,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>
                      {collection.name}
                    </Typography>
                    <Typography variant="body2" component="span" sx={{ fontFamily: 'fontFamilyMono', color: 'text.secondary' }}>
                      Documents: {collection.count?.toLocaleString?.() ?? collection.count}
                    </Typography>
                    <Typography variant="body2" component="span" sx={{ fontFamily: 'fontFamilyMono', color: 'text.secondary' }}>
                      Size: {formatBytes(collection.size)}
                    </Typography>
                    <Typography variant="body2" component="span" sx={{ fontFamily: 'fontFamilyMono', color: 'text.secondary' }}>
                      Indexes: {collection.indexes}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Panel>
      ))}
    </Box>
  );
}
