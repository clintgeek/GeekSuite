/**
 * TestPromptPanel — "Try it": one prompt, through the real front door.
 *
 * Before this, the only way to find out whether a saved key actually worked
 * was `Test API Key`, which proves a credential authenticates and nothing
 * else, or to go and use an app. Neither answers the question an admin is
 * usually asking on this page: *given the front door as configured right now,
 * who answers and what do they say?*
 *
 * So it posts to `POST /api/ai/feature` — the same door every app in the suite
 * goes through, not an admin path — and reports the provenance envelope back:
 * which model answered, why that one, whether the answer was cached, what it
 * cost, and where that sits against the feature's daily cap.
 *
 * **It used to post `/api/ai/call`**, which was deleted this phase (D2), and
 * the move is not a path swap:
 *
 *  - The door **fails soft**. A model failure is `200 { ok: false, reason,
 *    provenance }`, not a 5xx, and it is rendered in place with its `hints`
 *    rather than thrown as an error — the whole point of the runner's contract
 *    is that a bad free-tier day is an answer, not an exception. Only a 4xx or
 *    5xx is a transport or auth failure.
 *  - **A pin is provider *and* model, or neither.** The door answers
 *    `400 INCOMPLETE_PIN` for half of one, because a provider with no model
 *    would silently mean "that provider's default", which is not what a picker
 *    means. So the old Provider select and free-text "Model ID" box are gone
 *    and this uses `AliveModelPicker` like every other pin on the page —
 *    leaving it on "Automatic" is what exercises the health-ranked walk.
 *  - **There are no token counts.** `/feature` reports cost, not tokens, so
 *    the panel reports cost. A token fact filled with an em dash is worse than
 *    no token fact.
 *
 * `feature: 'tryit'` is deliberate: the daily cap is counted per feature, so
 * an admin poking at this cannot eat an app's bucket.
 *
 * **`need:` routing (review §3.3, 2026-09-19).** Every real caller in the
 * suite now routes with `need: '<task>[+<task>...]:<weight>'`
 * (`aiNeedResolver.js`) rather than a pin, and this panel had no way to send
 * one — the one diagnostic tool built to answer "given the front door as
 * configured right now, who answers?" could not exercise the mechanism every
 * caller actually uses. A caller pin still wins server-side when both are
 * sent (the door resolves a need only `if (need && !wantsPin)`), so this
 * panel keeps them mutually exclusive on purpose: typing a need clears
 * whatever the picker had pinned, rather than sending both and reporting a
 * pin that silently did nothing. `provenance.need` — `{ asked, resolved,
 * provider?, model?, why? }` — is rendered the same way `hints` already is:
 * in place, not hidden behind "Show raw JSON". A malformed need is a
 * `400 INVALID_NEED` from the door, which lands in the existing 4xx/5xx catch
 * below exactly like any other bad request — no separate handling needed.
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
import AliveModelPicker from './AliveModelPicker';
import { formatCost } from './format';

/** The feature name this panel books its calls under. */
export const TRY_IT_FEATURE = 'tryit';

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

/** A labelled fact about the answer — provider, model, latency, cost. */
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

/** `data` is whatever the feature returned: an object under a schema, else text. */
const renderData = (data) => {
  if (data == null) return '(empty answer)';
  if (typeof data === 'string') return data || '(empty answer)';
  return JSON.stringify(data, null, 2);
};

/** "free" reads better than "$0.0000" for the answer this page wants to see. */
const costLabel = (costUsd) => {
  const num = Number(costUsd);
  if (!Number.isFinite(num) || num <= 0) return 'free';
  return formatCost(num);
};

export default function TestPromptPanel({ picker }) {
  const { notify } = useToast();

  const [pin, setPin] = useState({ provider: null, model: null });
  const [need, setNeed] = useState('');
  const [prompt, setPrompt] = useState('');
  const [useSchema, setUseSchema] = useState(false);
  const [schemaText, setSchemaText] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showRaw, setShowRaw] = useState(false);

  const run = async () => {
    const text = prompt.trim();
    if (!text) return;

    const body = { feature: TRY_IT_FEATURE, user: text };

    if (useSchema) {
      const raw = schemaText.trim();
      if (!raw) {
        setError('Add a JSON schema, or turn the toggle off.');
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        // Accept either the bare schema or the full `{ name, schema }`
        // envelope, so a schema copied out of the docs works either way round.
        // The door requires `{ name, schema }`, so a bare one gets a name.
        body.schema = parsed.schema
          ? { name: parsed.name || 'output', description: parsed.description, schema: parsed.schema }
          : { name: 'output', schema: parsed };
      } catch (err) {
        setError(`That schema isn't valid JSON: ${err.message}`);
        return;
      }
    }

    // A need and a pin are mutually exclusive here, on purpose. The door
    // itself only resolves a need `if (need && !wantsPin)` — a pin always
    // wins server-side — so sending both would silently drop the need the
    // admin typed and report a pin they may not have meant to keep. Whichever
    // one the admin filled in last is the one that should win, and that is
    // "need, when set" per the door's own precedence.
    const trimmedNeed = need.trim();
    if (trimmedNeed) {
      body.need = trimmedNeed;
    } else if (pin.provider && pin.model) {
      // Both or neither — the door refuses half a pin, and rightly.
      body.provider = pin.provider;
      body.model = pin.model;
    }

    setRunning(true);
    setError(null);
    setResult(null);
    const startedAt = performance.now();

    try {
      const { data } = await api.post('/ai/feature', body);
      setResult({
        latencyMs: Math.round(performance.now() - startedAt),
        ok: data?.ok === true,
        reason: data?.reason ?? null,
        data: data?.data ?? null,
        provenance: data?.provenance || {},
        raw: data,
      });
    } catch (err) {
      // Only a 4xx/5xx lands here: the door answers a *model* failure with a
      // 200 and `ok: false`, which is a result, not an error.
      const detail = err?.response?.data?.error?.message
        || err?.response?.data?.message
        || err.message
        || 'The call failed';
      setError(detail);
      notify(`Try it failed: ${detail}`, { tone: 'error' });
    } finally {
      setRunning(false);
    }
  };

  const provenance = result?.provenance || {};
  const hints = Array.isArray(provenance.hints) ? provenance.hints : [];

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 12 }}>
        Sends one prompt through <code>POST /api/ai/feature</code> — the same door the suite&apos;s
        apps use — as the <code>{TRY_IT_FEATURE}</code> feature, so it cannot eat an app&apos;s daily
        cap. Leave both the model below and the need unset to exercise the health-ranked walk
        exactly as a caller with no opinion would get it.
      </Typography>

      <AliveModelPicker
        groups={picker?.groups || []}
        loading={picker?.loading}
        error={picker?.error}
        provider={pin.provider}
        model={pin.model}
        onPick={(provider, model) => setPin(
          provider && model ? { provider, model } : { provider: null, model: null }
        )}
        onReload={picker?.onReload}
        label="Model (Automatic when unset)"
      />

      {/*
        * Every real caller routes with `need:`, not a pin — this is the one
        * field that lets this panel exercise that mechanism at all (review
        * §3.3). It wins over the picker above when both are filled: the door
        * itself only resolves a need `if (need && !wantsPin)`, so honouring
        * anything else here would mean the panel silently sends a pin the
        * admin can see was ignored.
        */}
      <TextField
        fullWidth
        label="Need (overrides the model above when set)"
        value={need}
        onChange={(e) => setNeed(e.target.value)}
        margin="normal"
        placeholder="e.g. structured:fast or vision+structured:balanced"
        helperText={
          need.trim() && pin.provider && pin.model
            ? `Sent instead of the pinned ${pin.provider}/${pin.model} — a need always wins here.`
            : 'One or more of structured | reasoning | prose | code | vision, joined by "+", then '
              + ':fast | balanced | deep. Leave blank to use the model above, or Automatic.'
        }
      />

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
          {/*
            A soft failure. `reason` is the door's own word for what happened
            (cap | unavailable | unparseable | empty | invalid) and `hints`
            carries the detail a consumer would show a user — `pin_unavailable`
            being the one an admin on this page most wants to see, because it
            means the pin they just chose is not answering.
          */}
          {!result.ok && (
            <Alert severity="warning" sx={{ mb: 1.5, fontSize: 12 }}>
              The door answered <strong>{result.reason || 'no answer'}</strong> rather than a
              result. This is a soft failure, not an error: a caller would fall back.
            </Alert>
          )}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
              gap: 1.5,
              mb: 1.5,
            }}
          >
            <Fact label="Provider" value={provenance.provider || '—'} />
            <Fact label="Model" value={provenance.model || '—'} />
            <Fact label="Latency" value={`${result.latencyMs} ms`} />
            <Fact
              label="Cost"
              value={costLabel(provenance.costUsd)}
              tone={Number(provenance.costUsd) > 0 ? 'warning.main' : 'success.main'}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
            {provenance.source && (
              <Chip size="small" variant="outlined" sx={{ fontSize: 12 }} label={`source ${provenance.source}`} />
            )}
            {provenance.reason && (
              <Chip size="small" variant="outlined" sx={{ fontSize: 12 }} label={`why ${provenance.reason}`} />
            )}
            {provenance.cached && (
              <Chip size="small" color="info" variant="outlined" sx={{ fontSize: 12 }} label="cached" />
            )}
            {typeof provenance.callsToday === 'number' && (
              <Chip
                size="small"
                variant="outlined"
                sx={{ fontSize: 12 }}
                label={`${provenance.callsToday}${provenance.cap ? ` / ${provenance.cap}` : ''} today`}
              />
            )}
            {hints.map((hint) => (
              <Chip key={hint} size="small" color="warning" variant="outlined" sx={{ fontSize: 12 }} label={hint} />
            ))}
          </Box>

          {/*
            * `provenance.need` only exists when this call sent one (aiRoutes.js
            * only attaches it `if (need) {...}` on the response). `resolved`
            * is `false` when nothing in the catalog measurably met it — a
            * real outcome, not a bug — and the call still went through on the
            * ordinary rotation, which is why this sits beside the other facts
            * rather than replacing them.
            */}
          {provenance.need && (
            <Box sx={{ mb: 1.5 }}>
              <Chip
                size="small"
                variant="outlined"
                color={provenance.need.resolved ? 'success' : 'default'}
                sx={{ fontSize: 12, mb: 0.5 }}
                label={`need ${provenance.need.asked} → ${
                  provenance.need.resolved
                    ? `${provenance.need.provider}/${provenance.need.model}`
                    : 'unresolved, fell through to the ordinary rotation'
                }`}
              />
              {Array.isArray(provenance.need.why) && provenance.need.why.length > 0 && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 12 }}>
                  {provenance.need.why.join(' · ')}
                </Typography>
              )}
            </Box>
          )}

          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 12, mb: 0.5 }}>
            Answer
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
            {renderData(result.data)}
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
    </Box>
  );
}
