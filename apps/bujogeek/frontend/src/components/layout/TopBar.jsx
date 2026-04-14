import { Box, IconButton, Avatar, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Menu as MenuIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../ThemeToggle';
import { TOPBAR_HEIGHT } from '../../utils/constants';
import { colors } from '../../theme/colors';

/**
 * TopBar — minimal chrome bar. The editorial date headline lives on each
 * page's own masthead, not here. TopBar is the planner's binding stitching:
 * quiet, functional, present but never competing for attention.
 */
const TopBar = ({ onMenuClick }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();

  // Avatar letterform in Fraunces
  const initial = user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <Box
      sx={{
        height: TOPBAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        px: { xs: 2, md: 3 },
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px dotted ${isDark ? 'rgba(255,255,255,0.12)' : colors.ink[200]}`,
        flexShrink: 0,
      }}
    >
      {/* Mobile hamburger */}
      {isMobile && (
        <IconButton
          onClick={onMenuClick}
          sx={{
            mr: 1,
            color: theme.palette.text.primary,
            borderRadius: 2,
            '&:hover': {
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.ink[100],
            },
          }}
          aria-label="Open navigation menu"
        >
          <MenuIcon size={22} />
        </IconButton>
      )}

      <Box sx={{ flex: 1 }} />

      {/* Right actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <ThemeToggle />
        {user && (
          <Avatar
            sx={{
              width: 32,
              height: 32,
              ml: 0.5,
              backgroundColor: colors.primary[500],
              fontFamily: '"Fraunces", serif',
              fontSize: '0.9375rem',
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: '#fff',
              display: { xs: 'none', md: 'flex' },
              transition: 'transform 200ms ease',
              '&:hover': { transform: 'scale(1.06)' },
            }}
          >
            {initial}
          </Avatar>
        )}
      </Box>
    </Box>
  );
};

export default TopBar;
