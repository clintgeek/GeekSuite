/**
 * UsagePanel — panel 2: what it cost, and what it is allowed to cost.
 *
 * This is the old Usage & Cost tab with the one line it was missing at the
 * top. `AISpend` is the ledger (Phase 2), so the month, the day and both caps
 * are one read from `GET /api/ai/status` — and that line, not the tables, is
 * what a monthly visit is actually for. The plan's target number: "the status
 * page shows dollars left of the $10, and the number barely moves."
 *
 * Two Phase 3 changes below the line. Each feature row now carries the app's
 * `dailyCap` next to its count, because a count with no ceiling next to it
 * cannot tell you whether an app is near one. And "Reset stats" moved to the
 * bottom, behind the same confirm: it was a top-right error-coloured button
 * on a panel you open to *read*, which is a destructive action sitting where
 * the eye lands first.
 *
 * Below `md` the two tables become card lists. Six and seven columns do not
 * survive a 390px viewport: the cells collapse to roughly 40px and every
 * number wraps mid-digit. MOBILE_UI_PLAN §2 makes this a shared rule ("below
 * md a table renders as a card or definition list") with the layout left to
 * the app. The tables themselves are unchanged at md and up.
 *
 * The app breakdown leads with the app, not the provider, and sorts by app id:
 * aiGeek resolves the caller from its API key and records a `feature`
 * sub-label under it, so "what is storygeek spending, and on what" is the
 * question this table is asked. The feature line renders only where the server
 * actually recorded one — an app that never sets a feature gets no empty
 * second line.
 */
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { DeleteSweep as DeleteSweepIcon } from '@mui/icons-material';
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';
import { formatCost, formatTokens, formatUsd, featureRows, normalizeAppId } from './format';

/** The budget the whole plan is written against (DOCS/AIGEEK_ELEVATION_PLAN.md D1). */
const MONTHLY_BUDGET_USD = 10;

/**
 * The spend line.
 *
 * Rendered from `status.spend` and nothing else — no client-side arithmetic
 * over the usage tables, which count *session* calls (`aiService` resets them
 * on restart) and would disagree with the ledger by however long ago the last
 * deploy was.
 */
function SpendLine({ spend }) {
  if (!spend) {
    return (
      <Typography variant="body2" color="text.muted" sx={{ fontSize: 12 }}>
        Spend for the month is unavailable — the status endpoint did not answer.
      </Typography>
    );
  }

  return (
    <Typography variant="body1" sx={{ fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word' }}>
      <Box component="span" sx={{ fontWeight: 600 }}>
        This month: {formatUsd(spend.monthUsd)} of the ${MONTHLY_BUDGET_USD}
      </Box>
      {' · '}today {formatUsd(spend.todayUsd)}
      {' · '}caps {formatUsd(spend.capPerDayUsd)}/day, {formatUsd(spend.capPerCallUsd)}/call
      {typeof spend.paidCallsMonth === 'number' && (
        <>{' · '}{spend.paidCallsMonth.toLocaleString()} paid call{spend.paidCallsMonth === 1 ? '' : 's'}</>
      )}
    </Typography>
  );
}

/**
 * The compact form of a usage table.
 * `rows` are `{ key, title, subtitle?, note?, fields: [{ label, value, sx? }] }`.
 */
const UsageCardList = ({ rows }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    {rows.map(row => (
      <Card key={row.key} variant="outlined">
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>
            {row.title}
          </Typography>
          {row.subtitle && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: 'capitalize', display: 'block' }}
            >
              {row.subtitle}
            </Typography>
          )}
          {row.note && (
            <Typography variant="caption" color="text.muted" sx={{ display: 'block', fontSize: 12 }}>
              {row.note}
            </Typography>
          )}
          <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: '1fr', rowGap: 0.5 }}>
            {row.fields.map(field => (
              <Box
                key={field.label}
                sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}
              >
                <Typography variant="body2" color="text.secondary">{field.label}</Typography>
                <Typography
                  variant="body2"
                  sx={{ fontVariantNumeric: 'tabular-nums', ...field.sx }}
                >
                  {field.value}
                </Typography>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    ))}
  </Box>
);

/** The five numeric columns every usage row carries, in one place. */
const usageFields = (usage) => [
  { label: 'Total calls', value: usage.calls || 0 },
  { label: 'Free calls', value: usage.freeCalls || 0, sx: { color: 'success.main' } },
  { label: 'Paid calls', value: usage.paidCalls || 0, sx: { color: 'warning.main' } },
  { label: 'Tokens', value: formatTokens(usage.tokens || 0) },
  { label: 'Cost', value: formatCost(usage.cost || 0) },
];

const TotalCard = ({ label, value }) => (
  <Grid item xs={12} md={4}>
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" color="primary">{label}</Typography>
        <Typography variant="h4">{value}</Typography>
      </CardContent>
    </Card>
  </Grid>
);

/**
 * "review ×640 / 200 · commit-message ×163 / 200" — the feature line, with the
 * app's daily cap beside each count (§2).
 *
 * The cap is a per-app, per-bucket ceiling on `POST /api/ai/feature`
 * (models/AIAppConfig.js `dailyCap`), so it repeats per feature rather than
 * being divided between them — which is what the door actually does. `null`
 * means the door's own default, and an em dash would read as "no limit"; the
 * word "default" is what it is.
 */
const featureLineWithCaps = (appUsage, dailyCap) => {
  const rows = featureRows(appUsage);
  if (rows.length === 0) return null;
  const cap = typeof dailyCap === 'number' && dailyCap > 0 ? String(dailyCap) : 'default';
  return rows
    .map(row => (row.calls ? `${row.feature} ×${row.calls} / ${cap}` : `${row.feature} / ${cap}`))
    .join(' · ');
};

export default function UsagePanel({
  stats,
  statsError,
  spend,
  dailyCapFor,
  isCompact,
  onRetry,
  onResetStats,
}) {
  const providerUsage = stats.providerUsage || {};
  const providerRows = Object.entries(providerUsage);

  /**
   * One row per (app, provider) pair, ordered by app id so every row for an
   * app sits together. Grouping harder than this would have to sum costs
   * across providers, which hides the one number an admin comes here for.
   */
  const appRows = providerRows
    .flatMap(([provider, usage]) =>
      Object.entries(usage.appUsage || {}).map(([appName, appUsage]) => {
        const appId = normalizeAppId(appName) || appName;
        return {
          key: `${provider}-${appName}`,
          appId,
          provider,
          usage: appUsage,
          features: featureLineWithCaps(appUsage, dailyCapFor?.(appId)),
        };
      })
    )
    .sort((a, b) => a.appId.localeCompare(b.appId) || a.provider.localeCompare(b.provider));

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1.5 }}>Usage and cost</Typography>

        <Box
          sx={{
            p: 1.5,
            mb: 3,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'action.hover',
          }}
        >
          <SpendLine spend={spend} />
        </Box>

        {statsError && (
          <GeekErrorState
            title="Couldn't load usage statistics"
            error={statsError}
            onRetry={onRetry}
          />
        )}

        <Grid container spacing={3}>
          <TotalCard label="Total Calls" value={stats.totalCalls || 0} />
          <TotalCard label="Total Tokens" value={formatTokens(stats.totalTokens || 0)} />
          <TotalCard label="Total Cost" value={formatCost(stats.totalCost || 0)} />
        </Grid>

        <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>Provider Usage</Typography>

        {providerRows.length === 0 ? (
          <GeekEmptyState
            compact
            title="No usage recorded yet"
            description="Provider rows appear once an app makes its first call through aiGeek."
          />
        ) : isCompact ? (
          <UsageCardList
            rows={providerRows.map(([provider, usage]) => ({
              key: provider,
              title: provider,
              fields: usageFields(usage),
            }))}
          />
        ) : (
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
                {providerRows.map(([provider, usage]) => (
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
        )}

        {appRows.length > 0 && (
          <>
            <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>App Usage Breakdown</Typography>

            {isCompact ? (
              <UsageCardList
                rows={appRows.map(row => ({
                  key: row.key,
                  title: row.appId,
                  subtitle: row.provider,
                  note: row.features,
                  fields: usageFields(row.usage),
                }))}
              />
            ) : (
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>App</TableCell>
                      <TableCell>Provider</TableCell>
                      <TableCell>Total Calls</TableCell>
                      <TableCell>Free Calls</TableCell>
                      <TableCell>Paid Calls</TableCell>
                      <TableCell>Tokens</TableCell>
                      <TableCell>Cost</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {appRows.map(row => (
                      <TableRow key={row.key}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{row.appId}</Typography>
                          {row.features && (
                            <Typography variant="caption" color="text.muted" sx={{ fontSize: 12 }}>
                              {row.features}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{row.provider}</TableCell>
                        <TableCell>{row.usage.calls || 0}</TableCell>
                        <TableCell sx={{ color: 'success.main' }}>{row.usage.freeCalls || 0}</TableCell>
                        <TableCell sx={{ color: 'warning.main' }}>{row.usage.paidCalls || 0}</TableCell>
                        <TableCell>{formatTokens(row.usage.tokens || 0)}</TableCell>
                        <TableCell>{formatCost(row.usage.cost || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}

        <Divider sx={{ mt: 4, mb: 2 }} />

        <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={onResetStats}
            startIcon={<DeleteSweepIcon />}
            color="error"
            sx={{ minHeight: 44, fontSize: 12 }}
          >
            Reset stats
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
