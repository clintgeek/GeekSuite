import React, { useId, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Alert,
  Snackbar,
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
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { apolloClient } from '../apolloClient';
import { GET_API_KEYS, GET_API_KEYS_APPS_LIST } from '../graphql/queries';
import { CREATE_API_KEY, UPDATE_API_KEY, DELETE_API_KEY, REGENERATE_API_KEY } from '../graphql/mutations';
import ConsoleDialog from '../components/primitives/ConsoleDialog';
import ResponsiveTable from '../components/primitives/ResponsiveTable';

const AVAILABLE_PERMISSIONS = [
  { value: 'ai:call', label: 'AI Calls', description: 'Make AI API calls' },
  { value: 'ai:models', label: 'Models', description: 'Access model information' },
  { value: 'ai:providers', label: 'Providers', description: 'Access provider information' },
  { value: 'ai:stats', label: 'Statistics', description: 'View AI usage statistics' },
  { value: 'ai:director', label: 'Director', description: 'Access AI Director features' },
  { value: 'ai:usage', label: 'Usage', description: 'View usage analytics' }
];

const APIKeysPage = () => {
  const createFormId = useId();
  const editFormId = useId();
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
      const { data } = await apolloClient.query({ query: GET_API_KEYS, fetchPolicy: 'network-only' });
      setApiKeys(data.apiKeys || []);
    } catch (error) {
      showSnackbar('Failed to fetch API keys', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchApps = async () => {
    try {
      const { data } = await apolloClient.query({ query: GET_API_KEYS_APPS_LIST, fetchPolicy: 'network-only' });
      setApps(data.apiKeysAppsList || []);
    } catch (error) {
      console.error('Failed to fetch apps:', error);
    }
  };

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCreateApiKey = async (e) => {
    e?.preventDefault?.();
    try {
      const { data } = await apolloClient.mutate({
        mutation: CREATE_API_KEY,
        variables: {
          name: formData.name,
          appName: formData.appName,
          description: formData.description,
          permissions: formData.permissions,
          rateLimit: formData.rateLimit,
          expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null
        }
      });
      setNewApiKey(data.createAPIKey.apiKey);
      setShowNewApiKey(true);
      setCreateDialogOpen(false);
      fetchApiKeys();
      fetchApps();
      showSnackbar('API key created successfully', 'success');
      resetForm();
    } catch (error) {
      showSnackbar(error.message || 'Failed to create API key', 'error');
    }
  };

  const handleUpdateApiKey = async (e) => {
    e?.preventDefault?.();
    try {
      await apolloClient.mutate({
        mutation: UPDATE_API_KEY,
        variables: {
          id: selectedKey.id,
          name: formData.name,
          description: formData.description,
          permissions: formData.permissions,
          rateLimit: formData.rateLimit,
          expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null,
          isActive: formData.isActive
        }
      });
      setEditDialogOpen(false);
      fetchApiKeys();
      fetchApps();
      showSnackbar('API key updated successfully', 'success');
      resetForm();
    } catch (error) {
      showSnackbar(error.message || 'Failed to update API key', 'error');
    }
  };

  const handleDeleteApiKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }

    try {
      await apolloClient.mutate({ mutation: DELETE_API_KEY, variables: { id: keyId } });
      fetchApiKeys();
      fetchApps();
      showSnackbar('API key deleted successfully', 'success');
    } catch (error) {
      showSnackbar(error.message || 'Failed to delete API key', 'error');
    }
  };

  const handleRegenerateApiKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to regenerate this API key? The old key will stop working immediately.')) {
      return;
    }

    try {
      const { data } = await apolloClient.mutate({ mutation: REGENERATE_API_KEY, variables: { id: keyId } });
      setNewApiKey(data.regenerateAPIKey.apiKey);
      setShowNewApiKey(true);
      fetchApiKeys();
      showSnackbar('API key regenerated successfully', 'success');
    } catch (error) {
      showSnackbar(error.message || 'Failed to regenerate API key', 'error');
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
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 3 }}>
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
            <ResponsiveTable
              rowKey={(apiKey) => apiKey.id}
              renderCardHeader={(apiKey) => (
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
              )}
              columns={[
                { key: 'name', label: 'Name', card: false, render: (apiKey) => (
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
                ) },
                { key: 'appName', label: 'App' },
                { key: 'keyPrefix', label: 'Key Prefix', render: (apiKey) => (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" fontFamily="monospace">
                      {apiKey.keyPrefix}...
                    </Typography>
                    <Tooltip title="Copy prefix">
                      <IconButton size="small" onClick={() => copyToClipboard(apiKey.keyPrefix)} sx={{ minWidth: 44, minHeight: 44 }}>
                        <CopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) },
                { key: 'permissions', label: 'Permissions', render: (apiKey) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: { xs: 'flex-end', md: 'flex-start' } }}>
                    {apiKey.permissions.map((perm) => (
                      <Chip
                        key={perm}
                        label={perm.replace('ai:', '')}
                        size="small"
                        variant="outlined"
                      />
                    ))}
                  </Box>
                ) },
                { key: 'usage', label: 'Usage', render: (apiKey) => (
                  <Box>
                    <Typography variant="body2">
                      {formatUsage(apiKey.usage)}
                    </Typography>
                    {apiKey.usage.lastUsed && (
                      <Typography variant="caption" color="text.secondary">
                        Last: {formatDate(apiKey.usage.lastUsed)}
                      </Typography>
                    )}
                  </Box>
                ) },
                { key: 'status', label: 'Status', render: (apiKey) => (
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
                ) },
              ]}
              rows={apiKeys}
              renderActions={(apiKey) => (
                <>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => openEditDialog(apiKey)} sx={{ minWidth: 44, minHeight: 44 }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Regenerate">
                    <IconButton size="small" onClick={() => handleRegenerateApiKey(apiKey.id)} sx={{ minWidth: 44, minHeight: 44 }}>
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" onClick={() => handleDeleteApiKey(apiKey.id)} sx={{ minWidth: 44, minHeight: 44 }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            />
          )}
        </CardContent>
      </Card>

      {/* Create API Key Dialog */}
      <ConsoleDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        eyebrow="API Key"
        title="Create new API key"
        primaryAction={<Button type="submit" form={createFormId} variant="contained">Create</Button>}
        secondaryAction={<Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>}
      >
        <form id={createFormId} onSubmit={handleCreateApiKey}>
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
        </form>
      </ConsoleDialog>

      {/* Edit API Key Dialog */}
      <ConsoleDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        eyebrow="API Key"
        title="Edit API key"
        primaryAction={<Button type="submit" form={editFormId} variant="contained">Update</Button>}
        secondaryAction={<Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>}
      >
        <form id={editFormId} onSubmit={handleUpdateApiKey}>
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
        </form>
      </ConsoleDialog>

      {/* New API Key Display Dialog */}
      <ConsoleDialog
        open={showNewApiKey}
        onClose={() => setShowNewApiKey(false)}
        eyebrow="API Key"
        title="API key created"
        primaryAction={
          <Button onClick={() => setShowNewApiKey(false)} variant="contained">
            I've Saved the Key
          </Button>
        }
      >
        <Alert severity="warning" sx={{ mb: 2 }}>
          This is the only time you will see this API key. Please copy and store it securely.
        </Alert>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="body2" fontFamily="monospace" sx={{ flexGrow: 1, wordBreak: 'break-all' }}>
            {newApiKey}
          </Typography>
          <Tooltip title="Copy API Key">
            <IconButton onClick={() => copyToClipboard(newApiKey)} sx={{ minWidth: 44, minHeight: 44 }}>
              <CopyIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </ConsoleDialog>

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
