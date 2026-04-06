import React from 'react';
import { useQuery } from '@apollo/client';
import { Box, Skeleton } from '@mui/material';
import EditorialCard from '../EditorialCard';
import CountUp from '../CountUp';
import { DASH_NUTRITION_SUMMARY } from '../../graphql/queries';
import { tokens } from '../../theme';

function Macro({ label, value, unit = 'g' }) {
  return (
    <Box sx={{ flex: 1 }}>
      <Box
        sx={{
          fontFamily: tokens.fontDisplay,
          fontSize: '1.45rem',
          fontWeight: 400,
          color: tokens.bone,
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        <CountUp value={Math.round(value || 0)} />
        <Box
          component="span"
          sx={{
            fontFamily: tokens.fontItalic,
            fontStyle: 'italic',
            fontSize: '0.85rem',
            color: tokens.boneFaint,
            ml: 0.4,
          }}
        >
          {unit}
        </Box>
      </Box>
      <Box
        sx={{
          fontFamily: tokens.fontMono,
          fontSize: '0.5rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: tokens.boneFaint,
          mt: 0.5,
        }}
      >
        {label}
      </Box>
    </Box>
  );
}

export default function NutritionWidget({ delay = 0 }) {
  const today = new Date().toISOString().split('T')[0];
  const { data, loading, error } = useQuery(DASH_NUTRITION_SUMMARY, {
    variables: { date: today },
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <EditorialCard index="02" dept="FitnessGeek" kicker="Today’s table" delay={delay}>
        <Skeleton variant="rectangular" height={72} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={40} />
      </EditorialCard>
    );
  }

  if (error || !data?.dashNutritionSummary) {
    return (
      <EditorialCard index="02" dept="FitnessGeek" kicker="Today’s table" delay={delay}>
        <Box sx={{ fontFamily: tokens.fontItalic, fontStyle: 'italic', color: tokens.boneFaint }}>
          Kitchen is closed. Service unreachable.
        </Box>
      </EditorialCard>
    );
  }

  const n = data.dashNutritionSummary;
  const calPct = n.calorieGoal
    ? Math.min(100, Math.round((n.calories / n.calorieGoal) * 100))
    : null;
  const over = calPct !== null && n.calories > n.calorieGoal;

  return (
    <EditorialCard
      index="02"
      dept="FitnessGeek"
      kicker="Today’s table"
      href="https://fitnessgeek.clintgeek.com"
      delay={delay}
      meta={
        <>
          <span>{n.mealsLogged || 0} courses logged</span>
          {calPct !== null && (
            <span style={{ color: over ? tokens.oxblood : tokens.brass }}>
              {calPct}% of ration
            </span>
          )}
        </>
      }
    >
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
          <CountUp value={Math.round(n.calories || 0)} />
        </Box>
        <Box sx={{ fontFamily: tokens.fontItalic, fontStyle: 'italic', fontSize: '1.2rem', color: tokens.boneFaint }}>
          {n.calorieGoal ? `/ ${Math.round(n.calorieGoal)}` : 'cal'}
        </Box>
      </Box>
      <Box
        sx={{
          fontFamily: tokens.fontDisplay,
          fontStyle: 'italic',
          fontSize: '0.85rem',
          color: tokens.boneDim,
          mb: 2,
        }}
      >
        calories against the daily ration
      </Box>

      {/* Ration bar — thin brass */}
      {calPct !== null && (
        <Box sx={{ position: 'relative', height: '2px', background: tokens.boneGhost, mb: 2.5 }}>
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${calPct}%`,
              background: over ? tokens.oxblood : tokens.brass,
              transition: 'width 900ms var(--ease)',
            }}
          />
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 2, mt: 'auto' }}>
        <Macro label="Protein" value={n.protein} />
        <Box sx={{ width: '1px', background: tokens.rule }} />
        <Macro label="Carbs" value={n.carbs} />
        <Box sx={{ width: '1px', background: tokens.rule }} />
        <Macro label="Fat" value={n.fat} />
      </Box>
    </EditorialCard>
  );
}
