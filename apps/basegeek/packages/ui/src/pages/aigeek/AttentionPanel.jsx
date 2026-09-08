/**
 * AttentionPanel — panel 1, and the reason the page exists.
 *
 * The old console had five tabs and about eighty-eight controls and could not
 * answer "is anything wrong". This list is `GET /api/ai/status`'s `attention`
 * array rendered straight, one row per item, with at most one action each. An
 * empty list is the good outcome and says so: `GeekEmptyState` with the two
 * numbers that prove the catalog is being tended (§2).
 *
 * Nothing here computes a condition. The server decides what needs attention
 * and supplies the exact text (§1's table); this file decides what a row looks
 * like and which handler its button calls. That split is deliberate — the same
 * `attention` array is meant to feed a StartGeek glance card later, and a
 * condition evaluated in a React component could not go there.
 *
 * Severity is `warn` or `info` and lands on theme tokens (`warning.main`,
 * `info.main`), never a hex: this page renders in both schemes and the
 * semantic colours carry a per-mode value that clears 4.5:1 on that mode's
 * paper (DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md).
 *
 * It carries that colour on a left rule and the icon, **not as a tint behind
 * the row.** The first cut used `alpha(warning.main, 0.08)` as the row fill,
 * and the mobile harness caught what that costs: it shifts the ground under
 * every caption in the row, and `text.muted` on the shifted ground measured
 * 4.38:1 in dark mode — an AA failure on copy, for decoration. The theme's
 * text tiers are audited against `background.paper`, so the row stays on
 * `background.paper`.
 */
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Typography,
} from '@mui/material';
import {
  WarningAmber as WarningIcon,
  InfoOutlined as InfoIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';
import { formatAgo } from './format';

const SEVERITY = {
  warn: { token: 'warning.main', icon: WarningIcon, label: 'Warning' },
  info: { token: 'info.main', icon: InfoIcon, label: 'For information' },
};

const severityOf = (item) => SEVERITY[item?.severity] || SEVERITY.info;

/**
 * The one action a row offers, or nothing.
 *
 * `discovery_stale` is the only kind whose button changes what it says: the
 * route answers 202 and the job runs out of band, so "running…" is the honest
 * label until a status poll disagrees (§2).
 */
function itemAction(item, handlers, discoveryRunning) {
  switch (item.kind) {
    case 'provider_dead':
    case 'provider_listing_failed':
      return item.provider
        ? { label: 'Open provider', onClick: () => handlers.onOpenProvider(item.provider) }
        : null;
    case 'unrouted_app':
      return item.app
        ? { label: 'Add routing', onClick: () => handlers.onAddRouting(item.app) }
        : null;
    case 'key_expiring':
      return item.app
        ? { label: 'Rotate', onClick: () => handlers.onRotateKey(item.app) }
        : null;
    case 'discovery_stale':
      return {
        label: discoveryRunning ? 'Running…' : 'Run discovery now',
        onClick: handlers.onRunDiscovery,
        busy: discoveryRunning,
      };
    default:
      // `repinned`, `paid_budget_hit` and `plaintext_keys` are reports, not
      // chores: the first two are the system telling you it coped, and the
      // third is fixed by a migration script, not by a button on this page.
      return null;
  }
}

function AttentionRow({ item, handlers, discoveryRunning }) {
  const severity = severityOf(item);
  const Icon = severity.icon;
  const action = itemAction(item, handlers, discoveryRunning);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.25,
        p: 1.5,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        // The severity signal: a left rule and the icon beside it. Eight rows
        // in a solid severity colour is a wall, and a tint behind them costs
        // the captions their contrast (see the note above).
        borderLeftWidth: 4,
        borderLeftColor: severity.token,
        bgcolor: 'background.paper',
        // The action wraps under the text at 390px rather than squeezing it.
        flexWrap: { xs: 'wrap', sm: 'nowrap' },
      }}
    >
      <Box aria-hidden="true" sx={{ color: severity.token, display: 'flex', pt: 0.25 }}>
        <Icon fontSize="small" />
      </Box>

      <Box sx={{ flex: 1, minWidth: 200 }}>
        {/*
          The severity is colour and an icon, so it needs a text equivalent for
          a screen reader. Note the units: MUI's `sx` reads a bare `1` on
          `width`/`height` as **100%**, so the first cut's `width: 1` made an
          absolutely-positioned 100%-wide box that pushed the document 58px
          past the viewport — which is how the harness reported a sideways
          scroll blamed on the shell's nav drawer.
        */}
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
          <Box
            component="span"
            sx={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              clip: 'rect(0 0 0 0)',
              clipPath: 'inset(50%)',
            }}
          >
            {severity.label}:{' '}
          </Box>
          {item.text}
        </Typography>
        {item.since && (
          <Typography variant="caption" color="text.muted" sx={{ fontSize: 12, display: 'block' }}>
            since {formatAgo(item.since)}
          </Typography>
        )}
      </Box>

      {action && (
        <Button
          size="small"
          variant="outlined"
          onClick={action.onClick}
          disabled={action.busy}
          startIcon={action.busy ? <CircularProgress size={14} color="inherit" /> : null}
          sx={{ minHeight: 44, flexShrink: 0, fontSize: 12 }}
        >
          {action.label}
        </Button>
      )}
    </Box>
  );
}

export default function AttentionPanel({
  status,
  statusError,
  statusLoading,
  discoveryRunning,
  onRetry,
  onOpenProvider,
  onAddRouting,
  onRotateKey,
  onRunDiscovery,
}) {
  const items = status?.attention || [];
  const catalog = status?.catalog || {};
  const handlers = { onOpenProvider, onAddRouting, onRotateKey, onRunDiscovery };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6">Needs attention</Typography>
          {items.length > 0 && (
            <Chip
              size="small"
              color={items.some(item => item.severity === 'warn') ? 'warning' : 'info'}
              label={items.length}
              sx={{ fontSize: 12 }}
            />
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Button
            size="small"
            onClick={onRetry}
            disabled={statusLoading}
            startIcon={statusLoading ? <CircularProgress size={14} /> : <RefreshIcon />}
            sx={{ minHeight: 44, fontSize: 12 }}
          >
            Refresh
          </Button>
        </Box>

        {statusError ? (
          <GeekErrorState
            compact
            title="Couldn't read the AI status"
            description="Everything below still works; this panel is the one round trip that answers “is anything wrong”."
            error={statusError}
            onRetry={onRetry}
          />
        ) : items.length === 0 ? (
          <GeekEmptyState
            title="Nothing needs you"
            description={`Last catalog refresh ${formatAgo(catalog.lastDiscovery?.at)}; ${catalog.aliveFree ?? 0} free models alive.`}
          />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {items.map((item, index) => (
              <AttentionRow
                // `kind` repeats across items (two dead providers), and the
                // server sends no id — so the composite is the key.
                key={`${item.kind}:${item.provider || item.app || item.modelId || index}`}
                item={item}
                handlers={handlers}
                discoveryRunning={discoveryRunning}
              />
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
