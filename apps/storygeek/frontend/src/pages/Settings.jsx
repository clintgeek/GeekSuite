import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, FormControl, InputLabel,
  Select, MenuItem, Chip, CircularProgress, ListSubheader,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { GeekErrorState } from '@geeksuite/ui';
import useAISettingsStore from '../store/aiSettingsStore';
import api from '../api';

/**
 * The AI Oracle picker.
 *
 * One list, sourced from `GET /api/ai/models/alive` (which asks aiGeek's own
 * alive-model endpoint with StoryGeek's service key). **Automatic** is the
 * first option and the default: no pin, aiGeek chooses from its health-ranked
 * free rows and remembers the choice per story.
 *
 * What this replaced (Phase 2 of DOCS/AIGEEK_ELEVATION_PLAN.md):
 *
 *   - Two cascading selects (Provider, then Model) fed by `GET /ai/providers`
 *     and `GET /ai/director/models` — two unauthenticated cookie-forwarding
 *     proxies, one of which needed the `ai:director` permission.
 *   - A default read from `GET /ai/gm-config`, i.e. from the backend's
 *     `STORYGEEK_GM_PROVIDER` / `STORYGEEK_GM_MODEL` env vars, with a
 *     hand-written "newest gemini flash" tiebreak in the frontend. Nobody
 *     types a model id any more, here least of all.
 *
 * A stored pin that is no longer in the alive list is dropped on load, so the
 * Select never renders an out-of-range value: the player falls back to
 * Automatic, which always works, rather than silently pinning a dead model.
 */
function Settings() {
  const theme = useTheme();
  const gold = theme.palette.codex?.gold || '#c9a84c';
  // Muted section-label gold. Solid and mode-aware (theme.js) — the
  // alpha()-diluted gold it replaces failed AA on every codex surface.
  const goldMuted = theme.palette.codex?.goldMuted || gold;
  const { selectedProvider, selectedModelId, setSelection } = useAISettingsStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState([]);
  const [listAvailable, setListAvailable] = useState(true);

  /** `provider/modelId`, the value a Select option carries. `''` is Automatic. */
  const keyFor = (row) => `${row.provider}/${row.modelId}`;

  const load = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const res = await api.get('/ai/models/alive');
      const rows = res.data?.data?.models || [];
      setModels(rows);
      setListAvailable(res.data?.data?.available !== false);

      // A pin only survives if the model is still alive. A retired id used to
      // live in localStorage forever, rendering a blank Select (plus a MUI
      // out-of-range warning) and shipping a dead provider/model on every
      // turn. Read through the store rather than the closure so this does not
      // go stale when only the model changes.
      const stored = useAISettingsStore.getState();
      if (stored.selectedProvider && stored.selectedModelId) {
        const stillAlive = rows.some(
          (row) => row.provider === stored.selectedProvider && row.modelId === stored.selectedModelId
        );
        // Only drop the pin when the list actually arrived — an unreachable
        // list is not evidence that a model died.
        if (!stillAlive && rows.length > 0) setSelection(null, null);
      }
    } catch (e) {
      setError(e.message || 'Failed to load AI settings');
    } finally {
      setLoading(false);
    }
  }, [setSelection]);

  useEffect(() => { load(); }, [load]);

  const value = useMemo(
    () => (selectedProvider && selectedModelId ? `${selectedProvider}/${selectedModelId}` : ''),
    [selectedProvider, selectedModelId]
  );

  const onChange = (event) => {
    const next = event.target.value;
    if (!next) return setSelection(null, null);
    const row = models.find((m) => keyFor(m) === next);
    if (row) setSelection(row.provider, row.modelId);
  };

  const free = models.filter((m) => !m.paid);
  const paid = models.filter((m) => m.paid);

  const renderRow = (row) => (
    <MenuItem key={keyFor(row)} value={keyFor(row)}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.modelId}
        </Box>
        <Chip
          label={row.provider}
          size="small"
          variant="outlined"
          sx={{ height: 20, fontSize: '0.6rem' }}
        />
        {row.paid && (
          <Chip label="Paid" size="small" color="warning" sx={{ height: 20, fontSize: '0.6rem' }} />
        )}
      </Box>
    </MenuItem>
  );

  return (
    <Box>
      <Box sx={{ mb: 4, mt: 1 }}>
        <Typography variant="overline" sx={{ color: goldMuted }}>Configuration</Typography>
        <Typography variant="h2" sx={{ mt: 0.5 }}>Settings</Typography>
      </Box>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h5" sx={{ mb: 2.5 }}>AI Oracle</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Automatic lets the Oracle choose, and keep one voice per story. Pick a
            specific model only if you want to hear a different one — if it stops
            answering, the Oracle quietly falls back and tells you it did.
          </Typography>

          {error ? (
            <GeekErrorState
              compact
              error={error}
              onRetry={load}
              title="The Oracle is silent"
              description="Couldn't reach the model list. Automatic still works."
            />
          ) : loading ? (
            <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={24} sx={{ color: gold }} /></Box>
          ) : (
            <>
              <FormControl fullWidth>
                <InputLabel id="oracle-model-label">Model</InputLabel>
                <Select
                  labelId="oracle-model-label"
                  label="Model"
                  value={value}
                  onChange={onChange}
                  renderValue={(selected) => (selected ? selected.split('/').slice(1).join('/') : 'Automatic')}
                >
                  <MenuItem value="">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>Automatic</span>
                      <Chip label="Recommended" size="small" color="success" sx={{ height: 20, fontSize: '0.6rem' }} />
                    </Box>
                  </MenuItem>
                  {free.length > 0 && <ListSubheader>Free</ListSubheader>}
                  {free.map(renderRow)}
                  {paid.length > 0 && <ListSubheader>Paid</ListSubheader>}
                  {paid.map(renderRow)}
                </Select>
              </FormControl>

              {!listAvailable && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                  The model list is unavailable right now. Automatic is unaffected.
                </Typography>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default Settings;
