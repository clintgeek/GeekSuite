import React from 'react';
import { useQuery } from '@apollo/client';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import LedgerCard from '../LedgerCard';
import CountUp from '../CountUp';
import { DASH_FLOCK_STATUS } from '../../graphql/queries';

const DOMAIN = 'flockgeek';

function StatCell({ value, label, domainColor, theme, borderRight, borderBottom }) {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        p: '12px 8px',
        borderRight: borderRight ? `1px solid ${theme.palette.divider}` : 'none',
        borderBottom: borderBottom ? `1px solid ${theme.palette.divider}` : 'none',
      }}
    >
      <Box
        sx={{
          fontFamily: theme.typography.fontFamilyMono,
          fontWeight: 500,
          fontSize: '1.75rem',
          lineHeight: 1,
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
          color: 'text.primary',
          mb: '6px',
        }}
      >
        <CountUp value={value || 0} />
      </Box>
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontSize: '0.6rem',
          textAlign: 'center',
          lineHeight: 1.3,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

export default function FlockWidget() {
  const theme = useTheme();
  const domainColor = theme.palette.domains[DOMAIN];

  const { data, loading, error } = useQuery(DASH_FLOCK_STATUS, {
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <LedgerCard domain={DOMAIN} title="Flock" loading />
    );
  }

  if (error || !data?.dashFlockStatus) {
    return (
      <LedgerCard
        domain={DOMAIN}
        title="Flock"
        action={{ label: 'open →', href: 'https://flockgeek.clintgeek.com' }}
      >
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          {error ? "couldn't load" : 'no data yet'}
          {' — '}
          <Box
            component="a"
            href="https://flockgeek.clintgeek.com"
            target="_blank"
            rel="noreferrer"
            sx={{
              color: 'text.secondary',
              fontFamily: theme.typography.fontFamilyMono,
              fontSize: '0.75rem',
              textDecoration: 'none',
              '&:hover': { color: 'text.primary' },
            }}
          >
            open flockgeek →
          </Box>
        </Typography>
      </LedgerCard>
    );
  }

  const f = data.dashFlockStatus;

  // Eggs this week as a 7-day trend proxy (we only have a single week total;
  // distribute evenly so the sparkline has a shape — action slot is more useful).
  // Using action slot since we lack per-day breakdown.

  return (
    <LedgerCard
      domain={DOMAIN}
      title="Flock"
      action={{ label: 'open →', href: 'https://flockgeek.clintgeek.com' }}
    >
      {/* 2×2 stat grid with hairline internal rules */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          flex: 1,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: '6px',
          overflow: 'hidden',
        }}
      >
        <StatCell
          value={f.activeBirds}
          label="Active Birds"
          domainColor={domainColor}
          theme={theme}
          borderRight
          borderBottom
        />
        <StatCell
          value={f.todayEggs}
          label="Eggs Today"
          domainColor={domainColor}
          theme={theme}
          borderBottom
        />
        <StatCell
          value={f.activePairings}
          label="Pairings"
          domainColor={domainColor}
          theme={theme}
          borderRight
        />
        <StatCell
          value={f.activeHatches}
          label="Hatches"
          domainColor={domainColor}
          theme={theme}
        />
      </Box>

      {/* Week summary footer */}
      {f.weekEggs > 0 && (
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: '10px',
            color: 'text.disabled',
            textAlign: 'right',
          }}
        >
          {f.weekEggs} eggs this week
        </Typography>
      )}
    </LedgerCard>
  );
}
