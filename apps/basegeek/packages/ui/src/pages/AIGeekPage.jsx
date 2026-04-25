import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Switch,
  FormControlLabel,
  Grid,
  Alert,
  CircularProgress,
  Chip,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tabs,
  Tab,
  Divider,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Analytics as AnalyticsIcon,
  Key as KeyIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Save as SaveIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  SmartToy as SmartToyIcon,
  Refresh as RefreshIcon,
  Sync as SyncIcon,
  Edit as EditIcon,
  AttachMoney as MoneyIcon,
  Apps as AppsIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { useBaseGeekAuth } from '../components/AuthContext';
import { apolloClient } from '../apolloClient';
import { GET_AI_CONFIG, GET_AI_STATS, GET_AI_DIRECTOR_MODELS, GET_AI_USAGE, GET_AI_APP_CONFIGS } from '../graphql/queries';
import { SAVE_AI_CONFIG, TEST_AI_PROVIDER, RESET_AI_STATS, SEED_DIRECTOR_PRICING, SEED_DIRECTOR_FREE_TIER, SYNC_PROVIDER_MODELS, UPDATE_MODEL_PRICING, UPDATE_MODEL_FREE_TIER, RESET_ALL_FREE_TIERS, BULK_UPDATE_FREE_TIERS, SAVE_AI_APP_CONFIG, DELETE_AI_APP_CONFIG } from '../graphql/mutations';


const AIGeekPage = () => {
  const { user } = useBaseGeekAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Configuration state
  const [config, setConfig] = useState({
    anthropic: { apiKey: '', enabled: true },
    groq: { apiKey: '', enabled: false },
    gemini: { apiKey: '', enabled: false },
    together: { apiKey: '', enabled: false },
    cohere: { apiKey: '', enabled: false },
    openrouter: { apiKey: '', enabled: false },
    cerebras: { apiKey: '', enabled: false },
    cloudflare: { apiKey: '', accountId: '', enabled: false },
    ollama: { apiKey: '', enabled: false },
    llm7: { apiKey: '', enabled: false },
    llmgateway: { apiKey: '', enabled: false }
  });

  // Usage statistics
  const [stats, setStats] = useState({
    totalCalls: 0,
    totalTokens: 0,
    totalCost: 0,
    providerUsage: {},
    appUsage: {}
  });

  // Show/hide API keys
  const [showKeys, setShowKeys] = useState(false);

  // AI Director state
  const [directorData, setDirectorData] = useState(null);
  const [directorLoading, setDirectorLoading] = useState(false);

  // Usage tracking state
  const [usageData, setUsageData] = useState({});
  const [usageLoading, setUsageLoading] = useState(false);

  // Model management state
  const [syncingProvider, setSyncingProvider] = useState(null);
  const [editingPricing, setEditingPricing] = useState(null);
  const [editingFreeTier, setEditingFreeTier] = useState(null);

  // Bulk free tier edit state
  const [freeTierEdits, setFreeTierEdits] = useState({}); // { "provider::modelId": { isFree, freeLimits } }
  const [savingBulk, setSavingBulk] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showRestoreDefaultsConfirm, setShowRestoreDefaultsConfirm] = useState(false);

  // App routing state
  const [appConfigs, setAppConfigs] = useState([]);
  const [discoveredApps, setDiscoveredApps] = useState([]);
  const [appConfigsLoading, setAppConfigsLoading] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [newAppName, setNewAppName] = useState('');

  useEffect(() => {
    loadConfiguration();
    loadStatistics();
    loadDirectorData();
    loadUsageData();
    loadAppConfigs();
  }, []);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      const { data } = await apolloClient.query({ query: GET_AI_CONFIG, fetchPolicy: 'network-only' });
      if (data && data.aiConfig) {
        setConfig(data.aiConfig);
      }
    } catch (error) {
      setError('Failed to load AI configuration');
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const { data } = await apolloClient.query({ query: GET_AI_STATS, fetchPolicy: 'network-only' });
      if (data && data.aiStats) {
        setStats(data.aiStats.data || data.aiStats);
      }
    } catch (error) {
      setError(`Failed to load statistics: ${error.message}`);
    }
  };



  const loadDirectorData = async () => {
    try {
      setDirectorLoading(true);

      const { data } = await apolloClient.query({ query: GET_AI_DIRECTOR_MODELS, fetchPolicy: 'network-only' });
      if (data && data.aiDirectorModels) {
        setDirectorData(data.aiDirectorModels);
      }
    } catch (error) {
      setError(`Failed to load AI Director data: ${error.message}`);
    } finally {
      setDirectorLoading(false);
    }
  };

  const restoreHardcodedDefaults = async () => {
    try {
      setSavingBulk(true);
      setError('');
      await apolloClient.mutate({ mutation: SEED_DIRECTOR_PRICING });
      await apolloClient.mutate({ mutation: SEED_DIRECTOR_FREE_TIER });
      setSuccess('Hardcoded defaults restored. Your manual selections have been overwritten.');
      setShowRestoreDefaultsConfirm(false);
      setFreeTierEdits({});
      await loadDirectorData();
    } catch (error) {
      setError(`Failed to restore defaults: ${error.message}`);
    } finally {
      setSavingBulk(false);
    }
  };

  const loadUsageData = async () => {
    try {
      setUsageLoading(true);
      // Only track providers with free tiers
      const providers = ['cerebras', 'groq', 'together', 'gemini', 'openrouter', 'cloudflare', 'ollama', 'llm7', 'llmgateway', 'cohere'];
      const usageSummary = {};

      for (const provider of providers) {
        try {
          const { data } = await apolloClient.query({ query: GET_AI_USAGE, variables: { provider }, fetchPolicy: 'network-only' });
          if (data && data.aiUsage) {
            usageSummary[provider] = data.aiUsage;
          }
        } catch {
        }
      }

      setUsageData(usageSummary);
    } catch (error) {
      setError(`Failed to load usage data: ${error.message}`);
    } finally {
      setUsageLoading(false);
    }
  };

  const saveConfiguration = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      await apolloClient.mutate({ mutation: SAVE_AI_CONFIG, variables: { config } });
      setSuccess('AI configuration saved successfully');
      await loadStatistics(); // Refresh stats after config change
    } catch (error) {
      setError(error.message || 'Failed to save AI configuration');
    } finally {
      setLoading(false);
    }
  };

  const testProvider = async (provider) => {
    try {
      setLoading(true);
      const { data } = await apolloClient.mutate({ mutation: TEST_AI_PROVIDER, variables: { provider } });
      if (data && data.testAIProvider) {
        setSuccess(`${provider} API key is valid`);
      } else {
        setError(`${provider} API key is invalid`);
      }
    } catch (error) {
      setError(`Failed to test ${provider} API key`);
    } finally {
      setLoading(false);
    }
  };

  const resetStatistics = async () => {
    try {
      await apolloClient.mutate({ mutation: RESET_AI_STATS });
      setSuccess('Statistics reset successfully');
      await loadStatistics();
    } catch (error) {
      setError('Failed to reset statistics');
    }
  };

  const handleConfigChange = (provider, field, value) => {
    setConfig(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [field]: value
      }
    }));
  };

  // Sync models for a specific provider
  const syncProviderModels = async (provider) => {
    try {
      setSyncingProvider(provider);
      setError('');
      const { data } = await apolloClient.mutate({
        mutation: SYNC_PROVIDER_MODELS,
        variables: { provider }
      });
      const result = data?.syncProviderModels;
      setSuccess(`${provider}: Synced ${result?.modelsFound || 0} models from API`);
      // Reload director data to show updated models
      await loadDirectorData();
    } catch (error) {
      setError(`Failed to sync ${provider} models: ${error.message}`);
    } finally {
      setSyncingProvider(null);
    }
  };

  // Save pricing for a model
  const savePricing = async () => {
    if (!editingPricing) return;
    try {
      setError('');
      await apolloClient.mutate({
        mutation: UPDATE_MODEL_PRICING,
        variables: {
          provider: editingPricing.provider,
          modelId: editingPricing.modelId,
          inputPrice: parseFloat(editingPricing.inputPrice) || 0,
          outputPrice: parseFloat(editingPricing.outputPrice) || 0
        }
      });
      setSuccess(`Pricing updated for ${editingPricing.modelId}`);
      setEditingPricing(null);
      await loadDirectorData();
    } catch (error) {
      setError(`Failed to update pricing: ${error.message}`);
    }
  };

  // Save free tier for a model (single-model — advanced dialog for audio limits + notes)
  const saveFreeTier = async () => {
    if (!editingFreeTier) return;
    try {
      setError('');
      await apolloClient.mutate({
        mutation: UPDATE_MODEL_FREE_TIER,
        variables: {
          provider: editingFreeTier.provider,
          modelId: editingFreeTier.modelId,
          isFree: editingFreeTier.isFree,
          freeLimits: editingFreeTier.freeLimits || {},
          notes: editingFreeTier.notes || ''
        }
      });
      setSuccess(`Free tier updated for ${editingFreeTier.modelId}`);
      // Clear dirty state for this model since backend now has truth
      const key = getFreeTierKey(editingFreeTier.provider, editingFreeTier.modelId);
      setFreeTierEdits(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setEditingFreeTier(null);
      await loadDirectorData();
    } catch (error) {
      setError(`Failed to update free tier: ${error.message}`);
    }
  };

  // Bulk free tier helpers
  const getFreeTierKey = (providerName, modelId) => `${providerName}::${modelId}`;

  const getModelFreeTierValue = (providerName, model) => {
    const key = getFreeTierKey(providerName, model.id);
    if (freeTierEdits[key] !== undefined) return freeTierEdits[key];
    return {
      isFree: model.freeTier?.isFree || false,
      freeLimits: model.freeTier?.limits || {}
    };
  };

  const updateFreeTierEdit = (providerName, modelId, field, value) => {
    const key = getFreeTierKey(providerName, modelId);
    setFreeTierEdits(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [field]: value
      }
    }));
  };

  const updateFreeTierLimit = (providerName, modelId, limitField, value) => {
    const key = getFreeTierKey(providerName, modelId);
    setFreeTierEdits(prev => {
      const existing = prev[key] || {};
      return {
        ...prev,
        [key]: {
          ...existing,
          freeLimits: {
            ...(existing.freeLimits || {}),
            [limitField]: value === '' ? undefined : parseInt(value) || 0
          }
        }
      };
    });
  };

  const saveAllFreeTiers = async () => {
    if (Object.keys(freeTierEdits).length === 0) return;
    try {
      setSavingBulk(true);
      setError('');
      const updates = Object.entries(freeTierEdits).map(([key, edit]) => {
        const [provider, modelId] = key.split('::');
        // Find original model to merge limits
        const providerData = directorData?.providers?.[provider];
        const model = providerData?.models?.find(m => m.id === modelId);
        const originalLimits = model?.freeTier?.limits || {};
        return {
          provider,
          modelId,
          isFree: edit.isFree ?? false,
          freeLimits: edit.freeLimits ? { ...originalLimits, ...edit.freeLimits } : originalLimits
        };
      });
      await apolloClient.mutate({
        mutation: BULK_UPDATE_FREE_TIERS,
        variables: { updates }
      });
      setSuccess(`${updates.length} model${updates.length !== 1 ? 's' : ''} updated`);
      setFreeTierEdits({});
      await loadDirectorData();
    } catch (error) {
      setError(`Failed to save free tier changes: ${error.message}`);
    } finally {
      setSavingBulk(false);
    }
  };

  const resetAllFreeTiers = async () => {
    try {
      setSavingBulk(true);
      setError('');
      const { data } = await apolloClient.mutate({ mutation: RESET_ALL_FREE_TIERS });
      const count = data?.resetAllFreeTiers ?? 0;
      setSuccess(`Reset ${count} model${count !== 1 ? 's' : ''} to non-free`);
      setShowResetConfirm(false);
      setFreeTierEdits({});
      await loadDirectorData();
    } catch (error) {
      setError(`Failed to reset free tiers: ${error.message}`);
    } finally {
      setSavingBulk(false);
    }
  };

  // App Routing handlers
  const loadAppConfigs = async () => {
    try {
      setAppConfigsLoading(true);
      const { data } = await apolloClient.query({ query: GET_AI_APP_CONFIGS, fetchPolicy: 'network-only' });
      if (data?.aiAppConfigs) {
        setAppConfigs(data.aiAppConfigs.configs || []);
        setDiscoveredApps(data.aiAppConfigs.discoveredApps || []);
      }
    } catch (error) {
      setError(`Failed to load app configs: ${error.message}`);
    } finally {
      setAppConfigsLoading(false);
    }
  };

  const saveAppConfig = async () => {
    if (!editingApp) return;
    try {
      setError('');
      await apolloClient.mutate({
        mutation: SAVE_AI_APP_CONFIG,
        variables: {
          appName: editingApp.appName,
          config: {
            displayName: editingApp.displayName || '',
            tier: editingApp.tier || 'free',
            provider: editingApp.provider || null,
            model: editingApp.model || null,
            fallbackOrder: editingApp.fallbackOrder || [],
            maxTokens: editingApp.maxTokens ? parseInt(editingApp.maxTokens) : null,
            temperature: editingApp.temperature != null && editingApp.temperature !== '' ? parseFloat(editingApp.temperature) : null,
            notes: editingApp.notes || '',
            enabled: editingApp.enabled !== false
          }
        }
      });
      setSuccess(`App config saved for ${editingApp.appName}`);
      setEditingApp(null);
      await loadAppConfigs();
    } catch (error) {
      setError(`Failed to save app config: ${error.message}`);
    }
  };

  const deleteAppConfig = async (appName) => {
    try {
      await apolloClient.mutate({ mutation: DELETE_AI_APP_CONFIG, variables: { appName } });
      setSuccess(`App config deleted for ${appName}`);
      await loadAppConfigs();
    } catch (error) {
      setError(`Failed to delete app config: ${error.message}`);
    }
  };

  const addDiscoveredApp = (appName) => {
    setEditingApp({
      appName,
      displayName: appName,
      tier: 'free',
      provider: null,
      model: null,
      fallbackOrder: [],
      maxTokens: null,
      temperature: null,
      notes: '',
      enabled: true
    });
  };

  const formatCost = (cost) => {
    if (cost === undefined || cost === null) {
      return '$0.0000';
    }
    return `$${cost.toFixed(4)}`;
  };

  const formatPricingCell = (value) => {
    if (value === undefined || value === null || value === 'Unknown' || value === '') return '—';
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return '—';
    // pricing stored as $/1M tokens
    return `$${num}/M`;
  };

  const formatTokens = (tokens) => {
    if (tokens === undefined || tokens === null) {
      return '0';
    }
    return tokens.toLocaleString();
  };

  const getProviderStatus = (provider) => {
    const providerConfig = config[provider];
    if (!providerConfig.apiKey) return 'not-configured';
    if (!providerConfig.enabled) return 'disabled';
    return 'configured';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'configured': return <CheckCircleIcon color="success" />;
      case 'disabled': return <WarningIcon color="warning" />;
      case 'not-configured': return <ErrorIcon color="error" />;
      default: return <ErrorIcon color="error" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'configured': return 'Configured';
      case 'disabled': return 'Disabled';
      case 'not-configured': return 'Not Configured';
      default: return 'Unknown';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

                                              <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
                        <Tab label="Configuration" icon={<SettingsIcon />} />
                        <Tab label="Usage & Cost" icon={<AnalyticsIcon />} />
                        <Tab label="Free Tier Config" icon={<WarningIcon />} />
                        <Tab label="AI Catalog" icon={<KeyIcon />} />
                        <Tab label="App Routing" icon={<AppsIcon />} />
                      </Tabs>

      {activeTab === 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              AI Provider Configuration
            </Typography>

            <Grid container spacing={3}>
              {Object.entries(config).map(([provider, providerConfig]) => (
                <Grid item xs={12} md={6} key={provider}>
                  <Card variant="outlined">
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={2}>
                        {getStatusIcon(getProviderStatus(provider))}
                        <Typography variant="h6" sx={{ textTransform: 'capitalize' }}>
                          {provider}
                        </Typography>
                        <Chip
                          label={getStatusText(getProviderStatus(provider))}
                          size="small"
                          color={getProviderStatus(provider) === 'configured' ? 'success' : 'default'}
                        />
                      </Box>

                      <FormControlLabel
                        control={
                          <Switch
                            checked={providerConfig.enabled}
                            onChange={(e) => handleConfigChange(provider, 'enabled', e.target.checked)}
                          />
                        }
                        label="Enabled"
                      />

                      <TextField
                        fullWidth
                        label="API Key"
                        type={showKeys ? 'text' : 'password'}
                        value={providerConfig.apiKey}
                        onChange={(e) => handleConfigChange(provider, 'apiKey', e.target.value)}
                        margin="normal"
                        InputProps={{
                          endAdornment: (
                            <IconButton onClick={() => setShowKeys(!showKeys)}>
                              {showKeys ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          )
                        }}
                      />

                      {provider === 'cloudflare' && (
                        <TextField
                          fullWidth
                          label="Account ID"
                          type="text"
                          value={providerConfig.accountId || ''}
                          onChange={(e) => handleConfigChange(provider, 'accountId', e.target.value)}
                          margin="normal"
                          helperText="Your Cloudflare account ID"
                        />
                      )}

                      <Box mt={2}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => testProvider(provider)}
                          disabled={loading || !providerConfig.apiKey}
                        >
                          Test API Key
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Box mt={3}>
              <Button
                variant="contained"
                onClick={saveConfiguration}
                disabled={loading}
                startIcon={<SaveIcon />}
              >
                Save Configuration
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {activeTab === 1 && (
        <Card>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
              <Typography variant="h6">
                Usage Statistics
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={resetStatistics}
                startIcon={<RefreshIcon />}
              >
                Reset Stats
              </Button>
            </Box>

            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" color="primary">
                      Total Calls
                    </Typography>
                                         <Typography variant="h4">
                       {stats.totalCalls || 0}
                     </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" color="primary">
                      Total Tokens
                    </Typography>
                                         <Typography variant="h4">
                       {formatTokens(stats.totalTokens || 0)}
                     </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" color="primary">
                      Total Cost
                    </Typography>
                                         <Typography variant="h4">
                       {formatCost(stats.totalCost || 0)}
                     </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
              Provider Usage
            </Typography>

            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Provider</TableCell>
                    <TableCell>Total Calls</TableCell>
                    <TableCell>Free Calls</TableCell>
                    <TableCell>Paid Calls</TableCell>
                    <TableCell>Tokens</TableCell>
                    <TableCell>Cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(stats.providerUsage || {}).map(([provider, usage]) => (
                    <TableRow key={provider}>
                      <TableCell sx={{ textTransform: 'capitalize' }}>{provider}</TableCell>
                      <TableCell>{usage.calls || 0}</TableCell>
                      <TableCell sx={{ color: 'success.main' }}>{usage.freeCalls || 0}</TableCell>
                      <TableCell sx={{ color: 'warning.main' }}>{usage.paidCalls || 0}</TableCell>
                      <TableCell>{formatTokens(usage.tokens || 0)}</TableCell>
                      <TableCell>{formatCost(usage.cost || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* App Usage Breakdown */}
            {Object.entries(stats.providerUsage || {}).some(([_, usage]) => usage.appUsage && Object.keys(usage.appUsage).length > 0) && (
              <>
                <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
                  App Usage Breakdown
                </Typography>

                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Provider</TableCell>
                        <TableCell>App</TableCell>
                        <TableCell>Total Calls</TableCell>
                        <TableCell>Free Calls</TableCell>
                        <TableCell>Paid Calls</TableCell>
                        <TableCell>Tokens</TableCell>
                        <TableCell>Cost</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(stats.providerUsage || {}).map(([provider, usage]) =>
                        usage.appUsage && Object.entries(usage.appUsage).map(([appName, appUsage]) => (
                          <TableRow key={`${provider}-${appName}`}>
                            <TableCell sx={{ textTransform: 'capitalize' }}>{provider}</TableCell>
                            <TableCell sx={{ textTransform: 'capitalize', fontWeight: 'bold' }}>{appName}</TableCell>
                            <TableCell>{appUsage.calls || 0}</TableCell>
                            <TableCell sx={{ color: 'success.main' }}>{appUsage.freeCalls || 0}</TableCell>
                            <TableCell sx={{ color: 'warning.main' }}>{appUsage.paidCalls || 0}</TableCell>
                            <TableCell>{formatTokens(appUsage.tokens || 0)}</TableCell>
                            <TableCell>{formatCost(appUsage.cost || 0)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </CardContent>
        </Card>
      )}

                            {activeTab === 2 && (
                        <Card>
                          <CardContent>
                            {/* Tab header bar */}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="h6">Free Tier Editor</Typography>
                                {Object.keys(freeTierEdits).length > 0 && (
                                  <Chip
                                    label={`${Object.keys(freeTierEdits).length} unsaved`}
                                    color="warning"
                                    size="small"
                                  />
                                )}
                              </Box>
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button
                                  variant="outlined"
                                  startIcon={<RefreshIcon />}
                                  onClick={loadDirectorData}
                                  disabled={directorLoading || savingBulk}
                                >
                                  Refresh
                                </Button>
                                <Button
                                  variant="outlined"
                                  color="error"
                                  onClick={() => setShowResetConfirm(true)}
                                  disabled={savingBulk || directorLoading}
                                >
                                  Reset All Free Tiers
                                </Button>
                                <Button
                                  variant="outlined"
                                  color="warning"
                                  onClick={() => setShowRestoreDefaultsConfirm(true)}
                                  disabled={savingBulk || directorLoading}
                                >
                                  Restore Hardcoded Defaults
                                </Button>
                                <Button
                                  variant="contained"
                                  startIcon={savingBulk ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                                  onClick={saveAllFreeTiers}
                                  disabled={savingBulk || Object.keys(freeTierEdits).length === 0}
                                >
                                  Save All
                                </Button>
                              </Box>
                            </Box>

                            <Alert severity="info" sx={{ mb: 2 }}>
                              Check the <strong>Free</strong> checkbox to enable free tier for a model. Limit fields are disabled when unchecked. Click <strong>Save All</strong> to persist all changes in one go. Use the <EditIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} /> button for rate limits.
                            </Alert>

                            {directorLoading ? (
                              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                                <CircularProgress />
                              </Box>
                            ) : directorData ? (
                              <Grid container spacing={3}>
                                {Object.entries(directorData.providers || {}).map(([providerName, provider]) => (
                                  <Grid item xs={12} key={providerName}>
                                    <Card variant="outlined">
                                      <CardContent sx={{ pb: '8px !important' }}>
                                        {/* Provider header */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                                          <Typography variant="subtitle1" fontWeight="bold" sx={{ textTransform: 'capitalize' }}>
                                            {providerName}
                                          </Typography>
                                          <Chip
                                            label={`${provider.models.filter(m => getModelFreeTierValue(providerName, m).isFree).length} free`}
                                            size="small"
                                            color="success"
                                            variant="outlined"
                                          />
                                          <Chip label={`${provider.totalModels} total`} size="small" variant="outlined" />
                                        </Box>

                                        {/* Column header row */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, mb: 0.5 }}>
                                          <Box sx={{ width: 36 }} />
                                          <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>Model</Typography>
                                          <Typography variant="caption" color="text.secondary" sx={{ width: 72, textAlign: 'right' }}>$/M in</Typography>
                                          <Typography variant="caption" color="text.secondary" sx={{ width: 72, textAlign: 'right' }}>$/M out</Typography>
                                          <Typography variant="caption" color="text.secondary" sx={{ width: 80, textAlign: 'center' }}>RPM</Typography>
                                          <Typography variant="caption" color="text.secondary" sx={{ width: 80, textAlign: 'center' }}>RPD</Typography>
                                          <Typography variant="caption" color="text.secondary" sx={{ width: 80, textAlign: 'center' }}>TPM</Typography>
                                          <Typography variant="caption" color="text.secondary" sx={{ width: 80, textAlign: 'center' }}>TPD</Typography>
                                          <Box sx={{ width: 32 }} />
                                        </Box>

                                        {/* Model rows */}
                                        {provider.models.length > 0 ? provider.models.map((model, index) => {
                                          const ftv = getModelFreeTierValue(providerName, model);
                                          const isDirty = freeTierEdits[getFreeTierKey(providerName, model.id)] !== undefined;
                                          return (
                                            <Box
                                              key={index}
                                              sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 1,
                                                px: 0.5,
                                                py: 0.25,
                                                borderRadius: 1,
                                                bgcolor: isDirty ? 'warning.50' : 'transparent',
                                                '&:hover': { bgcolor: isDirty ? 'warning.100' : 'action.hover' }
                                              }}
                                            >
                                              {/* Free checkbox */}
                                              <Tooltip title={ftv.isFree ? 'Mark as not free' : 'Mark as free'}>
                                                <Checkbox
                                                  size="small"
                                                  checked={ftv.isFree}
                                                  onChange={(e) => updateFreeTierEdit(providerName, model.id, 'isFree', e.target.checked)}
                                                  sx={{ p: 0.5 }}
                                                />
                                              </Tooltip>

                                              {/* Model name */}
                                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography variant="body2" noWrap title={model.id}>
                                                  {model.name}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary" noWrap display="block">
                                                  {model.id}
                                                </Typography>
                                              </Box>

                                              {/* Pricing: input */}
                                              <Typography
                                                variant="caption"
                                                color={model.pricing?.input && model.pricing.input !== 'Unknown' ? 'text.primary' : 'text.disabled'}
                                                sx={{ width: 72, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                                              >
                                                {formatPricingCell(model.pricing?.input)}
                                              </Typography>

                                              {/* Pricing: output */}
                                              <Typography
                                                variant="caption"
                                                color={model.pricing?.output && model.pricing.output !== 'Unknown' ? 'text.primary' : 'text.disabled'}
                                                sx={{ width: 72, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                                              >
                                                {formatPricingCell(model.pricing?.output)}
                                              </Typography>

                                              {/* RPM */}
                                              <TextField
                                                size="small"
                                                type="number"
                                                placeholder="RPM"
                                                disabled={!ftv.isFree}
                                                value={ftv.freeLimits?.requestsPerMinute ?? ''}
                                                onChange={(e) => updateFreeTierLimit(providerName, model.id, 'requestsPerMinute', e.target.value)}
                                                sx={{ width: 80 }}
                                                inputProps={{ style: { textAlign: 'right', padding: '4px 6px' } }}
                                              />

                                              {/* RPD */}
                                              <TextField
                                                size="small"
                                                type="number"
                                                placeholder="RPD"
                                                disabled={!ftv.isFree}
                                                value={ftv.freeLimits?.requestsPerDay ?? ''}
                                                onChange={(e) => updateFreeTierLimit(providerName, model.id, 'requestsPerDay', e.target.value)}
                                                sx={{ width: 80 }}
                                                inputProps={{ style: { textAlign: 'right', padding: '4px 6px' } }}
                                              />

                                              {/* TPM */}
                                              <TextField
                                                size="small"
                                                type="number"
                                                placeholder="TPM"
                                                disabled={!ftv.isFree}
                                                value={ftv.freeLimits?.tokensPerMinute ?? ''}
                                                onChange={(e) => updateFreeTierLimit(providerName, model.id, 'tokensPerMinute', e.target.value)}
                                                sx={{ width: 80 }}
                                                inputProps={{ style: { textAlign: 'right', padding: '4px 6px' } }}
                                              />

                                              {/* TPD */}
                                              <TextField
                                                size="small"
                                                type="number"
                                                placeholder="TPD"
                                                disabled={!ftv.isFree}
                                                value={ftv.freeLimits?.tokensPerDay ?? ''}
                                                onChange={(e) => updateFreeTierLimit(providerName, model.id, 'tokensPerDay', e.target.value)}
                                                sx={{ width: 80 }}
                                                inputProps={{ style: { textAlign: 'right', padding: '4px 6px' } }}
                                              />

                                              {/* Advanced edit button (rate limits) */}
                                              <Tooltip title="Edit rate limits">
                                                <IconButton
                                                  size="small"
                                                  sx={{ p: 0.5 }}
                                                  onClick={() => setEditingFreeTier({
                                                    provider: providerName,
                                                    modelId: model.id,
                                                    modelName: model.name,
                                                    isFree: ftv.isFree,
                                                    freeLimits: ftv.freeLimits || {
                                                      requestsPerMinute: 30,
                                                      requestsPerDay: 14400,
                                                      tokensPerMinute: 18000,
                                                      tokensPerDay: 5184000
                                                    },
                                                    notes: model.freeTier?.notes || ''
                                                  })}
                                                >
                                                  <EditIcon fontSize="small" />
                                                </IconButton>
                                              </Tooltip>
                                            </Box>
                                          );
                                        }) : (
                                          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                                            No models — click Sync on the AI Catalog tab
                                          </Typography>
                                        )}
                                      </CardContent>
                                    </Card>
                                  </Grid>
                                ))}
                              </Grid>
                            ) : (
                              <Box sx={{ textAlign: 'center', py: 4 }}>
                                <Typography variant="body1" color="text.secondary">
                                  Click "Refresh" to load model data
                                </Typography>
                              </Box>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {activeTab === 3 && (
                        <Card>
                          <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                              <Typography variant="h6">AI Catalog - Model & Pricing Overview</Typography>
                              <Button
                                variant="outlined"
                                startIcon={<RefreshIcon />}
                                onClick={loadDirectorData}
                                disabled={directorLoading}
                              >
                                Refresh Data
                              </Button>
                            </Box>

            {directorLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                <CircularProgress />
              </Box>
            )}

            {directorData && (
              <Box>
                {/* Summary Cards */}
                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={2.4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" color="primary">Total Providers</Typography>
                        <Typography variant="h4">{directorData.summary?.totalProviders || 0}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={2.4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" color="primary">Total Models</Typography>
                        <Typography variant="h4">{directorData.summary?.totalModels || 0}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={2.4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" color="success">Free Models</Typography>
                        <Typography variant="h4" color="success">
                          {Object.values(directorData.providers || {}).reduce((sum, provider) =>
                            sum + provider.models.filter(model => model.freeTier?.isFree).length, 0
                          )}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={2.4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" color="primary">With API Keys</Typography>
                        <Typography variant="h4">{directorData.summary?.providersWithKeys || 0}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={2.4}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" color="primary">Enabled</Typography>
                        <Typography variant="h4">{directorData.summary?.enabledProviders || 0}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                {/* Provider Details */}
                <Grid container spacing={3}>
                  {Object.entries(directorData.providers || {}).map(([providerName, provider]) => (
                    <Grid item xs={12} md={6} key={providerName}>
                      <Card variant="outlined">
                        <CardContent>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6" sx={{ textTransform: 'capitalize' }}>
                              {providerName}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                              <Tooltip title="Sync models from provider API">
                                <span>
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={syncingProvider === providerName ? <CircularProgress size={16} /> : <SyncIcon />}
                                    onClick={() => syncProviderModels(providerName)}
                                    disabled={syncingProvider !== null || !provider.hasApiKey}
                                  >
                                    Sync
                                  </Button>
                                </span>
                              </Tooltip>
                              <Chip
                                label={provider.hasApiKey ? 'API Key' : 'No API Key'}
                                color={provider.hasApiKey ? 'success' : 'error'}
                                size="small"
                              />
                              <Chip
                                label={provider.isEnabled ? 'Enabled' : 'Disabled'}
                                color={provider.isEnabled ? 'success' : 'warning'}
                                size="small"
                              />
                            </Box>
                          </Box>

                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {provider.totalModels} models available
                          </Typography>

                          {provider.models.length > 0 ? (
                            <Box>
                              {provider.models.map((model, index) => (
                                <Card key={index} variant="outlined" sx={{ mb: 1, p: 1 }}>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                      <Typography variant="body2" fontWeight="bold" noWrap>
                                        {model.name}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                                        {model.id}
                                      </Typography>
                                    </Box>
                                    <Box sx={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                                      <Box>
                                        <Typography variant="caption" display="block">
                                          In: ${typeof model.pricing.input === 'number' ? model.pricing.input : '?'}/1K
                                        </Typography>
                                        <Typography variant="caption" display="block">
                                          Out: ${typeof model.pricing.output === 'number' ? model.pricing.output : '?'}/1K
                                        </Typography>
                                        {model.freeTier?.isFree ? (
                                          <Chip label="FREE" color="success" size="small" sx={{ mt: 0.5 }} />
                                        ) : model.pricing.input !== 'Unknown' ? (
                                          <Chip label="PAID" color="default" size="small" sx={{ mt: 0.5 }} />
                                        ) : null}
                                      </Box>
                                      <Box sx={{ display: 'flex', flexDirection: 'column', ml: 0.5 }}>
                                        <Tooltip title="Edit pricing">
                                          <IconButton
                                            size="small"
                                            onClick={() => setEditingPricing({
                                              provider: providerName,
                                              modelId: model.id,
                                              modelName: model.name,
                                              inputPrice: typeof model.pricing.input === 'number' ? model.pricing.input : 0,
                                              outputPrice: typeof model.pricing.output === 'number' ? model.pricing.output : 0
                                            })}
                                          >
                                            <MoneyIcon fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Edit free tier">
                                          <IconButton
                                            size="small"
                                            onClick={() => setEditingFreeTier({
                                              provider: providerName,
                                              modelId: model.id,
                                              modelName: model.name,
                                              isFree: model.freeTier?.isFree || false,
                                              freeLimits: model.freeTier?.limits || {
                                                requestsPerMinute: 30,
                                                requestsPerDay: 14400,
                                                tokensPerMinute: 18000,
                                                tokensPerDay: 5184000
                                              },
                                              notes: model.freeTier?.notes || ''
                                            })}
                                          >
                                            <EditIcon fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                      </Box>
                                    </Box>
                                  </Box>
                                </Card>
                              ))}
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              No models available — click Sync to fetch from API
                            </Typography>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}

            {!directorData && !directorLoading && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  Click "Refresh Data" to load model information and pricing
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 4 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6">App Routing — Server-Side Model Configuration</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={loadAppConfigs}
                  disabled={appConfigsLoading}
                >
                  Refresh
                </Button>
              </Box>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
              Apps using <code>model: "basegeek-app"</code> or <code>useAppConfig: true</code> will be routed
              according to these settings. Apps that just identify themselves via <code>appName</code> without
              specifying a provider will also be routed here automatically.
            </Alert>

            {appConfigsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
            ) : (
              <>
                {/* Discovered but unconfigured apps */}
                {discoveredApps.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Discovered Apps (unconfigured)</Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {discoveredApps.map(appName => (
                        <Chip
                          key={appName}
                          label={appName}
                          icon={<AddIcon />}
                          onClick={() => addDiscoveredApp(appName)}
                          color="info"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Add new app */}
                <Box sx={{ display: 'flex', gap: 1, mb: 3, alignItems: 'center' }}>
                  <TextField
                    size="small"
                    label="New App Name"
                    value={newAppName}
                    onChange={(e) => setNewAppName(e.target.value)}
                    placeholder="e.g. myNewApp"
                  />
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    disabled={!newAppName.trim()}
                    onClick={() => {
                      addDiscoveredApp(newAppName.trim());
                      setNewAppName('');
                    }}
                  >
                    Add App
                  </Button>
                </Box>

                {/* Configured apps */}
                <Grid container spacing={2}>
                  {appConfigs.map((app) => (
                    <Grid item xs={12} md={6} key={app.appName}>
                      <Card variant="outlined">
                        <CardContent>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Box>
                              <Typography variant="h6">{app.displayName || app.appName}</Typography>
                              {app.displayName && app.displayName !== app.appName && (
                                <Typography variant="caption" color="text.secondary">{app.appName}</Typography>
                              )}
                            </Box>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <Chip
                                label={app.tier}
                                size="small"
                                color={app.tier === 'free' ? 'success' : app.tier === 'specific' ? 'primary' : 'default'}
                              />
                              <Chip
                                label={app.enabled ? 'Active' : 'Disabled'}
                                size="small"
                                color={app.enabled ? 'success' : 'default'}
                                variant="outlined"
                              />
                              {app.autoDiscovered && (
                                <Chip label="Auto" size="small" variant="outlined" />
                              )}
                            </Box>
                          </Box>

                          {app.tier === 'specific' && (
                            <Typography variant="body2" sx={{ mb: 1 }}>
                              {app.provider}/{app.model}
                            </Typography>
                          )}
                          {app.tier === 'free' && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                              Uses free-tier rotation
                            </Typography>
                          )}
                          {app.tier === 'rotation' && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                              Uses all-provider rotation
                            </Typography>
                          )}

                          {app.notes && (
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                              {app.notes}
                            </Typography>
                          )}

                          {app.lastSeen && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Last seen: {new Date(parseInt(app.lastSeen)).toLocaleString()}
                            </Typography>
                          )}

                          <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                            <Button size="small" startIcon={<EditIcon />} onClick={() => setEditingApp({ ...app })}>
                              Edit
                            </Button>
                            <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => deleteAppConfig(app.appName)}>
                              Delete
                            </Button>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>

                {appConfigs.length === 0 && !appConfigsLoading && (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">
                      No app configs yet. Apps will be auto-discovered when they connect, or add one manually above.
                    </Typography>
                  </Box>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* App Config Edit Dialog */}
      <Dialog open={!!editingApp} onClose={() => setEditingApp(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingApp?.appName ? `Configure — ${editingApp.appName}` : 'New App Config'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Display Name"
            value={editingApp?.displayName ?? ''}
            onChange={(e) => setEditingApp(prev => ({ ...prev, displayName: e.target.value }))}
            margin="normal"
          />

          <TextField
            fullWidth
            select
            label="Routing Tier"
            value={editingApp?.tier ?? 'free'}
            onChange={(e) => setEditingApp(prev => ({ ...prev, tier: e.target.value }))}
            margin="normal"
            SelectProps={{ native: true }}
          >
            <option value="free">Free — free-tier models only</option>
            <option value="rotation">Rotation — all providers</option>
            <option value="specific">Specific — pinned provider/model</option>
          </TextField>

          {editingApp?.tier === 'specific' && (
            <>
              <TextField
                fullWidth
                select
                label="Provider"
                value={editingApp?.provider ?? ''}
                onChange={(e) => setEditingApp(prev => ({ ...prev, provider: e.target.value }))}
                margin="normal"
                SelectProps={{ native: true }}
              >
                <option value="">Select provider...</option>
                {Object.keys(config).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </TextField>
              <TextField
                fullWidth
                label="Model ID"
                value={editingApp?.model ?? ''}
                onChange={(e) => setEditingApp(prev => ({ ...prev, model: e.target.value }))}
                margin="normal"
                helperText="Exact model ID from the AI Catalog"
              />
            </>
          )}

          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Max Tokens (optional)"
                type="number"
                value={editingApp?.maxTokens ?? ''}
                onChange={(e) => setEditingApp(prev => ({ ...prev, maxTokens: e.target.value }))}
                size="small"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Temperature (optional)"
                type="number"
                inputProps={{ step: '0.1', min: '0', max: '2' }}
                value={editingApp?.temperature ?? ''}
                onChange={(e) => setEditingApp(prev => ({ ...prev, temperature: e.target.value }))}
                size="small"
              />
            </Grid>
          </Grid>

          <TextField
            fullWidth
            label="Notes"
            value={editingApp?.notes ?? ''}
            onChange={(e) => setEditingApp(prev => ({ ...prev, notes: e.target.value }))}
            margin="normal"
            multiline
            rows={2}
          />

          <FormControlLabel
            control={
              <Switch
                checked={editingApp?.enabled !== false}
                onChange={(e) => setEditingApp(prev => ({ ...prev, enabled: e.target.checked }))}
              />
            }
            label="Enabled"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingApp(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveAppConfig}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Pricing Edit Dialog */}
      <Dialog open={!!editingPricing} onClose={() => setEditingPricing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Pricing — {editingPricing?.modelName}</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            {editingPricing?.provider} / {editingPricing?.modelId}
          </Typography>
          <TextField
            fullWidth
            label="Input Price (per 1K tokens)"
            type="number"
            inputProps={{ step: '0.0001', min: '0' }}
            value={editingPricing?.inputPrice ?? ''}
            onChange={(e) => setEditingPricing(prev => ({ ...prev, inputPrice: e.target.value }))}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Output Price (per 1K tokens)"
            type="number"
            inputProps={{ step: '0.0001', min: '0' }}
            value={editingPricing?.outputPrice ?? ''}
            onChange={(e) => setEditingPricing(prev => ({ ...prev, outputPrice: e.target.value }))}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingPricing(null)}>Cancel</Button>
          <Button variant="contained" onClick={savePricing}>Save Pricing</Button>
        </DialogActions>
      </Dialog>

      {/* Reset All Free Tiers Confirm Dialog */}
      <Dialog open={showResetConfirm} onClose={() => setShowResetConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reset All Free Tiers?</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            This will uncheck every model's free tier flag. Limits are preserved and can be re-applied after. Continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowResetConfirm(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={resetAllFreeTiers}
            disabled={savingBulk}
            startIcon={savingBulk ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Reset All
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restore Hardcoded Defaults Confirm Dialog */}
      <Dialog open={showRestoreDefaultsConfirm} onClose={() => setShowRestoreDefaultsConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Restore Hardcoded Defaults?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will overwrite your manual free-tier selections for all known models with the hardcoded defaults baked into the seed data.
          </Alert>
          <Typography variant="body2">
            Any models you manually checked or unchecked will be reset. This is useful for recovering from an accidental bulk-change, but cannot be undone. Continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowRestoreDefaultsConfirm(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={restoreHardcodedDefaults}
            disabled={savingBulk}
            startIcon={savingBulk ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Restore Defaults
          </Button>
        </DialogActions>
      </Dialog>

      {/* Free Tier Edit Dialog (audio limits + notes — advanced) */}
      <Dialog open={!!editingFreeTier} onClose={() => setEditingFreeTier(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Free Tier — {editingFreeTier?.modelName}</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            {editingFreeTier?.provider} / {editingFreeTier?.modelId}
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={editingFreeTier?.isFree || false}
                onChange={(e) => setEditingFreeTier(prev => ({ ...prev, isFree: e.target.checked }))}
              />
            }
            label="Free Tier Available"
          />
          {editingFreeTier?.isFree && (
            <Box sx={{ mt: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Requests/Minute"
                    type="number"
                    value={editingFreeTier?.freeLimits?.requestsPerMinute ?? ''}
                    onChange={(e) => setEditingFreeTier(prev => ({
                      ...prev,
                      freeLimits: { ...prev.freeLimits, requestsPerMinute: parseInt(e.target.value) || 0 }
                    }))}
                    size="small"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Requests/Day"
                    type="number"
                    value={editingFreeTier?.freeLimits?.requestsPerDay ?? ''}
                    onChange={(e) => setEditingFreeTier(prev => ({
                      ...prev,
                      freeLimits: { ...prev.freeLimits, requestsPerDay: parseInt(e.target.value) || 0 }
                    }))}
                    size="small"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Tokens/Minute"
                    type="number"
                    value={editingFreeTier?.freeLimits?.tokensPerMinute ?? ''}
                    onChange={(e) => setEditingFreeTier(prev => ({
                      ...prev,
                      freeLimits: { ...prev.freeLimits, tokensPerMinute: parseInt(e.target.value) || 0 }
                    }))}
                    size="small"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Tokens/Day"
                    type="number"
                    value={editingFreeTier?.freeLimits?.tokensPerDay ?? ''}
                    onChange={(e) => setEditingFreeTier(prev => ({
                      ...prev,
                      freeLimits: { ...prev.freeLimits, tokensPerDay: parseInt(e.target.value) || 0 }
                    }))}
                    size="small"
                  />
                </Grid>
              </Grid>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Audio Limits (optional)</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Audio Seconds/Hour"
                    type="number"
                    value={editingFreeTier?.freeLimits?.audioSecondsPerHour ?? ''}
                    onChange={(e) => setEditingFreeTier(prev => ({
                      ...prev,
                      freeLimits: { ...prev.freeLimits, audioSecondsPerHour: parseInt(e.target.value) || 0 }
                    }))}
                    size="small"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Audio Seconds/Day"
                    type="number"
                    value={editingFreeTier?.freeLimits?.audioSecondsPerDay ?? ''}
                    onChange={(e) => setEditingFreeTier(prev => ({
                      ...prev,
                      freeLimits: { ...prev.freeLimits, audioSecondsPerDay: parseInt(e.target.value) || 0 }
                    }))}
                    size="small"
                  />
                </Grid>
              </Grid>
              <TextField
                fullWidth
                label="Notes"
                value={editingFreeTier?.notes ?? ''}
                onChange={(e) => setEditingFreeTier(prev => ({ ...prev, notes: e.target.value }))}
                margin="normal"
                multiline
                rows={2}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingFreeTier(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveFreeTier}>Save Free Tier</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AIGeekPage;
