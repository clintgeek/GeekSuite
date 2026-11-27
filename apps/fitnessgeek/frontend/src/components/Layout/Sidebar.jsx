/**
 * FitnessGeek sidebar — thin identity wrapper around the suite `GeekSidebar`.
 *
 * Structure (brand → grouped nav → user chip → Settings → Sign out) belongs
 * to the primitive; this file only supplies the chrome colours (chrome.js,
 * light or dark) and the rows (navConfig.jsx).
 *
 * `GeekShell nav={…}` decides whether this panel sits in the permanent 220px
 * column or inside the mobile drawer, so there is no `isMobile` / `onClose`
 * plumbing here.
 */
import { Box, Typography } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { GeekSidebar, geekLayout } from '@geeksuite/ui';
import { activeNavId, navSectionsFor } from './navConfig.jsx';
import { useTheme } from '@mui/material/styles';
import { chromeFor } from './chrome.js';

/** Brand block: a small rounded mark and the name. */
const Brand = ({ chrome }) => (
  <Box
    component={RouterLink}
    to="/dashboard"
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 2.5,
      px: 4,
      height: geekLayout.topBarHeight,
      textDecoration: 'none',
      color: 'inherit',
    }}
  >
    <Box
      aria-hidden
      sx={{
        width: 28,
        height: 28,
        borderRadius: '9px',
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {/* The same three-quarter ring as the app icon. */}
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeOpacity="0.35" strokeWidth="3" />
        <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="30.6 40.8" transform="rotate(-90 9 9)" />
      </svg>
    </Box>
    <Typography
      variant="h5"
      noWrap
      sx={{ fontWeight: 700, color: chrome.INK, fontSize: '1.125rem', letterSpacing: '-0.01em' }}
    >
      FitnessGeek
    </Typography>
  </Box>
);

const Sidebar = () => {
  const location = useLocation();
  const theme = useTheme();
  const chrome = chromeFor(theme.palette.mode);
  const { ACCENT, ACTIVE_BG, ACTIVE_INK, CHROME_BG, HOVER_BG, INK, MUTED } = chrome;

  return (
    <GeekSidebar
      brand={<Brand chrome={chrome} />}
      sections={navSectionsFor()}
      activeId={activeNavId(location.pathname)}
      // The list region scrolls on its own (brand pinned above it) if a short
      // window, or Larger text, still outgrows the column; a thin
      // scrollbar says so.
      sx={{
        bgcolor: CHROME_BG,
        '& [data-geek-sidebar="body"]': {
          scrollbarWidth: 'thin',
          scrollbarColor: `${MUTED} transparent`,
          '&::-webkit-scrollbar': { width: 8 },
          '&::-webkit-scrollbar-thumb': { backgroundColor: MUTED, borderRadius: 4 },
          '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
        },
      }}
      chromeSx={{ flexShrink: 0 }}
      // The primitive's caption ink is `text.secondary`, which follows the app
      // mode; captions use the chrome's own muted ink.
      sectionLabelSx={{ color: MUTED, textTransform: 'none', letterSpacing: 0, fontSize: '0.8125rem', lineHeight: 1.4, pb: 0.25, fontWeight: 600 }}
      itemSx={{
        color: MUTED,
        borderRadius: '10px',
        // Row = 44px (the touch floor: a tablet in landscape uses this
        // sidebar) with no gap between rows; the primitive's default stacks
        // padding and margins to ~54px a row.
        minHeight: 44,
        py: 0,
        mx: 1,
        my: 0,
        '& .MuiListItemText-root': { my: 0 },
        transition: 'background-color 0.15s ease, color 0.15s ease',
        '& .MuiListItemText-primary': { fontSize: '0.9375rem', fontWeight: 500 },
        '& .MuiListItemIcon-root': { color: 'inherit' },
        '@media (hover: hover)': {
          '&:hover': { bgcolor: HOVER_BG, color: INK },
        },
        '&.Mui-selected': {
          bgcolor: ACTIVE_BG,
          color: ACTIVE_INK,
          '& .MuiListItemIcon-root': { color: ACCENT },
          '& .MuiListItemText-primary': { fontWeight: 700 },
          '@media (hover: hover)': { '&:hover': { bgcolor: ACTIVE_BG } },
        },
      }}
    />
  );
};

export default Sidebar;
