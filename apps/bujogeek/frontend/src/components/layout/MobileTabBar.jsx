import { useState } from 'react';
import { Box, Typography, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { CalendarCheck, ClipboardCheck, Calendar, Hash, MoreHorizontal, LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MOBILE_TAB_HEIGHT } from '../../utils/constants';
import { colors } from '../../theme/colors';

const tabs = [
  { label: 'Today', icon: CalendarCheck, path: '/today' },
  { label: 'Review', icon: ClipboardCheck, path: '/review' },
  { label: 'Plan', icon: Calendar, path: '/plan' },
  { label: 'Tags', icon: Hash, path: '/tags' },
  { label: 'More', icon: MoreHorizontal, path: null },
];

const MobileTabBar = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (path) => {
    if (!path) return false;
    if (path === '/plan') return location.pathname.startsWith('/plan');
    return location.pathname === path;
  };

  const handleTabClick = (tab) => {
    if (tab.path === null) {
      setMoreOpen(true);
    } else {
      navigate(tab.path);
    }
  };

  const handleLogout = () => {
    logout();
    setMoreOpen(false);
    navigate('/login');
  };

  return (
    <>
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: MOBILE_TAB_HEIGHT,
          backgroundColor: theme.palette.background.paper,
          borderTop: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 1200,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.path);
          return (
            <Box
              key={tab.label}
              onClick={() => handleTabClick(tab)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                py: 1,
                cursor: 'pointer',
                color: active ? colors.primary[500] : theme.palette.text.disabled,
                transition: 'color 0.15s ease',
                WebkitTapHighlightColor: 'transparent',
                '&:active': {
                  color: colors.primary[500],
                },
              }}
              role="button"
              tabIndex={0}
              aria-label={tab.label}
            >
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              <Typography
                sx={{
                  fontSize: '0.625rem',
                  fontWeight: active ? 600 : 400,
                  mt: 0.25,
                  lineHeight: 1,
                }}
              >
                {tab.label}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* More drawer */}
      <Drawer
        anchor="bottom"
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '50vh',
          },
        }}
      >
        <Box sx={{ px: 1, py: 1 }}>
          <Box
            sx={{
              width: 36,
              height: 4,
              backgroundColor: theme.palette.divider,
              borderRadius: 2,
              mx: 'auto',
              mb: 1,
            }}
          />
          <List>
            <ListItem disablePadding>
              <ListItemButton
                onClick={handleLogout}
                sx={{
                  borderRadius: '8px',
                  color: colors.status.error,
                  '&:hover': { backgroundColor: colors.status.errorBg },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
                  <LogOut size={20} />
                </ListItemIcon>
                <ListItemText primary="Logout" primaryTypographyProps={{ fontSize: '0.9375rem' }} />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
      </Drawer>
    </>
  );
};

export default MobileTabBar;
