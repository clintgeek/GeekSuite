import React from 'react';
import { useQuery } from '@apollo/client';
import { Box, Skeleton } from '@mui/material';
import EditorialCard from '../EditorialCard';
import CountUp from '../CountUp';
import { DASH_FLOCK_STATUS } from '../../graphql/queries';
import { tokens } from '../../theme';

export default function FlockWidget({ delay = 0 }) {
  const { data, loading, error } = useQuery(DASH_FLOCK_STATUS, {
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <EditorialCard index="03" dept="FlockGeek" kicker="The aviary" delay={delay}>
        <Skeleton variant="rectangular" height={72} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={40} />
      </EditorialCard>
    );
  }

  if (error || !data?.dashFlockStatus) {
    return (
      <EditorialCard index="03" dept="FlockGeek" kicker="The aviary" delay={delay}>
        <Box sx={{ fontFamily: tokens.fontItalic, fontStyle: 'italic', color: tokens.boneFaint }}>
          The coop is silent. No dispatch.
        </Box>
      </EditorialCard>
    );
  }

  const f = data.dashFlockStatus;

  return (
    <EditorialCard
      index="03"
      dept="FlockGeek"
      kicker="The aviary"
      href="https://flockgeek.clintgeek.com"
      delay={delay}
      meta={
        <>
          <span>{f.weekEggs || 0} eggs this week</span>
          <span style={{ color: tokens.brass }}>
            {f.activePairings || 0} pairings
            {f.activeHatches > 0 ? ` · ${f.activeHatches} hatching` : ''}
          </span>
        </>
      }
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 1px 1fr',
          gap: 2,
          alignItems: 'end',
          mb: 2,
        }}
      >
        <Box>
          <Box
            sx={{
              fontFamily: tokens.fontDisplay,
              fontSize: { xs: '3.5rem', md: '4.5rem' },
              lineHeight: 0.9,
              fontWeight: 300,
              color: tokens.bone,
              letterSpacing: '-0.04em',
            }}
          >
            <CountUp value={f.activeBirds || 0} />
          </Box>
          <Box
            sx={{
              fontFamily: tokens.fontItalic,
              fontStyle: 'italic',
              color: tokens.boneDim,
              mt: 0.5,
              fontSize: '0.88rem',
            }}
          >
            birds in residence
          </Box>
        </Box>
        <Box sx={{ height: '70%', background: tokens.rule, alignSelf: 'center' }} />
        <Box>
          <Box
            sx={{
              fontFamily: tokens.fontDisplay,
              fontSize: { xs: '3.5rem', md: '4.5rem' },
              lineHeight: 0.9,
              fontWeight: 300,
              color: tokens.brass,
              letterSpacing: '-0.04em',
            }}
          >
            <CountUp value={f.todayEggs || 0} />
          </Box>
          <Box
            sx={{
              fontFamily: tokens.fontItalic,
              fontStyle: 'italic',
              color: tokens.boneDim,
              mt: 0.5,
              fontSize: '0.88rem',
            }}
          >
            eggs collected today
          </Box>
        </Box>
      </Box>
    </EditorialCard>
  );
}
