import React from 'react';
import { useQuery } from '@apollo/client';
import { Box, Skeleton } from '@mui/material';
import EditorialCard from '../EditorialCard';
import CountUp from '../CountUp';
import { DASH_BUJO_SUMMARY } from '../../graphql/queries';
import { tokens } from '../../theme';

export default function BujoWidget({ delay = 0 }) {
  const today = new Date().toISOString().split('T')[0];
  const { data, loading, error } = useQuery(DASH_BUJO_SUMMARY, {
    variables: { date: today },
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <EditorialCard index="01" dept="BujoGeek" kicker="Tasks & events" delay={delay}>
        <Skeleton variant="rectangular" height={72} sx={{ mb: 2 }} />
        <Skeleton variant="text" width="60%" />
      </EditorialCard>
    );
  }

  if (error || !data?.dashBujoSummary) {
    return (
      <EditorialCard index="01" dept="BujoGeek" kicker="Tasks & events" delay={delay}>
        <Box sx={{ fontFamily: tokens.fontItalic, fontStyle: 'italic', color: tokens.boneFaint, fontSize: '1.05rem' }}>
          Desk is quiet. Department unreachable.
        </Box>
      </EditorialCard>
    );
  }

  const s = data.dashBujoSummary;
  const pct =
    s.totalTasks > 0 ? Math.round((s.completedToday / s.totalTasks) * 100) : 0;

  return (
    <EditorialCard
      index="01"
      dept="BujoGeek"
      kicker="Tasks &amp; events"
      href="https://bujogeek.clintgeek.com"
      delay={delay}
      meta={
        <>
          <span>{s.openTasks} open · {s.completedToday} closed</span>
          <span style={{ color: tokens.brass }}>{pct}% today</span>
        </>
      }
    >
      {/* Hero numeral */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 1 }}>
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
          <CountUp value={s.completedToday} />
        </Box>
        <Box
          sx={{
            fontFamily: tokens.fontItalic,
            fontStyle: 'italic',
            fontSize: '1.5rem',
            color: tokens.boneFaint,
          }}>
          of {s.totalTasks}
        </Box>
      </Box>

      <Box
        sx={{
          fontFamily: tokens.fontDisplay,
          fontSize: '0.85rem',
          color: tokens.boneDim,
          fontStyle: 'italic',
          mb: 2,
        }}
      >
        tasks struck through today
      </Box>

      {s.upcomingEvents?.length > 0 && (
        <Box sx={{ mt: 'auto' }}>
          <Box
            sx={{
              fontFamily: tokens.fontMono,
              fontSize: '0.52rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: tokens.boneFaint,
              mb: 1,
            }}
          >
            ── Upcoming
          </Box>
          {s.upcomingEvents.slice(0, 3).map((evt, i) => (
            <Box
              key={evt.id}
              sx={{
                display: 'flex',
                gap: 1.25,
                alignItems: 'baseline',
                mb: 0.5,
                fontFamily: tokens.fontDisplay,
                fontSize: '0.88rem',
                color: tokens.boneDim,
                '&:hover': { color: tokens.bone },
              }}
            >
              <Box
                sx={{
                  fontFamily: tokens.fontMono,
                  fontSize: '0.55rem',
                  color: tokens.brass,
                  minWidth: '1.5em',
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </Box>
              <Box sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {evt.content}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </EditorialCard>
  );
}
