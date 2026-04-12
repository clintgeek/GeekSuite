import { Box, Typography, useTheme } from '@mui/material';
import TemplateList from '../components/templates/TemplateList';
import TemplateApplier from '../components/templates/TemplateApplier';
import TemplateFilters from '../components/templates/TemplateFilters';
import { TemplateProvider } from '../context/TemplateContext';
import useGlobalShortcuts from '../hooks/useGlobalShortcuts';
import { colors } from '../theme/colors';

/**
 * TemplatesPage — repeatable routines for daily/weekly/monthly planning.
 *
 * Editorial masthead matching the Plan and Review pages, wrapping the
 * existing template components (TemplateList, TemplateFilters, TemplateApplier)
 * which retain their own internal state via TemplateContext.
 */
const TemplatesPage = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  useGlobalShortcuts();

  const captionInk = isDark ? 'rgba(255,255,255,0.32)' : colors.ink[300];
  const primaryInk = theme.palette.text.primary;

  const handleTemplateApplied = (result) => {
    console.log('Template applied:', result);
  };

  return (
    <TemplateProvider>
      <Box
        sx={{
          maxWidth: 960,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          pt: { xs: 2.5, sm: 3.5 },
          pb: 4,
        }}
      >
        {/* ─── Editorial masthead ─────────────────────────────── */}
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
            Repeatable routines
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
            Templates
          </Typography>
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontSize: '0.8125rem',
              color: captionInk,
              mt: 0.75,
            }}
          >
            Create once, apply daily. Build your planning ritual.
          </Typography>
        </Box>

        {/* ─── Filters ────────────────────────────────────────── */}
        <Box sx={{ mb: 2 }}>
          <TemplateFilters />
        </Box>

        {/* ─── Template list ──────────────────────────────────── */}
        <TemplateList />

        {/* ─── Applier (modal-based) ──────────────────────────── */}
        <TemplateApplier onTemplateApplied={handleTemplateApplied} />
      </Box>
    </TemplateProvider>
  );
};

export default TemplatesPage;
