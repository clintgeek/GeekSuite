import { Card, CardContent, Box, Typography } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';

export default function StatCard({
  icon: IconComponent,
  label,
  value,
  unit = '',
  trend = null,
  trendValue = null,
  color = '#0D9488',
  showLabel = true,
}) {
  const theme = useTheme();
  const resolveColor = (c) => {
    if (!c) return theme.palette.primary.main;
    if (c.startsWith('#') || c.startsWith('rgb')) return c;
    const parts = c.replace('theme.palette.', '').split('.');
    let resolved = theme.palette;
    for (const p of parts) { resolved = resolved?.[p]; }
    return typeof resolved === 'string' ? resolved : theme.palette.primary.main;
  };
  const baseColor = resolveColor(color);
  const iconBg = alpha(baseColor, theme.palette.mode === 'dark' ? 0.2 : 0.1);
  const showTrend = trend !== null && trendValue !== null;
  const isPositive = trend === 'up';

  return (
    <Card
      sx={{
        height: '100%',
        borderRadius: 2.5,
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: 'none',
        transition: 'border-color 0.2s ease',
        '&:hover': {
          borderColor: alpha(baseColor, 0.4),
        },
      }}
    >
      <CardContent
        sx={{
          px: 1.5,
          py: 1.25,
          '&:last-child': { pb: 1.25 },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        {/* Icon + label — small, secondary */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: 1,
              backgroundColor: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <IconComponent sx={{ fontSize: 14, color: baseColor }} />
          </Box>
          {showLabel && (
            <Typography
              sx={{
                color: theme.palette.text.secondary,
                fontWeight: 600,
                fontSize: '0.625rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                lineHeight: 1,
              }}
            >
              {label}
            </Typography>
          )}
        </Box>

        {/* Value — dominant */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
          <Typography
            sx={{
              fontWeight: 800,
              color: theme.palette.text.primary,
              fontSize: { xs: '1.75rem', sm: '2rem' },
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}
          >
            {value}
          </Typography>
          {unit && (
            <Typography
              sx={{
                color: theme.palette.text.secondary,
                fontWeight: 500,
                fontSize: '0.625rem',
              }}
            >
              {unit}
            </Typography>
          )}
        </Box>

        {/* Trend */}
        {showTrend && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.25 }}>
            {isPositive ? (
              <TrendingUp sx={{ fontSize: 12, color: theme.palette.success.main }} />
            ) : (
              <TrendingDown sx={{ fontSize: 12, color: theme.palette.error.main }} />
            )}
            <Typography
              sx={{
                color: isPositive ? theme.palette.success.main : theme.palette.error.main,
                fontWeight: 600,
                fontSize: '0.625rem',
              }}
            >
              {trendValue}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
