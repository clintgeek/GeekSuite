import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, FormControl, InputLabel,
  Select, MenuItem, Chip, Alert, CircularProgress, alpha,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useAISettingsStore from '../store/aiSettingsStore';
import api from '../api';

function Settings() {
  const theme = useTheme();
  const gold = theme.palette.codex?.gold || '#c9a84c';
  const { selectedProvider, selectedModelId, setSelection } = useAISettingsStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [providers, setProviders] = useState([]);
  const [modelsByProvider, setModelsByProvider] = useState({});

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true); setError('');
        const [providersRes, directorRes, gmConfigRes] = await Promise.all([
          api.get('/ai/providers'),
          api.get('/ai/director/models'),
          api.get('/ai/gm-config').catch(() => ({ data: null })),
        ]);
        const enabledProviders = providersRes.data?.data?.providers || [];
        setProviders(enabledProviders);
        const modelInfo = directorRes.data?.data?.providers || {};
        const mapped = {};
        for (const [prov, info] of Object.entries(modelInfo)) {
          mapped[prov] = (info.models || []).map(m => ({ id: m.id, name: m.name, isFree: !!m.freeTier?.isFree }));
        }
        setModelsByProvider(mapped);
        if (!selectedProvider && enabledProviders.length > 0) {
          // Default to the backend's pinned GM model — narrative consistency
          // beats whatever model happens to top the list.
          const gm = gmConfigRes?.data;
          const gmAvailable = gm && enabledProviders.some(p => p.name === gm.provider) &&
            mapped[gm.provider]?.some(m => m.id === gm.model);
          if (gmAvailable) {
            setSelection(gm.provider, gm.model);
          } else if (enabledProviders.some(p => p.name === 'gemini') && mapped['gemini']?.length > 0) {
            const flash = mapped['gemini']
              .filter(m => /flash/i.test(m.id))
              .sort((a, b) => b.id.localeCompare(a.id))[0];
            setSelection('gemini', (flash || mapped['gemini'][0]).id);
          } else {
            const provKey = enabledProviders[0].name;
            setSelection(provKey, mapped[provKey]?.[0]?.id || null);
          }
        }
      } catch (e) { setError(e.message || 'Failed to load AI settings'); }
      finally { setLoading(false); }
    };
    load();
  }, [selectedProvider, setSelection]);

  const currentModels = useMemo(() => modelsByProvider[selectedProvider] || [], [modelsByProvider, selectedProvider]);

  return (
    <Box>
      <Box sx={{ mb: 4, mt: 1 }}>
        <Typography variant="overline" sx={{ color: alpha(gold, 0.6) }}>Configuration</Typography>
        <Typography variant="h2" sx={{ mt: 0.5 }}>Settings</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h5" sx={{ mb: 2.5 }}>AI Oracle</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Choose which intelligence powers your Game Master. Free-tier models are marked.
          </Typography>

          {loading ? (
            <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={24} sx={{ color: gold }} /></Box>
          ) : (
            <Grid container spacing={2.5}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Provider</InputLabel>
                  <Select label="Provider" value={selectedProvider || ''}
                    onChange={(e) => {
                      const prov = e.target.value;
                      setSelection(prov, (modelsByProvider[prov]?.[0]?.id) || null);
                    }}>
                    {providers.map(p => <MenuItem key={p.name} value={p.name}>{p.displayName || p.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth disabled={!selectedProvider}>
                  <InputLabel>Model</InputLabel>
                  <Select label="Model" value={selectedModelId || ''}
                    onChange={(e) => setSelection(selectedProvider, e.target.value)}>
                    {currentModels.map(m => (
                      <MenuItem key={m.id} value={m.id}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <span>{m.name || m.id}</span>
                          {m.isFree && <Chip label="Free" size="small" color="success" sx={{ height: 20, fontSize: '0.6rem' }} />}
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
