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
  AttachMoney as MoneyIcon
} from '@mui/icons-material';
import useSharedAuthStore from '../store/sharedAuthStore';
import { apolloClient } from '../apolloClient';
import { GET_AI_CONFIG, GET_AI_STATS, GET_AI_DIRECTOR_MODELS, GET_AI_USAGE } from '../graphql/queries';
import { SAVE_AI_CONFIG, TEST_AI_PROVIDER, RESET_AI_STATS, SEED_DIRECTOR_PRICING, SEED_DIRECTOR_FREE_TIER, SYNC_PROVIDER_MODELS, UPDATE_MODEL_PRICING, UPDATE_MODEL_FREE_TIER } from '../graphql/mutations';


const AIGeekPage = () => {
  console.log('AIGeekPage component rendering');
  const { token, user } = useSharedAuthStore();
  console.log('Auth state:', { token: token ? 'Present' : 'Missing', user: user ? 'Present' : 'Missing' });
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
  const [editingPricing, setEditingPricing] = useState(null); // { provider, modelId, inputPrice, outputPrice }
  const [editingFreeTier, setEditingFreeTier] = useState(null); // { provider, modelId, isFree, freeLimits, notes }

  useEffect(() => {
    console.log('AIGeekPage useEffect running');
    if (token) {
      loadConfiguration();
      loadStatistics();
      loadDirectorData(); // Load AI Director data on mount
      loadUsageData(); // Load usage tracking data on mount
    }
  }, [token]);

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
      console.log('Loading statistics...');
      const { data } = await apolloClient.query({ query: GET_AI_STATS, fetchPolicy: 'network-only' });
      if (data && data.aiStats) {
        console.log('Received stats:', data.aiStats);
        setStats(data.aiStats.data || data.aiStats);
      }
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };



  const loadDirectorData = async () => {
    try {
      setDirectorLoading(true);
      console.log('Token for AI Director:', token ? 'Present' : 'Missing');

      // First, seed pricing data if needed
      try {
        await apolloClient.mutate({ mutation: SEED_DIRECTOR_PRICING });
      } catch (error) {
        console.log('Pricing already seeded or error:', error);
      }

      // Then, seed free tier information if needed
      try {
        await apolloClient.mutate({ mutation: SEED_DIRECTOR_FREE_TIER });
      } catch (error) {
        console.log('Free tier already seeded or error:', error);
      }

      // Then load the comprehensive model data
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

  const loadUsageData = async () => {
    try {
      setUsageLoading(true);
      console.log('Loading usage data...');
      // Only track providers with free tiers
      const providers = ['cerebras', 'groq', 'together', 'gemini', 'openrouter', 'cloudflare', 'ollama', 'llm7', 'llmgateway', 'cohere'];
      const usageSummary = {};

      for (const provider of providers) {
        try {
          const { data } = await apolloClient.query({ query: GET_AI_USAGE, variables: { provider }, fetchPolicy: 'network-only' });
          if (data && data.aiUsage) {
            console.log(`Usage data for ${provider}:`, data.aiUsage);
            usageSummary[provider] = data.aiUsage;
          }
        } catch (error) {
          console.log(`Failed to load usage for ${provider}:`, error);
        }
      }

      console.log('Final usage summary:', usageSummary);
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

  // Save free tier for a model
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
      setEditingFreeTier(null);
      await loadDirectorData();
    } catch (error) {
      setError(`Failed to update free tier: ${error.message}`);
    }
  };

  const formatCost = (cost) => {
    if (cost === undefined || cost === null) {
      return '$0.0000';
    }
    return `$${cost.toFixed(4)}`;
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
                        <Tab label="Free Tier Monitoring" icon={<WarningIcon />} />
                        <Tab label="AI Catalog" icon={<KeyIcon />} />
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
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                              <Typography variant="h6">Free Tier Monitoring</Typography>
                              <Button
                                variant="outlined"
                                startIcon={<RefreshIcon />}
                                onClick={loadUsageData}
                                disabled={usageLoading}
                              >
                                Refresh Usage
                              </Button>
                            </Box>

                            {usageLoading ? (
                              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                                <CircularProgress />
                              </Box>
                            ) : (
                              <Grid container spacing={2}>
                                {Object.entries(usageData).map(([provider, data]) => (
                                  <Grid item xs={12} md={6} key={provider}>
                                    <Card variant="outlined">
                                      <CardContent>
                                        <Typography variant="h6" sx={{ textTransform: 'capitalize', mb: 2 }}>
                                          {provider} Usage
                                        </Typography>

                                        <Box sx={{ mb: 2 }}>
                                          <Typography variant="body2" color="text.secondary">
                                            Today's Usage:
                                          </Typography>
                                          <Typography variant="body1">
                                            Requests: {data.totalRequests || 0}
                                          </Typography>
                                          <Typography variant="body1">
                                            Tokens: {formatTokens(data.totalTokens || 0)}
                                          </Typography>
                                        </Box>

                                        {data.isNearAnyLimit && (
                                          <Alert severity="warning" sx={{ mb: 2 }}>
                                            Approaching free tier limits
                                          </Alert>
                                        )}

                                        {data.isAtAnyLimit && (
                                          <Alert severity="error" sx={{ mb: 2 }}>
                                            Free tier limits reached!
                                          </Alert>
                                        )}

                                        {data.models && data.models.length > 0 && (
                                          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                                            Model Details:
                                          </Typography>
                                        )}

                                        {data.models?.map((model, index) => (
                                          <Box key={index} sx={{ mb: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                                            <Typography variant="caption" display="block">
                                              {model.modelId}
                                            </Typography>
                                            <Typography variant="caption" display="block">
                                              {provider === 'gemini' ? (
                                                // Gemini: Show daily limits (more restrictive)
                                                `RPD: ${model.percentages?.requestsPerDay?.toFixed(1) || 0}% | TPD: ${model.percentages?.tokensPerDay?.toFixed(1) || 0}%`
                                              ) : (
                                                // Groq & Together: Show minute limits (more restrictive)
                                                `RPM: ${model.percentages?.requestsPerMinute?.toFixed(1) || 0}% | TPM: ${model.percentages?.tokensPerMinute?.toFixed(1) || 0}%`
                                              )}
                                            </Typography>
                                            {(() => {
                                              const isNearLimit = provider === 'gemini'
                                                ? (model.isNearLimit?.requestsPerDay || model.isAtLimit?.requestsPerDay)
                                                : (model.isNearLimit?.requestsPerMinute || model.isAtLimit?.requestsPerMinute);

                                              return isNearLimit ? (
                                                <Chip
                                                  label="Near Limit"
                                                  color="warning"
                                                  size="small"
                                                  sx={{ mt: 0.5 }}
                                                />
                                              ) : null;
                                            })()}
                                          </Box>
                                        ))}
                                      </CardContent>
                                    </Card>
                                  </Grid>
                                ))}
                              </Grid>
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

      {/* Free Tier Edit Dialog */}
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
