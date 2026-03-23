import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Card, CardContent, Grid, FormControl, InputLabel, Select, MenuItem, Chip, Alert, CircularProgress, Button } from '@mui/material';
import useSharedAuthStore from '../store/sharedAuthStore';
import useAISettingsStore from '../store/aiSettingsStore';

const BASE_API = 'https://basegeek.clintgeek.com/api';

function Settings() {
  const { token } = useSharedAuthStore();
  const { selectedProvider, selectedModelId, setSelection } = useAISettingsStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [providers, setProviders] = useState([]);
  const [modelsByProvider, setModelsByProvider] = useState({});

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }), [token]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        // Load director models (includes free-tier flags, pricing) and providers
        const [providersRes, directorRes] = await Promise.all([
          fetch(`${BASE_API}/ai/providers`, { headers }),
          fetch(`${BASE_API}/ai/director/models`, { headers })
        ]);

        if (!providersRes.ok) throw new Error('Failed to load providers');
        if (!directorRes.ok) throw new Error('Failed to load models');

        const providersJson = await providersRes.json();
        const directorJson = await directorRes.json();

        const enabledProviders = providersJson?.data?.providers || [];
        setProviders(enabledProviders);

        const modelInfo = directorJson?.data?.providers || {};
        const mapped = {};
        for (const [prov, info] of Object.entries(modelInfo)) {
          mapped[prov] = (info.models || []).map(m => ({
            id: m.id,
            name: m.name,
            isFree: !!m.freeTier?.isFree
          }));
        }
        setModelsByProvider(mapped);

        // Initialize selection if empty (prefer Groq llama3-70b-8192)
        if (!selectedProvider && enabledProviders.length > 0) {
          const groqAvailable = enabledProviders.some(p => p.name === 'groq');
          if (groqAvailable && mapped['groq'] && mapped['groq'].length > 0) {
            const preferred = mapped['groq'].find(m => m.id === 'llama3-70b-8192');
            if (preferred) {
              setSelection('groq', preferred.id);
            } else {
              setSelection('groq', mapped['groq'][0].id);
            }
          } else {
            const provKey = enabledProviders[0].name;
            const firstModel = mapped[provKey]?.[0]?.id || null;
            setSelection(provKey, firstModel);
          }
        }
      } catch (e) {
        setError(e.message || 'Failed to load AI settings');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [headers, selectedProvider, setSelection]);

  const currentModels = useMemo(() => modelsByProvider[selectedProvider] || [], [modelsByProvider, selectedProvider]);

  const handleProviderChange = (e) => {
    const prov = e.target.value;
    const firstModel = (modelsByProvider[prov] && modelsByProvider[prov][0]?.id) || null;
    setSelection(prov, firstModel);
  };

  const handleModelChange = (e) => setSelection(selectedProvider, e.target.value);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            AI Model
          </Typography>

          {loading ? (
            <Box sx={{ py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          ) : (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel id="provider-label">Provider</InputLabel>
                  <Select
                    labelId="provider-label"
                    label="Provider"
                    value={selectedProvider || ''}
                    onChange={handleProviderChange}
                  >
                    {providers.map((p) => (
                      <MenuItem key={p.name} value={p.name}>
                        {p.displayName || p.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth disabled={!selectedProvider}>
                  <InputLabel id="model-label">Model</InputLabel>
                  <Select
                    labelId="model-label"
                    label="Model"
                    value={selectedModelId || ''}
                    onChange={handleModelChange}
                  >
                    {currentModels.map((m) => (
                      <MenuItem key={m.id} value={m.id}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <span>{m.name || m.id}</span>
                          {m.isFree && <Chip label="Free" size="small" color="success" />}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default Settings;