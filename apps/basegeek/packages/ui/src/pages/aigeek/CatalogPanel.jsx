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
 * **The override drawer is disabled.** §2 asks for `Never pick` / `Always
 * allow` per row, written as `AIFreeTier.override: 'deny' | 'allow' | null`.
 * That field does not exist on the model yet and there is no mutation for it,
 * and adding a resolver for a field the schema lacks would be a control that
 * silently does nothing — worse than a control that says "not yet". So the
 * drawer renders with both switches disabled and a "coming soon" note, and the
 * ask is written up for the API side.
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
 * The override drawer for one row.
 *
 * A `GeekSheet` rather than a dialog: it is a per-row "more" surface, which is
 * exactly what the primitive is for (MOBILE_UI_PLAN §2) — a bottom sheet on a
 * phone and a centered dialog at `md`+, decided by the primitive rather than
 * by this file.
 */
function OverrideDrawer({ row, onClose }) {
  const notYet = 'Coming soon — AIFreeTier has no override field yet, so this would not persist.';
  return (
    <GeekSheet
      open={!!row}
      onClose={onClose}
      title={row ? `${row.provider} / ${row.modelId}` : 'Override'}
      description="Take one row out of selection, or keep it in regardless of what the probe thinks."
      actions={<Button onClick={onClose} sx={{ minHeight: 44 }}>Close</Button>}
    >
      <Tooltip title={notYet}>
        <Box>
          <FormControlLabel
            control={<Switch disabled inputProps={{ 'aria-label': 'Never pick this model' }} />}
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
            control={<Switch disabled inputProps={{ 'aria-label': 'Always allow this model' }} />}
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
      </Tooltip>

      <Typography variant="caption" color="text.muted" display="block" sx={{ fontSize: 12, mt: 2 }}>
        {notYet}
      </Typography>
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
                  <Typography variant="body2" color="text.disabled">—</Typography>
                </Tooltip>
              )),
          },
          {
            key: 'alive',
            label: 'State',
            render: (row) => {
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
                <Tooltip title="Not a candidate right now: cooling after a failure, or not on the free tier">
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
            render: (row) => (
              <Typography variant="body2" sx={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                {limitLine(row.limits)}
              </Typography>
            ),
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

      <OverrideDrawer row={overrideRow} onClose={onCloseOverride} />
    </Box>
  );
}
