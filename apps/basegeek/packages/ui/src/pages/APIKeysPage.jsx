import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Alert,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import api from '../api';

const AVAILABLE_PERMISSIONS = [
  { value: 'ai:call', label: 'AI Calls', description: 'Make AI API calls' },
  { value: 'ai:models', label: 'Models', description: 'Access model information' },
  { value: 'ai:providers', label: 'Providers', description: 'Access provider information' },
  { value: 'ai:stats', label: 'Statistics', description: 'View AI usage statistics' },
  { value: 'ai:director', label: 'Director', description: 'Access AI Director features' },
  { value: 'ai:usage', label: 'Usage', description: 'View usage analytics' }
];

const APIKeysPage = () => {
  const [apiKeys, setApiKeys] = useState([]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [newApiKey, setNewApiKey] = useState('');
  const [showNewApiKey, setShowNewApiKey] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const [formData, setFormData] = useState({
    name: '',
    appName: '',
    description: '',
    permissions: ['ai:call', 'ai:models', 'ai:providers'],
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      requestsPerDay: 10000
    },
    expiresAt: '',
    isActive: true
  });

  useEffect(() => {
    fetchApiKeys();
    fetchApps();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const response = await api.get('/api-keys');
      setApiKeys(response.data.data.apiKeys);
    } catch (error) {
      showSnackbar('Failed to fetch API keys', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchApps = async () => {
    try {
      const response = await api.get('/api-keys/apps/list');
      setApps(response.data.data.apps);
    } catch (error) {
      console.error('Failed to fetch apps:', error);
    }
  };

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCreateApiKey = async () => {
    try {
      const response = await api.post('/api-keys', formData);
      setNewApiKey(response.data.data.apiKey);
      setShowNewApiKey(true);
      setCreateDialogOpen(false);
      fetchApiKeys();
      fetchApps();
      showSnackbar('API key created successfully', 'success');
      resetForm();
    } catch (error) {
      showSnackbar(error.response?.data?.error?.message || 'Failed to create API key', 'error');
    }
  };

  const handleUpdateApiKey = async () => {
    try {
      await api.put(`/api-keys/${selectedKey.id}`, formData);
      setEditDialogOpen(false);
      fetchApiKeys();
      fetchApps();
      showSnackbar('API key updated successfully', 'success');
      resetForm();
    } catch (error) {
      showSnackbar(error.response?.data?.error?.message || 'Failed to update API key', 'error');
    }
  };

  const handleDeleteApiKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }

    try {
      await api.delete(`/api-keys/${keyId}`);
      fetchApiKeys();
      fetchApps();
      showSnackbar('API key deleted successfully', 'success');
    } catch (error) {
      showSnackbar(error.response?.data?.error?.message || 'Failed to delete API key', 'error');
    }
  };

  const handleRegenerateApiKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to regenerate this API key? The old key will stop working immediately.')) {
      return;
    }

    try {
      const response = await api.post(`/api-keys/${keyId}/regenerate`);
      setNewApiKey(response.data.data.apiKey);
      setShowNewApiKey(true);
      fetchApiKeys();
      showSnackbar('API key regenerated successfully', 'success');
    } catch (error) {
      showSnackbar(error.response?.data?.error?.message || 'Failed to regenerate API key', 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      appName: '',
      description: '',
      permissions: ['ai:call', 'ai:models', 'ai:providers'],
      rateLimit: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        requestsPerDay: 10000
      },
      expiresAt: '',
      isActive: true
    });
    setSelectedKey(null);
  };

  const openEditDialog = (apiKey) => {
    setSelectedKey(apiKey);
    setFormData({
      name: apiKey.name,
      appName: apiKey.appName,
      description: apiKey.description || '',
      permissions: apiKey.permissions,
      rateLimit: apiKey.rateLimit,
      expiresAt: apiKey.expiresAt ? new Date(apiKey.expiresAt).toISOString().split('T')[0] : '',
      isActive: apiKey.isActive
    });
    setEditDialogOpen(true);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showSnackbar('Copied to clipboard', 'success');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never expires';
    return new Date(dateString).toLocaleDateString();
  };

  const formatUsage = (usage) => {
    return `${usage.totalRequests} total, ${usage.requestsToday} today`;
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading API keys...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          API Keys Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Create API Key
        </Button>
      </Box>

      {/* Apps Summary */}
      {apps.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Apps Summary
            </Typography>
            <Grid container spacing={2}>
              {apps.map((app) => (
                <Grid item xs={12} sm={6} md={4} key={app.appName}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {app.appName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {app.keyCount} key{app.keyCount !== 1 ? 's' : ''}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {app.totalRequests} total requests
                      </Typography>
                      {app.lastUsed && (
                        <Typography variant="body2" color="text.secondary">
                          Last used: {formatDate(app.lastUsed)}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* API Keys List */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            API Keys ({apiKeys.length})
          </Typography>

          {apiKeys.length === 0 ? (
            <Typography color="text.secondary">
              No API keys found. Create your first API key to get started.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>App</TableCell>
                    <TableCell>Key Prefix</TableCell>
                    <TableCell>Permissions</TableCell>
                    <TableCell>Usage</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {apiKeys.map((apiKey) => (
                    <TableRow key={apiKey.id}>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">
                            {apiKey.name}
                          </Typography>
                          {apiKey.description && (
                            <Typography variant="caption" color="text.secondary">
                              {apiKey.description}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>{apiKey.appName}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontFamily="monospace">
                            {apiKey.keyPrefix}...
                          </Typography>
                          <Tooltip title="Copy prefix">
                            <IconButton size="small" onClick={() => copyToClipboard(apiKey.keyPrefix)}>
                              <CopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {apiKey.permissions.map((perm) => (
                            <Chip
                              key={perm}
                              label={perm.replace('ai:', '')}
                              size="small"
                              variant="outlined"
                            />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatUsage(apiKey.usage)}
                        </Typography>
                        {apiKey.usage.lastUsed && (
                          <Typography variant="caption" color="text.secondary">
                            Last: {formatDate(apiKey.usage.lastUsed)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Chip
                            label={apiKey.isActive ? 'Active' : 'Inactive'}
                            color={apiKey.isActive ? 'success' : 'default'}
                            size="small"
                          />
                          {apiKey.isExpired && (
                            <Chip
                              label="Expired"
                              color="error"
                              size="small"
                              sx={{ ml: 1 }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openEditDialog(apiKey)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Regenerate">
                            <IconButton size="small" onClick={() => handleRegenerateApiKey(apiKey.id)}>
                              <RefreshIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" onClick={() => handleDeleteApiKey(apiKey.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Create API Key Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create New API Key</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              fullWidth
            />
            <TextField
              label="App Name"
              value={formData.appName}
              onChange={(e) => setFormData({ ...formData, appName: e.target.value })}
              required
              fullWidth
              helperText="Use letters, numbers, hyphens, and underscores only"
            />
            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              multiline
              rows={2}
              fullWidth
            />

            <FormControl fullWidth>
              <InputLabel>Permissions</InputLabel>
              <Select
                multiple
                value={formData.permissions}
                onChange={(e) => setFormData({ ...formData, permissions: e.target.value })}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip key={value} label={value.replace('ai:', '')} size="small" />
                    ))}
                  </Box>
                )}
              >
                {AVAILABLE_PERMISSIONS.map((perm) => (
                  <MenuItem key={perm.value} value={perm.value}>
                    <Box>
                      <Typography variant="body2">{perm.label}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {perm.description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Rate Limits</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    label="Requests per Minute"
                    type="number"
                    value={formData.rateLimit.requestsPerMinute}
                    onChange={(e) => setFormData({
                      ...formData,
                      rateLimit: { ...formData.rateLimit, requestsPerMinute: parseInt(e.target.value) }
                    })}
                    inputProps={{ min: 1, max: 1000 }}
                  />
                  <TextField
                    label="Requests per Hour"
                    type="number"
                    value={formData.rateLimit.requestsPerHour}
                    onChange={(e) => setFormData({
                      ...formData,
                      rateLimit: { ...formData.rateLimit, requestsPerHour: parseInt(e.target.value) }
                    })}
                    inputProps={{ min: 1, max: 10000 }}
                  />
                  <TextField
                    label="Requests per Day"
                    type="number"
                    value={formData.rateLimit.requestsPerDay}
                    onChange={(e) => setFormData({
                      ...formData,
                      rateLimit: { ...formData.rateLimit, requestsPerDay: parseInt(e.target.value) }
                    })}
                    inputProps={{ min: 1, max: 100000 }}
                  />
                </Box>
              </AccordionDetails>
            </Accordion>

            <TextField
              label="Expiration Date"
              type="date"
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              InputLabelProps={{ shrink: true }}
              helperText="Leave empty for no expiration"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateApiKey} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>

      {/* Edit API Key Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit API Key</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              fullWidth
            />
            <TextField
              label="App Name"
              value={formData.appName}
              disabled
              fullWidth
              helperText="App name cannot be changed"
            />
            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              multiline
              rows={2}
              fullWidth
            />

            <FormControl fullWidth>
              <InputLabel>Permissions</InputLabel>
              <Select
                multiple
                value={formData.permissions}
                onChange={(e) => setFormData({ ...formData, permissions: e.target.value })}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip key={value} label={value.replace('ai:', '')} size="small" />
                    ))}
                  </Box>
                )}
              >
                {AVAILABLE_PERMISSIONS.map((perm) => (
                  <MenuItem key={perm.value} value={perm.value}>
                    <Box>
                      <Typography variant="body2">{perm.label}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {perm.description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
              }
              label="Active"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleUpdateApiKey} variant="contained">Update</Button>
        </DialogActions>
      </Dialog>

      {/* New API Key Display Dialog */}
      <Dialog open={showNewApiKey} onClose={() => setShowNewApiKey(false)} maxWidth="md" fullWidth>
        <DialogTitle>API Key Created Successfully</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This is the only time you will see this API key. Please copy and store it securely.
          </Alert>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="body2" fontFamily="monospace" sx={{ flexGrow: 1, wordBreak: 'break-all' }}>
              {newApiKey}
            </Typography>
            <Tooltip title="Copy API Key">
              <IconButton onClick={() => copyToClipboard(newApiKey)}>
                <CopyIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewApiKey(false)} variant="contained">
            I've Saved the Key
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default APIKeysPage;