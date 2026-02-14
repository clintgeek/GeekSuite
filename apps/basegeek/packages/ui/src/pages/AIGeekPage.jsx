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
  Tooltip
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Analytics as AnalyticsIcon,
  Key as KeyIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  SmartToy as SmartToyIcon
} from '@mui/icons-material';
import useSharedAuthStore from '../store/sharedAuthStore';

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
      const response = await fetch('/api/ai/config', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setConfig(data);
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
      const response = await fetch('/api/ai/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Received stats:', data);
        setStats(data.data || data);
      } else {
        console.error('Failed to load statistics:', response.status, response.statusText);
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
        const pricingResponse = await fetch('/api/ai/director/seed-pricing', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        console.log('Pricing seed response:', pricingResponse.status);
      } catch (error) {
        console.log('Pricing already seeded or error:', error);
      }

      // Then, seed free tier information if needed
      try {
        const freeTierResponse = await fetch('/api/ai/director/seed-free-tier', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        console.log('Free tier seed response:', freeTierResponse.status);
      } catch (error) {
        console.log('Free tier already seeded or error:', error);
      }

      // Then load the comprehensive model data
      const response = await fetch('/api/ai/director/models', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDirectorData(data.data);
      } else {
        const errorData = await response.json();
        setError(errorData.error?.message || 'Failed to load AI Director data');
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
          // Use session-level tracking
          const response = await fetch(`/api/ai/usage/${provider}?userId=session`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`Usage data for ${provider}:`, data);
            usageSummary[provider] = data.data;
          } else {
            console.error(`Failed to load usage for ${provider}:`, response.status, response.statusText);
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

      const response = await fetch('/api/ai/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        setSuccess('AI configuration saved successfully');
        await loadStatistics(); // Refresh stats after config change
      } else {
        const errorData = await response.json();
        setError(errorData.error?.message || 'Failed to save configuration');
      }
    } catch (error) {
      setError('Failed to save AI configuration');
    } finally {
      setLoading(false);
    }
  };

  const testProvider = async (provider) => {
    try {
      setLoading(true);
      const response = await fetch('/api/ai/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ provider, appName: 'baseGeek-test' })
      });

      if (response.ok) {
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
      const response = await fetch('/api/ai/reset-stats', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setSuccess('Statistics reset successfully');
        await loadStatistics();
      } else {
        setError('Failed to reset statistics');
      }
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
                            <Box sx={{ display: 'flex', gap: 1 }}>
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
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box>
                                      <Typography variant="body2" fontWeight="bold">
                                        {model.name}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {model.id}
                                      </Typography>
                                    </Box>
                                    <Box sx={{ textAlign: 'right' }}>
                                      <Typography variant="caption" display="block">
                                        Input: ${model.pricing.input}/1K tokens
                                      </Typography>
                                      <Typography variant="caption" display="block">
                                        Output: ${model.pricing.output}/1K tokens
                                      </Typography>
                                      {model.freeTier?.isFree && (
                                        <Chip
                                          label="FREE"
                                          color="success"
                                          size="small"
                                          sx={{ mt: 0.5 }}
                                        />
                                      )}
                                      {!model.freeTier?.isFree && model.pricing.input !== 'Unknown' && (
                                        <Chip
                                          label="PAID"
                                          color="default"
                                          size="small"
                                          sx={{ mt: 0.5 }}
                                        />
                                      )}
                                    </Box>
                                  </Box>
                                </Card>
                              ))}
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              No models available
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
    </Box>
  );
};

export default AIGeekPage;
