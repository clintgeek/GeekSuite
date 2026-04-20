import React from 'react';
import { useQuery } from '@apollo/client';
import { Box, LinearProgress, Skeleton, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import LedgerCard from '../LedgerCard';
import CountUp from '../CountUp';
import { DASH_BUJO_SUMMARY } from '../../graphql/queries';

const DOMAIN = 'bujogeek';

export default function BujoWidget() {
  const theme = useTheme();
  const domainColor = theme.palette.domains[DOMAIN];
  const today = new Date().toISOString().split('T')[0];

  const { data, loading, error } = useQuery(DASH_BUJO_SUMMARY, {
    variables: { date: today },
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <LedgerCard domain={DOMAIN} title="Bujo" loading />
    );
  }

  if (error || !data?.dashBujoSummary) {
    return (
      <LedgerCard
        domain={DOMAIN}
        title="Bujo"
        action={{ label: 'open →', href: 'https://bujogeek.clintgeek.com' }}
      >
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          couldn't load
        </Typography>
        <Box
          component="a"
          href="https://bujogeek.clintgeek.com"
          target="_blank"
          rel="noreferrer"
          sx={{
            display: 'block',
            mt: 0.5,
            fontFamily: theme.typography.fontFamilyMono,
            fontSize: '0.6875rem',
            color: 'text.secondary',
            textDecoration: 'none',
            '&:hover': { color: 'text.primary' },
          }}
        >
          open bujogeek →
        </Box>
      </LedgerCard>
    );
  }

  const s = data.dashBujoSummary;
  const pct = s.totalTasks > 0 ? Math.round((s.completedToday / s.totalTasks) * 100) : 0;

  // 7-point trend for header: completed tasks today vs. open (compact signal)
  // We don't have historical data in this query, so action slot is more useful.
  return (
    <LedgerCard
      domain={DOMAIN}
      title="Bujo"
      action={{ label: 'open →', href: 'https://bujogeek.clintgeek.com' }}
    >
      {/* Hero: completed / total */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: '10px' }}>
        <Box
          sx={{
            fontFamily: theme.typography.fontFamilyMono,
            fontSize: '2.25rem',
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: '-0.01em',
            fontVariantNumeric: 'tabular-nums',
            color: 'text.primary',
          }}
        >
          <CountUp value={s.completedToday} />
        </Box>
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', fontSize: '0.875rem' }}
        >
          / {s.totalTasks}
        </Typography>
      </Box>

      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: '10px' }}>
        tasks completed today
      </Typography>

      {/* Completion progress bar */}
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          mb: '16px',
          '& .MuiLinearProgress-bar': {
            backgroundColor: domainColor,
          },
        }}
      />

      {/* % label */}
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: '16px' }}>
        {pct}% · {s.openTasks} open
      </Typography>

      {/* Upcoming events */}
      {s.upcomingEvents?.length > 0 && (
        <Box sx={{ mt: 'auto' }}>
          <Typography
            variant="h6"
            sx={{ color: 'text.disabled', mb: '8px' }}
          >
            upcoming
          </Typography>
          {s.upcomingEvents.slice(0, 3).map((evt, i) => (
            <Box key={evt.id}>
              {i > 0 && (
                <Box sx={{ height: '1px', backgroundColor: 'divider', my: '6px' }} />
              )}
              <Box sx={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
                {evt.date && (
                  <Typography
                    variant="caption"
                    sx={{ color: domainColor, flexShrink: 0 }}
                  >
                    {evt.date.slice(5)}
                  </Typography>
                )}
                <Typography
                  variant="body2"
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'text.primary',
                    flex: 1,
                  }}
                >
                  {evt.content}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {!s.upcomingEvents?.length && s.totalTasks === 0 && (
        <Box sx={{ mt: 'auto' }}>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
            no data yet —{' '}
            <Box
              component="a"
              href="https://bujogeek.clintgeek.com"
              target="_blank"
              rel="noreferrer"
              sx={{
                color: 'text.secondary',
                textDecoration: 'none',
                fontFamily: theme.typography.fontFamilyMono,
                fontSize: '0.75rem',
                '&:hover': { color: 'text.primary' },
              }}
            >
              add a task →
            </Box>
          </Typography>
        </Box>
      )}
    </LedgerCard>
  );
}
