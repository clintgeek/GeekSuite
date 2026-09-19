/**
 * CatalogPanel — the catalog, read-only, collapsed by default.
 *
 * The old Catalog tab had a Free checkbox, four editable limit fields, a
 * pricing dialog, a free-tier dialog, Sync, Reset-all and Save-all per row —
 * eight ways to hand-write a claim about a vendor who changes their mind
 * monthly. Every one of those fields is now something the catalog job
 * *observes* (DOCS/AIGEEK_CATALOG_JOB.md): the listing gives the model set and
 * its prices, the nightly probe gives fitness, and the `x-ratelimit-*` headers
 * on real calls give the quotas. So this is a table, and it is collapsed,
 * because on a good month nobody needs to read it.
 *
 * Two sources, joined in `useAIGeek.catalogRows`: `aiDirectorModels` lists
 * every model whether or not it answers, and `/api/ai/models/alive` says which
 * ones do and how well. A row in the catalog and not in the alive list is
 * cooling or unkeyed, which is information — so it stays in the table.
 *
 * **The override drawer is live** (2026-09-11). `Never pick` writes
 * `AIFreeTier.override: 'deny'` — selection, `/models/alive`, pin resolution
 * and the job's revive path all honour it. `Always allow` writes `'allow'` —
 * the row stays a candidate through a cooling spell. Both off clears the
 * field and the row goes back to living by what the job observes.
 *
 * **Vision / Speed / Quality columns** (2026-09-19, review §3.4). This table
 * is the one page whose job is to prevent a bad model choice, and until now
 * it could not show the three measured facts added specifically to replace
 * `capabilities.performance`/`tasks` name-guessing as a routing signal
 * (§1.4): whether a row accepts an image (`acceptsImageInput`, the vendor's
 * own listing), how fast it actually answers (`latency.p50Ms`, timed over
 * five runs), and how it scored on the golden set (`quality.score`, six
 * questions with known answers, scored by code). All three came from
 * `aiDirectorService.freeTierMap`, which carried them into `aiDirectorModels`
 * all along — this file and `useAIGeek.catalogRows` were the gap.
 */
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import { Refresh as RefreshIcon, Tune as TuneIcon } from '@mui/icons-material';
import { GeekEmptyState, GeekErrorState, GeekSheet } from '@geeksuite/ui';
import ResponsiveTable from '../../components/primitives/ResponsiveTable';
import { formatAgo, formatLimit } from './format';

/** The four ceilings a row can report, in column order. */
const LIMIT_FIELDS = [
  ['requestsPerMinute', 'RPM'],
  ['requestsPerDay', 'RPD'],
  ['tokensPerMinute', 'TPM'],
  ['tokensPerDay', 'TPD'],
];

const limitLine = (limits) => {
  const parts = LIMIT_FIELDS
    .filter(([key]) => typeof limits?.[key] === 'number' && limits[key] > 0)
    .map(([key, short]) => `${short} ${formatLimit(limits[key])}`);
  return parts.length ? parts.join(' · ') : 'none reported';
};

/**
 * The live reading off the last real call's `x-ratelimit-*` headers, when a
 * provider reports one — "14 left · resets 3:04 PM". Providers that send no
 * headers (Gemini, Cloudflare, Cohere, Ollama) simply have no `observed`.
 */
const observedLine = (observed) => {
  if (typeof observed?.remainingRequests !== 'number') return null;
  const reset = observed.resetAt
    ? ` · resets ${new Date(observed.resetAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';
  return `${formatLimit(observed.remainingRequests)} left${reset}`;
};

/**
 * "Cooling until 4:12 PM after 3 failures" — `health.coolingUntil` and
 * `health.consecutiveFailures` (review §2, `catalogRows.health`). This is the
 * fields' only reader anywhere in the UI: `useAIGeek.js` has computed and
 * passed the whole `health` object since the health-memory work landed
 * (R130), and nothing rendered it until now. Falls back to the old generic
 * line when there is no `coolingUntil` to be concrete about — a row can also
 * read "not a candidate" for reasons `health` does not carry, such as never
 * having been on the free tier at all.
 *
 * Exported so `CatalogPanel.test.jsx` can assert the exact sentence without
 * having to drive a real MUI `Tooltip` open in jsdom.
 */
export const coolingLine = (health) => {
  const until = health?.coolingUntil ? new Date(health.coolingUntil) : null;
  if (!until || Number.isNaN(until.getTime())) {
    return 'Not a candidate right now: cooling after a failure, or not on the free tier';
  }
  const when = until.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const failures = health?.consecutiveFailures;
  const failureNote = typeof failures === 'number' && failures > 0
    ? ` after ${failures} failure${failures === 1 ? '' : 's'}`
    : '';
  return `Cooling until ${when}${failureNote}`;
};

/**
 * The vendor's own answer to "does this row accept an image?" — one of the
 * three fields `aiDirectorService.freeTierMap` gained 2026-09-19 to replace
 * the name-guessed `capabilities.performance`/`tasks` fields this table used
 * to have nothing measured to show instead of (review §3.4).
 *
 * Three states, not two: `true` is vendor-confirmed, `false` is
 * vendor-confirmed-not, and `null` is "this provider's listing does not say"
 * — only OpenRouter's does today (`AIFreeTier.js`'s `acceptsImageInput`
 * doc). Collapsing the last two into one "no" would misrepresent eight of
 * nine providers as having been asked and declined.
 */
const visionCell = (acceptsImageInput) => {
  if (acceptsImageInput === true) {
    return (
      <Tooltip title="This provider's listing declares image input">
        <Chip size="small" variant="outlined" color="info" label="sees images" sx={{ fontSize: 12 }} />
      </Tooltip>
    );
  }
  if (acceptsImageInput === false) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>text only</Typography>
    );
  }
  return (
    <Tooltip title="This provider's listing does not say whether this row accepts images — only OpenRouter's does today">
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>?</Typography>
    </Tooltip>
  );
};

/** The weight-class label a row's measured `latency.p50Ms` falls in. */
const WEIGHT_LABELS = { fast: 'fast', balanced: 'balanced', deep: 'deep' };

/**
 * Measured speed, not a guessed `performance.speed` tier (review §1.4/§3.4):
 * the weight-class band `latency.p50Ms` falls in, plus the raw median so an
 * admin can see how close a row is to the next band. `null` means never
 * timed — the row has not been probed enough times yet, not that it is slow.
 */
const speedCell = (row) => {
  if (!row.weightClass) {
    return <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>not timed</Typography>;
  }
  return (
    <Box>
      <Chip
        size="small"
        variant="outlined"
        label={WEIGHT_LABELS[row.weightClass] || row.weightClass}
        sx={{ fontSize: 12 }}
      />
      <Typography variant="caption" color="text.muted" display="block" sx={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
        {formatLimit(row.latencyP50Ms)}ms median
      </Typography>
    </Box>
  );
};

/**
 * The golden set's answer to "is this row's output any good", 0-100
 * (`quality.score` is stored 0-1). `fitness` says a row can emit JSON;
 * this says whether what it emits is worth reading, which `DOCS/
 * AIGEEK_CAPABILITY_ROUTING.md` §3.2 explains is the different, more
 * important question. `—` for a row the golden set has never asked, not a
 * red 0 — the same "unmeasured is not the same as bad" rule the score
 * itself is ranked with (`aiNeedResolver.js`, `aiDirectorService.js`
 * `capabilityFitScore`).
 */
const qualityCell = (row) => {
  if (typeof row.qualityScore !== 'number') {
    return (
      <Tooltip title="Never asked the golden set">
        <Typography variant="body2" color="text.secondary">—</Typography>
      </Tooltip>
    );
  }
  const pct = Math.round(row.qualityScore * 100);
  const tone = pct >= 70 ? 'success' : pct >= 40 ? 'warning' : 'error';
  const scoredLine = row.qualityScoredAt ? `Scored ${formatAgo(row.qualityScoredAt)}` : 'Golden-set score';
  return (
    <Tooltip title={scoredLine}>
      <Chip size="small" variant="outlined" color={tone} label={`${pct}/100`} sx={{ fontSize: 12 }} />
    </Tooltip>
  );
};

/**
 * The override drawer for one row.
 *
 * A `GeekSheet` rather than a dialog: it is a per-row "more" surface, which is
 * exactly what the primitive is for (MOBILE_UI_PLAN §2) — a bottom sheet on a
 * phone and a centered dialog at `md`+, decided by the primitive rather than
 * by this file.
 */
function OverrideDrawer({ row, onClose, onSetOverride }) {
  const deny = row?.override === 'deny';
  const allow = row?.override === 'allow';
  const toggle = (which) => () => {
    // Each switch is its own value; turning one off clears the field rather
    // than writing the other. Both off means "the job decides".
    const next = (which === 'deny' ? deny : allow) ? null : which;
    onSetOverride(row, next);
  };
  return (
    <GeekSheet
      open={!!row}
      onClose={onClose}
      title={row ? `${row.provider} / ${row.modelId}` : 'Override'}
      description="Take one row out of selection, or keep it in regardless of what the probe thinks."
      actions={<Button onClick={onClose} sx={{ minHeight: 44 }}>Close</Button>}
    >
      <Box>
        <FormControlLabel
          control={(
            <Switch
              checked={deny}
              onChange={toggle('deny')}
              inputProps={{ 'aria-label': 'Never pick this model' }}
            />
          )}
          label={(
            <Box>
              <Typography variant="body2">Never pick</Typography>
              <Typography variant="caption" color="text.muted" sx={{ fontSize: 12 }}>
                Selection and discovery both skip the row, however healthy it looks.
              </Typography>
            </Box>
          )}
          sx={{ alignItems: 'flex-start', ml: 0, mb: 1 }}
        />
        <FormControlLabel
          control={(
            <Switch
              checked={allow}
              onChange={toggle('allow')}
              inputProps={{ 'aria-label': 'Always allow this model' }}
            />
          )}
          label={(
            <Box>
              <Typography variant="body2">Always allow</Typography>
              <Typography variant="caption" color="text.muted" sx={{ fontSize: 12 }}>
                Keeps the row a candidate even while the probe has it cooling.
              </Typography>
            </Box>
          )}
          sx={{ alignItems: 'flex-start', ml: 0 }}
        />
      </Box>
    </GeekSheet>
  );
}

export default function CatalogPanel({
  rows,
  loading,
  error,
  overrideRow,
  onRefresh,
  onOpenOverride,
  onCloseOverride,
  onSetOverride,
}) {
  if (error) {
    return <GeekErrorState title="Couldn't load the catalog" error={error} onRetry={onRefresh} />;
  }
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
    );
  }
  if (rows.length === 0) {
    return (
      <GeekEmptyState
        title="The catalog is empty"
        description="Rows appear once a provider has a key and the catalog job has read its listing."
        action={(
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRefresh} sx={{ minHeight: 44 }}>
            Refresh
          </Button>
        )}
      />
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.muted" sx={{ fontSize: 12, flex: 1, minWidth: 200 }}>
          {rows.length} model{rows.length === 1 ? '' : 's'}, as the catalog job last observed them.
          Nothing here is editable — the job maintains it.
        </Typography>
        <Button
          size="small"
          startIcon={<RefreshIcon />}
          onClick={onRefresh}
          sx={{ minHeight: 44, fontSize: 12 }}
        >
          Refresh
        </Button>
      </Box>

      <ResponsiveTable
        rows={rows}
        rowKey={(row) => row.key}
        renderCardHeader={(row) => (
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
              {row.modelId}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, textTransform: 'capitalize' }}>
              {row.provider}
            </Typography>
          </Box>
        )}
        columns={[
          {
            key: 'provider',
            label: 'Provider',
            card: false,
            render: (row) => (
              <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{row.provider}</Typography>
            ),
          },
          {
            key: 'modelId',
            label: 'Model',
            card: false,
            render: (row) => (
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{row.modelId}</Typography>
                {row.name && row.name !== row.modelId && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
                    {row.name}
                  </Typography>
                )}
              </Box>
            ),
          },
          {
            key: 'fitness',
            label: 'Fitness',
            render: (row) => (row.fitness
              ? (
                <Chip
                  size="small"
                  variant="outlined"
                  color={row.fitness === 'structured' ? 'success' : 'default'}
                  label={row.fitness}
                  sx={{ fontSize: 12 }}
                />
              )
              : (
                <Tooltip title="Never probed — a row written by an older sync, or one the job has not reached">
                  <Typography variant="body2" color="text.secondary">—</Typography>
                </Tooltip>
              )),
          },
          {
            key: 'acceptsImageInput',
            label: 'Vision',
            render: (row) => visionCell(row.acceptsImageInput),
          },
          {
            key: 'weightClass',
            label: 'Speed',
            render: (row) => speedCell(row),
          },
          {
            key: 'qualityScore',
            label: 'Quality',
            render: (row) => qualityCell(row),
          },
          {
            key: 'alive',
            label: 'State',
            render: (row) => {
              if (row.override === 'deny') {
                return (
                  <Tooltip title="Never picked — a human denied this row in the override drawer">
                    <Chip size="small" color="error" variant="outlined" label="denied" sx={{ fontSize: 12 }} />
                  </Tooltip>
                );
              }
              if (row.alive) {
                return (
                  <Chip
                    size="small"
                    color={row.paid ? 'warning' : 'success'}
                    label={row.paid ? 'alive · paid' : 'alive'}
                    sx={{ fontSize: 12 }}
                  />
                );
              }
              if (!row.hasKey) {
                return <Chip size="small" variant="outlined" label="no key" sx={{ fontSize: 12 }} />;
              }
              return (
                <Tooltip title={coolingLine(row.health)}>
                  <Chip size="small" variant="outlined" color="warning" label="cooling" sx={{ fontSize: 12 }} />
                </Tooltip>
              );
            },
          },
          {
            key: 'lastSuccessAt',
            label: 'Last success',
            render: (row) => (
              <Typography variant="body2" sx={{ fontSize: 12 }}>
                {formatAgo(row.lastSuccessAt)}
              </Typography>
            ),
          },
          {
            key: 'limits',
            label: 'Limits observed',
            render: (row) => {
              const observed = observedLine(row.observed);
              return (
                <Box>
                  <Typography variant="body2" sx={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {limitLine(row.limits)}
                  </Typography>
                  {observed && (
                    <Typography variant="caption" color="text.muted" sx={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                      {observed}
                    </Typography>
                  )}
                </Box>
              );
            },
          },
        ]}
        renderActions={(row) => (
          <Tooltip title="Override this row">
            <Button
              size="small"
              startIcon={<TuneIcon fontSize="small" />}
              onClick={() => onOpenOverride(row)}
              sx={{ minHeight: 44, fontSize: 12 }}
            >
              Override
            </Button>
          </Tooltip>
        )}
      />

      <OverrideDrawer row={overrideRow} onClose={onCloseOverride} onSetOverride={onSetOverride} />
    </Box>
  );
}
