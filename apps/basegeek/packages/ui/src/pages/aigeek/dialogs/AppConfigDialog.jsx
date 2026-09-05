/**
 * AppConfigDialog — one app's routing, plus the model steward that fills it in.
 *
 * The steward block is the point of this dialog. Free tiers move: a model that
 * was free in June is retired in August, and the fastest free model this month
 * is not last month's. So rather than an admin hardcoding a model id here from
 * memory, two questions are asked of the server — "what is free right now?"
 * (`aiFreeModels`) and "which of those fits this job?" (`aiRecommendModel`) —
 * and either answer writes straight into the pin above.
 *
 * Both write `tier: 'specific'` along with the provider and model, because
 * `specific` is the only tier the router reads provider/model from; saving a
 * choice while the tier stayed `free` would put it in a field nothing looks at.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { AutoAwesome as AutoAwesomeIcon } from '@mui/icons-material';
import { GeekEmptyState } from '@geeksuite/ui';
import { formatContextWindow, freeModelSummary } from '../format';

/** One ranked suggestion, clickable and keyboard-reachable. */
function RecommendationRow({ rec, selected, onPick }) {
  const theme = useTheme();
  return (
    <Box
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick();
        }
      }}
      sx={{
        minHeight: 44,
        p: 1.25,
        borderRadius: 1,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? alpha(theme.palette.primary.main, 0.1) : 'background.paper',
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{rec.name}</Typography>
        {typeof rec.score === 'number' && (
          <Chip
            size="small"
            label={`fit ${rec.score}`}
            color={selected ? 'primary' : 'default'}
            sx={{ fontSize: 12 }}
          />
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 12 }}>
        {rec.provider} · {rec.modelId} · {formatContextWindow(rec.contextWindow)}
      </Typography>
      <Typography variant="caption" display="block" sx={{ fontSize: 12, mt: 0.5 }}>
        {rec.reasoning}
      </Typography>
    </Box>
  );
}

export default function AppConfigDialog({
  editing,
  providers,
  freeModels,
  freeModelsLoading,
  recommendTask,
  recommendPriority,
  recommendations,
  recommending,
  onPatch,
  onTaskChange,
  onPriorityChange,
  onRecommend,
  onPickModel,
  onLoadFreeModels,
  onCancel,
  onSave,
}) {
  const theme = useTheme();
  const isPinned = (provider, modelId) =>
    editing?.tier === 'specific' && editing?.provider === provider && editing?.model === modelId;

  return (
    <Dialog open={!!editing} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>
        {editing?.appName ? `Configure — ${editing.appName}` : 'New app config'}
      </DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="Display name"
          value={editing?.displayName ?? ''}
          onChange={(e) => onPatch({ displayName: e.target.value })}
          margin="normal"
        />

        <TextField
          fullWidth
          select
          label="Routing tier"
          value={editing?.tier ?? 'free'}
          onChange={(e) => onPatch({ tier: e.target.value })}
          margin="normal"
          SelectProps={{ native: true }}
        >
          <option value="free">Free — free-tier models only</option>
          <option value="rotation">Rotation — all providers</option>
          <option value="specific">Specific — pinned provider/model</option>
        </TextField>

        {editing?.tier === 'specific' && (
          <>
            <TextField
              fullWidth
              select
              label="Provider"
              value={editing?.provider ?? ''}
              onChange={(e) => onPatch({ provider: e.target.value })}
              margin="normal"
              SelectProps={{ native: true }}
              // Empty value + native select = the label sits on top of the
              // first option. Keep it shrunk.
              InputLabelProps={{ shrink: true }}
            >
              <option value="">Select provider…</option>
              {providers.map(p => <option key={p} value={p}>{p}</option>)}
            </TextField>
            <TextField
              fullWidth
              label="Model ID"
              value={editing?.model ?? ''}
              onChange={(e) => onPatch({ model: e.target.value })}
              margin="normal"
              helperText="Exact model ID from the Catalog tab"
            />
          </>
        )}

        <Box
          sx={{
            mt: 2,
            p: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: alpha(theme.palette.primary.main, 0.03),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.75 }}>
            <AutoAwesomeIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2">Recommend a free model</Typography>
          </Box>

          <TextField
            fullWidth
            label="What will this app ask the model to do?"
            placeholder="e.g. turn a search query into a JSON search plan"
            value={recommendTask}
            onChange={(e) => onTaskChange(e.target.value)}
            multiline
            rows={2}
            size="small"
            helperText="Prefilled from Notes. Mentioning JSON, tools, images or code narrows the ranking."
          />

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mt: 1.5 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={recommendPriority}
              onChange={(_, value) => { if (value) onPriorityChange(value); }}
              aria-label="Recommendation priority"
            >
              <ToggleButton value="cost" sx={{ minHeight: 44, px: 2, fontSize: 12 }}>Cost</ToggleButton>
              <ToggleButton value="speed" sx={{ minHeight: 44, px: 2, fontSize: 12 }}>Speed</ToggleButton>
              <ToggleButton value="quality" sx={{ minHeight: 44, px: 2, fontSize: 12 }}>Quality</ToggleButton>
            </ToggleButtonGroup>

            <Button
              variant="contained"
              onClick={onRecommend}
              disabled={recommending || !recommendTask.trim()}
              startIcon={recommending ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
              sx={{ minHeight: 44 }}
            >
              {recommending ? 'Asking…' : 'Recommend'}
            </Button>
          </Box>

          {recommendations && recommendations.length === 0 && (
            <Alert severity="warning" sx={{ mt: 1.5, fontSize: 12 }}>
              No free model matched that description. Loosen the requirements, or pick one
              from the list below.
            </Alert>
          )}

          {recommendations && recommendations.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1.5 }}>
              {recommendations.map((rec) => (
                <RecommendationRow
                  key={`${rec.provider}::${rec.modelId}`}
                  rec={rec}
                  selected={isPinned(rec.provider, rec.modelId)}
                  onPick={() => onPickModel(rec.provider, rec.modelId)}
                />
              ))}
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Browse free models</Typography>

          {freeModelsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : freeModels.length === 0 ? (
            <GeekEmptyState
              compact
              title="No free models available"
              description="Enable a provider with a free tier on the Configuration tab, then tick its models Free on the Catalog tab."
              action={<Button onClick={onLoadFreeModels} sx={{ minHeight: 44 }}>Retry</Button>}
            />
          ) : (
            <TextField
              fullWidth
              select
              size="small"
              label="Free models"
              // displayEmpty renders a placeholder into the field, so the label
              // has to stay shrunk or the two overlap.
              InputLabelProps={{ shrink: true }}
              value={
                editing?.tier === 'specific'
                  && freeModels.some(m => m.provider === editing?.provider && m.modelId === editing?.model)
                  ? `${editing.provider}::${editing.model}`
                  : ''
              }
              onChange={(e) => {
                const [provider, ...rest] = e.target.value.split('::');
                onPickModel(provider, rest.join('::'));
              }}
              SelectProps={{
                displayEmpty: true,
                // Each option is two lines and a row of chips; the closed field
                // gets the one-line summary instead of all of that crammed in.
                renderValue: (value) => {
                  if (!value) return 'Choose a model…';
                  const chosen = freeModels.find(m => `${m.provider}::${m.modelId}` === value);
                  return chosen ? freeModelSummary(chosen) : value;
                },
              }}
              helperText={`${freeModels.length} free model${freeModels.length === 1 ? '' : 's'} reachable right now`}
            >
              {freeModels.map((model) => (
                <MenuItem
                  key={`${model.provider}::${model.modelId}`}
                  value={`${model.provider}::${model.modelId}`}
                  sx={{ minHeight: 44, display: 'block', py: 1 }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {freeModelSummary(model)}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                    {model.performance?.speed && (
                      <Chip size="small" variant="outlined" label={model.performance.speed} sx={{ fontSize: 12 }} />
                    )}
                    {model.performance?.quality && (
                      <Chip size="small" variant="outlined" label={model.performance.quality} sx={{ fontSize: 12 }} />
                    )}
                    {model.supportsJSONOutput && (
                      <Chip size="small" variant="outlined" color="success" label="JSON" sx={{ fontSize: 12 }} />
                    )}
                    {model.supportsFunctionCalling && (
                      <Chip size="small" variant="outlined" color="success" label="tools" sx={{ fontSize: 12 }} />
                    )}
                    {model.supportsVision && (
                      <Chip size="small" variant="outlined" color="success" label="vision" sx={{ fontSize: 12 }} />
                    )}
                  </Box>
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>

        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Max tokens (optional)"
              type="number"
              value={editing?.maxTokens ?? ''}
              onChange={(e) => onPatch({ maxTokens: e.target.value })}
              size="small"
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Temperature (optional)"
              type="number"
              inputProps={{ step: '0.1', min: '0', max: '2' }}
              value={editing?.temperature ?? ''}
              onChange={(e) => onPatch({ temperature: e.target.value })}
              size="small"
            />
          </Grid>
        </Grid>

        <TextField
          fullWidth
          label="Notes"
          value={editing?.notes ?? ''}
          onChange={(e) => onPatch({ notes: e.target.value })}
          margin="normal"
          multiline
          rows={2}
        />

        <FormControlLabel
          control={(
            <Switch
              checked={editing?.enabled !== false}
              onChange={(e) => onPatch({ enabled: e.target.checked })}
            />
          )}
          label="Enabled"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} sx={{ minHeight: 44 }}>Cancel</Button>
        <Button variant="contained" onClick={onSave} sx={{ minHeight: 44 }}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
