import { Box, IconButton, Avatar, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Menu as MenuIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../ThemeToggle';
import { TOPBAR_HEIGHT } from '../../utils/constants';

const TopBar = ({ onMenuClick }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user } = useAuth();

  return (
    <Box
      sx={{
        height: TOPBAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        px: { xs: 2, md: 3 },
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
        flexShrink: 0,
      }}
    >
      {/* Mobile hamburger */}
      {isMobile && (
        <IconButton
          onClick={onMenuClick}
          sx={{ mr: 1, color: theme.palette.text.primary }}
          aria-label="Open navigation menu"
        >
          <MenuIcon size={22} />
        </IconButton>
      )}

      {/* Spacer */}
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
              backgroundColor: theme.palette.primary.main,
              fontSize: '0.8125rem',
              fontWeight: 600,
              display: { xs: 'none', md: 'flex' },
            }}
          >
            {user?.email?.[0]?.toUpperCase() || 'U'}
          </Avatar>
        )}
      </Box>
    </Box>
  );
};

export default TopBar;
