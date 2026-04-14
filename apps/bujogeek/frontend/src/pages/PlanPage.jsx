import { Box, Typography, useTheme } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import WeeklySpread from '../components/plan/WeeklySpread';
import MonthlyCalendar from '../components/plan/MonthlyCalendar';
import BacklogList from '../components/plan/BacklogList';
import { colors } from '../theme/colors';

const SUBVIEWS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'backlog', label: 'Backlog' },
];

/**
 * PlanPage — container for the forward-looking views. Tabs are rendered as
 * an editorial segmented control with Fraunces serif labels and a Framer
 * Motion underline indicator that glides between tabs, not a hard pill swap.
 */
const PlanPage = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { subview } = useParams();
  const navigate = useNavigate();
  const currentView =
    SUBVIEWS.find((v) => v.value === subview)?.value || 'weekly';

  const handleTabClick = (value) => {
    if (value !== currentView) navigate(`/plan/${value}`);
  };

  const mutedInk = isDark ? 'rgba(255,255,255,0.5)' : colors.ink[400];
  const captionInk = isDark ? 'rgba(255,255,255,0.32)' : colors.ink[300];
  const primaryInk = theme.palette.text.primary;
  const hairlineRule = `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : colors.ink[200]}`;

  return (
    <Box
      sx={{
        maxWidth: 960,
        mx: 'auto',
        px: { xs: 2, sm: 3 },
        pt: { xs: 2.5, sm: 3.5 },
        pb: 4,
      }}
    >
      {/* ─── Page masthead ─────────────────────────────────────── */}
      <Box sx={{ mb: { xs: 2.5, sm: 3 } }}>
        <Typography
          sx={{
            fontFamily: '"Fraunces", serif',
            fontSize: '0.8125rem',
            fontStyle: 'italic',
            fontWeight: 400,
            color: captionInk,
            letterSpacing: '0.01em',
            mb: 0.5,
          }}
        >
          The road ahead
        </Typography>
        <Typography
          component="h1"
          sx={{
            fontFamily: '"Fraunces", serif',
            fontSize: { xs: '1.75rem', sm: '2.25rem' },
            fontWeight: 500,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            color: primaryInk,
            fontOpticalSizing: 'auto',
          }}
        >
          Plan
        </Typography>
      </Box>

      {/* ─── Editorial segmented tabs ──────────────────────────── */}
      <Box
        role="tablist"
        aria-label="Plan view"
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          gap: { xs: 2.5, sm: 3.5 },
          borderBottom: hairlineRule,
          mb: { xs: 3, sm: 3.5 },
          px: 0.5,
        }}
      >
        {SUBVIEWS.map((tab) => {
          const active = currentView === tab.value;
          return (
            <Box
              key={tab.value}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => handleTabClick(tab.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleTabClick(tab.value);
                }
              }}
              sx={{
                position: 'relative',
                py: 1.25,
                cursor: 'pointer',
                transition: 'color 200ms ease',
                '&:hover': {
                  color: isDark ? 'rgba(255,255,255,0.85)' : colors.ink[800],
                },
                '&:focus-visible': {
                  outline: `2px solid ${colors.primary[400]}`,
                  outlineOffset: 4,
                  borderRadius: 2,
                },
              }}
            >
              <Typography
                sx={{
                  fontFamily: '"Fraunces", serif',
                  fontSize: { xs: '1rem', sm: '1.125rem' },
                  fontWeight: active ? 500 : 400,
                  color: active ? primaryInk : mutedInk,
                  letterSpacing: '-0.005em',
                  transition: 'color 200ms ease, font-weight 200ms ease',
                  lineHeight: 1.2,
                }}
              >
                {tab.label}
              </Typography>

              {/* Active underline — animated with Framer Motion shared layoutId */}
              {active && (
                <motion.div
                  layoutId="plan-tab-underline"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: -1,
                    height: 2,
                    backgroundColor: colors.primary[500],
                    borderRadius: 1,
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
            </Box>
          );
        })}
      </Box>

      {/* ─── Sub-view content — crossfade between tabs ─────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentView}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          {currentView === 'weekly' && <WeeklySpread />}
          {currentView === 'monthly' && <MonthlyCalendar />}
          {currentView === 'backlog' && <BacklogList />}
        </motion.div>
      </AnimatePresence>
    </Box>
  );
};

export default PlanPage;
