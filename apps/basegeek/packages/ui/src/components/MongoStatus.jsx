import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import api from '../api';

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
    <Box>
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            MongoDB Server Status
          </Typography>
          <Typography color={status.isConnected ? "success.main" : "error.main"} variant="subtitle1">
            {status.isConnected ? "Connected" : "Disconnected"}
          </Typography>
          {status.error && (
            <Typography color="error" variant="body2">
              Error: {status.error}
            </Typography>
          )}
          {status.serverInfo && (
            <Box mt={2}>
              <Typography variant="subtitle2">Server Info</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2">Version: {status.serverInfo.version}</Typography>
                  <Typography variant="body2">Uptime: {formatUptime(status.serverInfo.uptime)}</Typography>
                  <Typography variant="body2">Host: {status.serverInfo.host}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">Connections: {status.serverInfo.connections}</Typography>
                  {status.serverInfo.memory && (
                    <>
                      <Typography variant="body2">Memory Resident: {formatBytes(status.serverInfo.memory.resident)}</Typography>
                      <Typography variant="body2">Memory Virtual: {formatBytes(status.serverInfo.memory.virtual)}</Typography>
                    </>
                  )}
                </Grid>
              </Grid>
            </Box>
          )}
        </CardContent>
      </Card>
      {status.databases.map((db) => (
        <Card key={db.name} variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Database: {db.name}
            </Typography>
            {db.stats && (
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle2">Database Stats</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2">Collections: {db.stats.collections}</Typography>
                    <Typography variant="body2">Objects: {db.stats.objects}</Typography>
                    <Typography variant="body2">Avg Object Size: {formatBytes(db.stats.avgObjSize)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">Data Size: {formatBytes(db.stats.dataSize)}</Typography>
                    <Typography variant="body2">Storage Size: {formatBytes(db.stats.storageSize)}</Typography>
                    <Typography variant="body2">Index Size: {formatBytes(db.stats.indexSize)}</Typography>
                  </Grid>
                </Grid>
              </Paper>
            )}
            {db.collections && db.collections.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2">Collections</Typography>
                <List dense>
                  {db.collections.map((collection) => (
                    <ListItem key={collection.name}>
                      <ListItemText
                        primary={collection.name}
                        secondary={
                          <Box component="span" sx={{ display: 'flex', gap: 2 }}>
                            <Typography variant="body2" component="span">
                              Documents: {collection.count}
                            </Typography>
                            <Typography variant="body2" component="span">
                              Size: {formatBytes(collection.size)}
                            </Typography>
                            <Typography variant="body2" component="span">
                              Indexes: {collection.indexes}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}