/**
 * TestPromptPanel — "Try it": one prompt, through the real router.
 *
 * Before this, the only way to find out whether a saved key actually worked
 * was `Test API Key`, which proves a credential authenticates and nothing else,
 * or to go and use an app. Neither answers the question an admin is usually
 * asking on this page: *given the rotation as configured right now, who answers
 * and what do they say?*
 *
 * So this posts to `POST /api/ai/call` — the same endpoint the suite's apps
 * use, not a special admin path — and reports back what came out: the provider
 * and model that answered, the wall-clock latency, the token counts, and the
 * raw envelope for when the pretty version is not enough.
 *
 * Two deliberate omissions in the request:
 *
 *  - **No `appName`.** The route auto-routes any call that names an app and no
 *    provider through that app's `AIAppConfig` row. Sending one would quietly
 *    stop this from testing the rotation, which is the default the panel is
 *    here to exercise.
 *  - **No `stream`.** The streaming branch returns SSE chunks with no usage and
 *    no provider, so there would be nothing to report.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  FormControlLabel,
  Grid,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { useToast } from '@geeksuite/ui';
import api from '../../api';

const SCHEMA_PLACEHOLDER = `{
  "name": "FruitList",
  "schema": {
    "type": "object",
    "properties": {
      "fruits": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["fruits"]
  }
}`;

/** A labelled fact about the answer — provider, model, latency, tokens. */
const Fact = ({ label, value, tone }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 12 }}>
      {label}
    </Typography>
    <Typography
      variant="body2"
      sx={{ fontWeight: 600, wordBreak: 'break-all', color: tone, fontVariantNumeric: 'tabular-nums' }}
    >
      {value}
    </Typography>
  </Box>
);

export default function TestPromptPanel({ config }) {
  const { notify } = useToast();

  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [useSchema, setUseSchema] = useState(false);
  const [schemaText, setSchemaText] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showRaw, setShowRaw] = useState(false);

  // Only providers that are enabled *and* hold a key can answer; offering the
  // others would be offering a guaranteed 502.
  const reachable = Object.entries(config)
    .filter(([, entry]) => entry.hasKey && entry.enabled)
    .map(([name]) => name);

  const run = async () => {
    const text = prompt.trim();
    if (!text) return;

    let responseFormat = null;
    if (useSchema) {
      const raw = schemaText.trim();
      if (!raw) {
        setError('Add a JSON schema, or turn the toggle off.');
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        // Accept either the bare schema or the full json_schema envelope, so a
        // schema copied out of the docs works either way round.
        responseFormat = parsed.schema
          ? { type: 'json_schema', json_schema: parsed }
          : { type: 'json_schema', json_schema: { name: 'output', schema: parsed } };
      } catch (err) {
        setError(`That schema isn't valid JSON: ${err.message}`);
        return;
      }
    }

    const callConfig = {};
    if (provider) callConfig.provider = provider;
    if (model.trim()) callConfig.model = model.trim();
    if (responseFormat) callConfig.responseFormat = responseFormat;

    setRunning(true);
    setError(null);
    setResult(null);
    const startedAt = performance.now();

    try {
      const { data } = await api.post('/ai/call', { prompt: text, config: callConfig });
      setResult({
        latencyMs: Math.round(performance.now() - startedAt),
        content: data?.choices?.[0]?.message?.content ?? '',
        provider: data?.provider || provider || 'rotation',
        model: data?.model || model || '—',
        usage: data?.usage || null,
        raw: data,
      });
    } catch (err) {
      // The route answers 400 for a bad request and 502 for an upstream
      // failure, both with `{ error: { message } }`.
      const detail = err?.response?.data?.error?.message
        || err?.response?.data?.message
        || err.message
        || 'The call failed';
      setError(detail);
      notify(`Test call failed: ${detail}`, { tone: 'error' });
    } finally {
      setRunning(false);
    }
  };

  const totalTokens = result?.usage?.total_tokens;

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Try it</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 12 }}>
          Sends one prompt through <code>POST /api/ai/call</code> — the same path the suite&apos;s
          apps use. Leave the provider on Rotation to test the free-tier rotation exactly as a
          caller would get it.
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              select
              size="small"
              label="Provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              SelectProps={{ native: true }}
              // A native select always shows its first option, so the label has
              // to stay shrunk or "Provider" sits on top of "Rotation".
              InputLabelProps={{ shrink: true }}
              helperText={reachable.length ? 'Enabled providers holding a key' : 'No provider is enabled with a key yet'}
            >
              <option value="">Rotation (default)</option>
              {reachable.map(name => <option key={name} value={name}>{name}</option>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label="Model (optional)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="leave blank for the default"
              helperText="Exact model ID from the Catalog tab"
            />
          </Grid>
        </Grid>

        <TextField
          fullWidth
          label="Prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          multiline
          rows={3}
          margin="normal"
          placeholder="e.g. Name three fruits."
        />

        <FormControlLabel
          control={<Switch checked={useSchema} onChange={(e) => setUseSchema(e.target.checked)} />}
          label={<Typography variant="body2">JSON schema</Typography>}
          sx={{ minHeight: 44 }}
        />

        <Collapse in={useSchema} unmountOnExit>
          <TextField
            fullWidth
            label="Schema"
            value={schemaText}
            onChange={(e) => setSchemaText(e.target.value)}
            multiline
            rows={6}
            placeholder={SCHEMA_PLACEHOLDER}
            inputProps={{ style: { fontFamily: '"Geist Mono", monospace', fontSize: 12 } }}
            helperText="A bare schema, or the full { name, schema } envelope. Providers without native support get the prompt-injection fallback."
          />
        </Collapse>

        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            onClick={run}
            disabled={running || !prompt.trim()}
            startIcon={running ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
            sx={{ minHeight: 44 }}
          >
            {running ? 'Running…' : 'Run'}
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2, fontSize: 12, wordBreak: 'break-word' }}>
            {error}
          </Alert>
        )}

        {result && (
          <Box sx={{ mt: 2 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
                gap: 1.5,
                mb: 1.5,
              }}
            >
              <Fact label="Provider" value={result.provider} />
              <Fact label="Model" value={result.model} />
              <Fact label="Latency" value={`${result.latencyMs} ms`} />
              <Fact
                label={result.usage?.estimated ? 'Tokens (est.)' : 'Tokens'}
                value={typeof totalTokens === 'number' ? totalTokens.toLocaleString() : '—'}
              />
            </Box>

            {result.usage && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
                <Chip size="small" variant="outlined" sx={{ fontSize: 12 }} label={`in ${result.usage.prompt_tokens ?? 0}`} />
                <Chip size="small" variant="outlined" sx={{ fontSize: 12 }} label={`out ${result.usage.completion_tokens ?? 0}`} />
                {result.usage.estimated && (
                  <Chip size="small" variant="outlined" color="warning" sx={{ fontSize: 12 }} label="counted locally" />
                )}
              </Box>
            )}

            <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 12, mb: 0.5 }}>
              Response
            </Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'action.hover',
                fontFamily: '"Geist Mono", monospace',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 320,
                overflowY: 'auto',
              }}
            >
              {result.content || '(empty response)'}
            </Box>

            <Button
              size="small"
              onClick={() => setShowRaw((open) => !open)}
              endIcon={showRaw ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ mt: 1, minHeight: 44, fontSize: 12 }}
            >
              {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
            </Button>
            <Collapse in={showRaw} unmountOnExit>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  mt: 1,
                  p: 1.5,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                  fontFamily: '"Geist Mono", monospace',
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: 320,
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(result.raw, null, 2)}
              </Box>
            </Collapse>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
