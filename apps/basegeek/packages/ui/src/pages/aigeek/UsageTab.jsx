/**
 * UsageTab — totals, then per-provider and per-app breakdowns.
 *
 * Below `md` the two tables become card lists. Six and seven columns do not
 * survive a 390px viewport: the cells collapse to roughly 40px and every
 * number wraps mid-digit. MOBILE_UI_PLAN §2 makes this a shared rule ("below
 * md a table renders as a card or definition list") with the layout left to
 * the app. The tables themselves are unchanged at md and up.
 *
 * The app breakdown leads with the app, not the provider, and sorts by app id:
 * aiGeek now resolves the caller from its API key and records a `feature`
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
import { formatCost, formatTokens, featureLine, normalizeAppId } from './format';

/**
 * The compact form of a usage table.
 * `rows` are `{ key, title, subtitle?, fields: [{ label, value, sx? }] }`.
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

export default function UsageTab({ stats, statsError, isCompact, onRetry, onResetStats }) {
  const providerUsage = stats.providerUsage || {};
  const providerRows = Object.entries(providerUsage);

  /**
   * One row per (app, provider) pair, ordered by app id so every row for an
   * app sits together. Grouping harder than this would have to sum costs
   * across providers, which hides the one number an admin comes here for.
   */
  const appRows = providerRows
    .flatMap(([provider, usage]) =>
      Object.entries(usage.appUsage || {}).map(([appName, appUsage]) => ({
        key: `${provider}-${appName}`,
        appId: normalizeAppId(appName) || appName,
        provider,
        usage: appUsage,
        features: featureLine(appUsage),
      }))
    )
    .sort((a, b) => a.appId.localeCompare(b.appId) || a.provider.localeCompare(b.provider));

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h6">Usage Statistics</Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={onResetStats}
            startIcon={<DeleteSweepIcon />}
            color="error"
          >
            Reset Stats
          </Button>
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
      </CardContent>
    </Card>
  );
}
