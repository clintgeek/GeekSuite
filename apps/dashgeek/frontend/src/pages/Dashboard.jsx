import React from 'react';
import { Box, Typography, Grid } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useAuthStore from '../store/authStore';
import Brand from '../components/Brand';
import StatusLine from '../components/StatusLine';

import BujoWidget from '../components/widgets/BujoWidget';
import NotesWidget from '../components/widgets/NotesWidget';
import BooksWidget from '../components/widgets/BooksWidget';
import NutritionWidget from '../components/widgets/NutritionWidget';
import WeightWidget from '../components/widgets/WeightWidget';
import FlockWidget from '../components/widgets/FlockWidget';

export default function Dashboard() {
  const { logout } = useAuthStore();
  const theme = useTheme();

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
      <Brand onLogout={logout} />

      <Box
        component="main"
        sx={{
          px: { xs: 2, sm: 3, md: 4 },
          pt: { xs: 3, md: 4 },
          pb: { xs: 6, md: 8 },
          maxWidth: 1280,
          mx: 'auto',
        }}
      >
        {/* Status line — date + domain pills */}
        <StatusLine pills={[]} />

        {/* Hairline rule between status and grid */}
        <Box
          sx={{
            height: '1px',
            backgroundColor: 'divider',
            mt: { xs: 1.5, md: 2 },
            mb: { xs: 3, md: 4 },
          }}
        />

        {/* Widget grid — 1 col xs, 2 cols sm, 3 cols md+ */}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={4}>
            <BujoWidget />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <NutritionWidget />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <FlockWidget />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <WeightWidget />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <NotesWidget />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <BooksWidget />
          </Grid>
        </Grid>

        {/* Compact colophon */}
        <Box
          component="footer"
          sx={{
            mt: { xs: 6, md: 8 },
            pt: 3,
            borderTop: `1px solid ${theme.palette.divider}`,
            textAlign: 'center',
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: 'text.disabled', letterSpacing: '0.10em', textTransform: 'uppercase' }}
          >
            DASHGEEK · compiled from gateway summaries
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
