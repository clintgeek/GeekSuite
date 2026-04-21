import React from 'react';
import { Box, Typography } from '@mui/material';
import useAuthStore from '../store/authStore';
import Brand from '../components/Brand';
import SearchHero from '../components/SearchHero';

/**
 * /search — thin standalone wrapper around SearchHero so the
 * deep link continues to work. The primary home for cross-suite
 * search is Screen 2 (Suite), which uses the same component.
 */
export default function SearchPage() {
  const { logout } = useAuthStore();

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
      <Brand onLogout={logout} />

      <Box
        sx={{
          px: { xs: 2, sm: 3, md: 4 },
          pt: { xs: 3, md: 4 },
          pb: { xs: 6, md: 8 },
          maxWidth: 1280,
          mx: 'auto',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            py: { xs: 1.5, md: 2 },
            mb: { xs: 2, md: 3 },
          }}
        >
          <Typography variant="h6" sx={{ color: 'text.primary', lineHeight: 1 }}>
            SEARCH
          </Typography>
          <Box sx={{ flex: 1, height: '1px', backgroundColor: 'divider' }} />
        </Box>

        <SearchHero autoFocus maxResults={8} />
      </Box>
    </Box>
  );
}
