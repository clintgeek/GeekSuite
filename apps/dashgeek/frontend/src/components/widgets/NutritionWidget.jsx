import React from 'react';
import { useQuery } from '@apollo/client';
import { Box, LinearProgress, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import LedgerCard from '../LedgerCard';
import CountUp from '../CountUp';
import { DASH_NUTRITION_SUMMARY } from '../../graphql/queries';

const DOMAIN = 'fitnessgeek';

function MacroCell({ label, value, unit = 'g', theme }) {
  return (
    <Box sx={{ flex: 1, textAlign: 'center' }}>
      <Box
        sx={{
          fontFamily: theme.typography.fontFamilyMono,
          fontWeight: 500,
          fontSize: '1.25rem',
          lineHeight: 1,
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
          color: 'text.primary',
          mb: '4px',
        }}
      >
        <CountUp value={Math.round(value || 0)} />
        <Box
          component="span"
          sx={{
            fontFamily: theme.typography.fontFamilyMono,
            fontSize: '0.6875rem',
            color: 'text.secondary',
            ml: '2px',
          }}
        >
          {unit}
        </Box>
      </Box>
      <Typography variant="caption" sx={{ color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.6rem' }}>
        {label}
      </Typography>
    </Box>
  );
}

export default function NutritionWidget() {
  const theme = useTheme();
  const domainColor = theme.palette.domains[DOMAIN];
  const today = new Date().toISOString().split('T')[0];

  const { data, loading, error } = useQuery(DASH_NUTRITION_SUMMARY, {
    variables: { date: today },
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <LedgerCard domain={DOMAIN} title="Nutrition" loading />
    );
  }

  if (error || !data?.dashNutritionSummary) {
    return (
      <LedgerCard
        domain={DOMAIN}
        title="Nutrition"
        action={{ label: 'open →', href: 'https://fitnessgeek.clintgeek.com' }}
      >
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          couldn't load
        </Typography>
        <Box
          component="a"
          href="https://fitnessgeek.clintgeek.com"
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
          open fitnessgeek →
        </Box>
      </LedgerCard>
    );
  }

  const n = data.dashNutritionSummary;
  const calPct = n.calorieGoal
    ? Math.min(100, Math.round((n.calories / n.calorieGoal) * 100))
    : null;
  const overGoal = calPct !== null && n.calories > n.calorieGoal;
  const nearGoal = calPct !== null && calPct >= 85 && !overGoal;

  // Ration bar color: success = under, warning = near, error = way over (>115%)
  const wayOver = n.calorieGoal && n.calories > n.calorieGoal * 1.15;
  let rationBarColor = theme.palette.success.main;
  if (wayOver) rationBarColor = theme.palette.error.main;
  else if (overGoal || nearGoal) rationBarColor = theme.palette.warning.main;

  // No historical trend data from this query; use action slot to link out
  return (
    <LedgerCard
      domain={DOMAIN}
      title="Nutrition"
      action={{ label: 'open →', href: 'https://fitnessgeek.clintgeek.com' }}
    >
      {/* Calorie hero */}
      <Box sx={{ mb: '6px' }}>
        <Box
          sx={{
            fontFamily: theme.typography.fontFamilyMono,
            fontWeight: 500,
            fontSize: '2.25rem',
            lineHeight: 1,
            letterSpacing: '-0.01em',
            fontVariantNumeric: 'tabular-nums',
            color: 'text.primary',
          }}
        >
          <CountUp value={Math.round(n.calories || 0)} />
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {n.calorieGoal ? `cal · goal ${Math.round(n.calorieGoal)}` : 'cal today'}
        </Typography>
      </Box>

      {/* Ration bar */}
      {calPct !== null && (
        <Box sx={{ mb: '16px' }}>
          <LinearProgress
            variant="determinate"
            value={calPct}
            sx={{
              mb: '4px',
              '& .MuiLinearProgress-bar': {
                backgroundColor: rationBarColor,
              },
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {calPct}% of goal
            </Typography>
            {n.mealsLogged > 0 && (
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                {n.mealsLogged} {n.mealsLogged === 1 ? 'meal' : 'meals'}
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {/* Macros 3-column table */}
      <Box
        sx={{
          display: 'flex',
          mt: 'auto',
          pt: '12px',
          borderTop: `1px solid ${theme.palette.divider}`,
        }}
      >
        <MacroCell label="Protein" value={n.protein} theme={theme} />
        <Box sx={{ width: '1px', backgroundColor: 'divider', my: '-2px' }} />
        <MacroCell label="Carbs" value={n.carbs} theme={theme} />
        <Box sx={{ width: '1px', backgroundColor: 'divider', my: '-2px' }} />
        <MacroCell label="Fat" value={n.fat} theme={theme} />
      </Box>

      {/* Empty state fallback */}
      {!n.calories && !n.mealsLogged && (
        <Box sx={{ mt: '12px' }}>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
            no data yet —{' '}
            <Box
              component="a"
              href="https://fitnessgeek.clintgeek.com"
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
              log nutrition →
            </Box>
          </Typography>
        </Box>
      )}
    </LedgerCard>
  );
}
