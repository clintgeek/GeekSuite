/**
 * UsagePanel — panel 2: what it cost, and what it is allowed to cost.
 *
 * This is the old Usage & Cost tab with the one line it was missing at the
 * top. `AISpend` is the ledger (Phase 2), so the month, the day and both caps
 * are one read from `GET /api/ai/status` — and that line, not the tables, is
 * what a monthly visit is actually for.
 *
 * The plan's original target number — "the status page shows dollars left of
 * the $10, and the number barely moves" — turned out not to be computable.
 * `spend.monthUsd` is a strict calendar-month sum that resets every month;
 * the $10 named in `DOCS/ARCHIVE/AIGEEK_ELEVATION_PLAN.md` is a **one-time**
 * OpenRouter credit purchase, a lifetime balance with no field anywhere
 * tracking cumulative spend against it. The earlier version of this line read
 * "$1.76 of the $10", which is arithmetically a monthly ratio and reads as
 * "$8.24 left this month" — reassuring at any balance, because nothing behind
 * it can go down as the real credit is actually spent (2026-09-19, review
 * §1.6). Rather than fabricate a running-balance figure no data source
 * supports, the line now states the month's spend on its own and leans on the
 * numbers the server actually enforces in real time: the per-day and
 * per-call caps. Those are the true ceilings a call can hit today; the $10
 * is a separate, slower-moving fact called out below the line instead.
 *
 * Two Phase 3 changes below the line. Each feature row now carries the app's
 * `dailyCap` next to its count, because a count with no ceiling next to it
 * cannot tell you whether an app is near one. And "Reset stats" moved to the
 * bottom, behind the same confirm: it was a top-right error-coloured button
 * on a panel you open to *read*, which is a destructive action sitting where
 * the eye lands first.
 *
 * There used to be two tables here. "Provider Usage" carried six columns and
 * "App Usage Breakdown" carried seven, five of them the same five numbers off
 * the same `stats.providerUsage` object — the second table *is* the first one,
 * disaggregated. Reading both meant reading every number twice and doing the
 * addition yourself to check they agreed, which they always did.
 *
 * So the app table stays, because it is strictly the more informative of the
 * two, and the provider totals became lines above it (2026-09-15). A line per
 * provider still answers "which provider am I actually on" at a glance, and it
 * keeps a provider visible even when it has no app rows behind it — which the
 * app table alone would silently drop.
 *
 * Below `md` the remaining table becomes a card list. Seven columns do not
 * survive a 390px viewport: the cells collapse to roughly 40px and every
 * number wraps mid-digit. MOBILE_UI_PLAN §2 makes this a shared rule ("below
 * md a table renders as a card or definition list") with the layout left to
 * the app. The table itself is unchanged at md and up.
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
  Tooltip,
  Typography,
} from '@mui/material';
import { DeleteSweep as DeleteSweepIcon } from '@mui/icons-material';
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';
import { formatCost, formatTokens, formatUsd, featureRows, normalizeAppId } from './format';

/**
 * The one-time OpenRouter credit purchase named in
 * `DOCS/ARCHIVE/AIGEEK_ELEVATION_PLAN.md` (D1). It is **not** a monthly
 * allowance and nothing in `status.spend` tracks the running balance against
 * it, so this is quoted for context in a caption below the spend line — never
 * as a denominator next to a monthly figure. See the file header (review
 * §1.6) for why that framing was wrong.
 */
const ONE_TIME_CREDIT_USD = 10;

/**
 * The spend line.
 *
 * Rendered from `status.spend` and nothing else — no client-side arithmetic
 * over the usage tables, which count *session* calls (`aiService` resets them
 * on restart) and would disagree with the ledger by however long ago the last
 * deploy was.
 *
 * No ratio against the $10 credit: see the file header. What *is* shown is
 * the pair of ceilings the server enforces on every paid call right now —
 * `AI_PAID_PER_DAY_USD` / `AI_PAID_PER_CALL_USD` in `aiRoute.js` — which are
 * both smaller than the credit and the numbers a call can actually hit today.
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
    <>
      <Typography variant="body1" sx={{ fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word' }}>
        <Box component="span" sx={{ fontWeight: 600 }}>
          This month: {formatUsd(spend.monthUsd)}
        </Box>
        {' · '}today {formatUsd(spend.todayUsd)}
        {' · '}caps {formatUsd(spend.capPerDayUsd)}/day, {formatUsd(spend.capPerCallUsd)}/call
        {typeof spend.paidCallsMonth === 'number' && (
          <>{' · '}{spend.paidCallsMonth.toLocaleString()} paid call{spend.paidCallsMonth === 1 ? '' : 's'}</>
        )}
      </Typography>
      <Typography variant="caption" color="text.muted" sx={{ display: 'block', fontSize: 12, mt: 0.5 }}>
        The ${ONE_TIME_CREDIT_USD} OpenRouter credit was a one-time purchase, not a monthly
        budget — nothing here tracks the running balance left against it. The caps above are
        what the server actually enforces.
      </Typography>
    </>
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

/**
 * The session counters, as one line rather than three cards.
 *
 * They used to be three outlined cards with `h4` numbers and accent-coloured
 * labels — about 150px of chrome to say "1 call, 365 tokens, $0". On a console
 * that is read occasionally to answer "is anything wrong and what did it
 * cost", that is the least important number on the page wearing the most
 * furniture, directly above the month figure that actually matters.
 *
 * It borrows `SpendLine`'s rhythm deliberately: bold lead-in, ` · ` separators,
 * tabular numerals. That line is the best thing on this page, and two lines
 * that scan the same way read as one fact each rather than two designs.
 *
 * Taking the cards also retires their `color="primary"` labels, which is how
 * the accent stops meaning two things at once — it now appears only on figures
 * that cost money.
 */
function SessionLine({ stats }) {
  const calls = stats.totalCalls || 0;
  return (
    <Typography
      variant="body1"
      sx={{ fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word', mt: 3 }}
    >
      <Box component="span" sx={{ fontWeight: 600 }}>Since basegeek last restarted:</Box>
      {' '}{calls.toLocaleString()} call{calls === 1 ? '' : 's'}
      {' · '}{formatTokens(stats.totalTokens || 0)} tokens
      {' · '}{formatCost(stats.totalCost || 0)}
    </Typography>
  );
}

/**
 * The per-provider totals, one line each, in `SpendLine`'s rhythm.
 *
 * This replaces a six-column table whose every number also appeared in the app
 * table below it. A line keeps all five figures and costs a fifth of the
 * height, and — unlike the app table — it still shows a provider that has
 * usage but no app rows behind it.
 */
function ProviderTotals({ rows, labels }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
      {rows.map(([provider, usage]) => (
        <Typography
          key={provider}
          variant="body2"
          sx={{ fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word' }}
        >
          <Box
            component="span"
            sx={{ fontWeight: 600, ...(labels[provider] ? null : { textTransform: 'capitalize' }) }}
          >
            {labels[provider] || provider}
          </Box>
          {' '}{(usage.calls || 0).toLocaleString()} call{usage.calls === 1 ? '' : 's'}
          {' ('}
          <Box component="span" sx={{ color: 'success.main' }}>{usage.freeCalls || 0} free</Box>
          {' · '}
          <Box component="span" sx={{ color: 'warning.main' }}>{usage.paidCalls || 0} paid</Box>
          {') · '}{formatTokens(usage.tokens || 0)} tokens
          {' · '}{formatCost(usage.cost || 0)}
        </Typography>
      ))}
    </Box>
  );
}

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
  providerLabels,
  isCompact,
  onRetry,
  onResetStats,
}) {
  const providerUsage = stats.providerUsage || {};
  const providerRows = Object.entries(providerUsage);
  // The vendors' own spelling, same source the Providers block reads. Without
  // it `capitalize` renders "Openrouter" and "Llmgateway".
  const labels = providerLabels || {};

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

        {/*
          * `aiService.sessionStats` is an IN-PROCESS counter that starts at
          * zero every time basegeek restarts — which is every deploy touching
          * it. Without the period attached it contradicted the month figure
          * one line above: on 2026-09-15 this page read "122 paid calls" and
          * "Total Calls 1" simultaneously, both correct, neither labelled.
          */}
        <SessionLine stats={stats} />

        <Typography variant="h6" sx={{ mt: 3, mb: 0.5 }}>By provider</Typography>

        {providerRows.length === 0 ? (
          <GeekEmptyState
            compact
            title="No usage recorded yet"
            description="Provider rows appear once an app makes its first call through aiGeek."
          />
        ) : (
          <ProviderTotals rows={providerRows} labels={labels} />
        )}

        {appRows.length > 0 && (
          <>
            <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>By app</Typography>

            {isCompact ? (
              <UsageCardList
                rows={appRows.map(row => ({
                  key: row.key,
                  title: row.appId,
                  subtitle: labels[row.provider] || row.provider,
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
                          {/*
                            * "brief x1 / default" is dense to the point of
                            * being a cipher on first read — the shape is
                            * documented at `featureLineWithCaps` and nowhere
                            * the reader can see it. The tooltip is the cheapest
                            * place to put the key without spending a row on it.
                            */}
                          {row.features && (
                            <Tooltip title="feature × calls today / daily cap" arrow placement="bottom-start">
                              <Typography
                                variant="caption"
                                color="text.muted"
                                sx={{ fontSize: 12, cursor: 'help', textDecorationStyle: 'dotted' }}
                              >
                                {row.features}
                              </Typography>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell sx={labels[row.provider] ? undefined : { textTransform: 'capitalize' }}>
                          {labels[row.provider] || row.provider}
                        </TableCell>
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
