import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Button,
  Avatar,
  Tooltip,
  useTheme,
  alpha
} from '@mui/material';
import {
  Add as AddIcon,
  LibraryBooks as LibraryIcon,
} from '@mui/icons-material';
import { geekLayout } from '@geeksuite/ui';

const Header = ({ user, setActiveView, setAddBookOpen }) => {
  const theme = useTheme();

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
        color: theme.palette.text.primary,
        width: '100%'
      }}
    >
      <Toolbar sx={{ minHeight: `${geekLayout.topBarHeight}px !important`, px: { xs: 2, md: 3 } }}>
        <Box 
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', flexGrow: 1 }}
          onClick={() => setActiveView("library")}
        >
          <Typography
            variant="h6"
            sx={{
              fontWeight: 400,
              fontFamily: '"DM Serif Display", serif',
              fontSize: '1.25rem',
              letterSpacing: '-0.02em',
            }}
          >
            BookGeek
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setAddBookOpen(true)}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 2,
              bgcolor: 'primary.main',
              '&:hover': {
                bgcolor: 'primary.dark',
              }
            }}
          >
            Add book
          </Button>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}>
              {user.email || user.username}
            </Typography>
            <Avatar 
              sx={{ 
                width: 32, 
                height: 32, 
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                color: 'primary.main',
                fontSize: '0.875rem',
                fontWeight: 600,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
              }}
            >
              { (user.username || user.email)?.[0]?.toUpperCase() || 'U' }
            </Avatar>
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
