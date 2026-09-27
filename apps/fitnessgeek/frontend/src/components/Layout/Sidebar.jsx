/**
 * FitnessGeek sidebar — thin identity wrapper around the suite `GeekSidebar`.
 *
 * Structure (brand → grouped nav → user chip → Settings → Sign out) belongs
 * to the primitive; this file only supplies Market Morning's chalkboard
 * chrome (chrome.js) — the same board in light and dark app modes, written on
 * in chalk with a lemon accent — and the mode-aware section list.
 *
 * `GeekShell nav={…}` decides whether this panel sits in the permanent 220px
 * column or inside the mobile drawer, so there is no `isMobile` / `onClose`
 * plumbing here.
 */
import { Box, Typography } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { GeekSidebar, geekLayout } from '@geeksuite/ui';
import { activeNavId, navSectionsFor } from './navConfig.jsx';
import { ACCENT, ACTIVE_BG, CHROME_BG, HOVER_BG, INK, MUTED } from './chrome.js';
import { useExperience } from '../../contexts/ExperienceContext.jsx';

/** Brand block: a lemon dot and the name, in chalk. */
const Brand = () => (
  <Box
    component={RouterLink}
    to="/dashboard"
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1.25,
      px: 2.5,
      height: geekLayout.topBarHeight,
      textDecoration: 'none',
      color: 'inherit',
    }}
  >
    <Box aria-hidden sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: ACCENT, boxShadow: `0 0 0 4px rgba(246, 201, 69, 0.18)` }} />
    <Typography
      variant="h5"
      noWrap
      sx={{ fontWeight: 800, color: INK, fontSize: '1.25rem', letterSpacing: '-0.01em' }}
    >
      fitness
      <Box component="span" sx={{ color: ACCENT }}>
        geek
      </Box>
    </Typography>
  </Box>
);

const Sidebar = () => {
  const location = useLocation();
  const { effectiveMode } = useExperience();

  return (
    <GeekSidebar
      brand={<Brand />}
      sections={navSectionsFor(effectiveMode)}
      activeId={activeNavId(location.pathname)}
      sx={{ bgcolor: CHROME_BG }}
      chromeSx={{ flexShrink: 0 }}
      // The primitive's caption ink is `text.secondary`, which follows the app
      // mode; on the board it would be dark ink in light mode. Captions use
      // the chalk's own muted ink in both modes.
      sectionLabelSx={{ color: MUTED, textTransform: 'none', letterSpacing: 0, fontSize: '0.8125rem', fontWeight: 700 }}
      itemSx={{
        color: MUTED,
        borderRadius: 999,
        mx: 1,
        transition: 'background-color 0.15s ease, color 0.15s ease',
        '& .MuiListItemText-primary': { fontSize: '0.9375rem', fontWeight: 600 },
        '& .MuiListItemIcon-root': { color: 'inherit' },
        '@media (hover: hover)': {
          '&:hover': { bgcolor: HOVER_BG, color: INK },
        },
        '&.Mui-selected': {
          bgcolor: ACTIVE_BG,
          color: INK,
          '& .MuiListItemIcon-root': { color: ACCENT },
          '& .MuiListItemText-primary': { fontWeight: 800 },
          '@media (hover: hover)': { '&:hover': { bgcolor: ACTIVE_BG } },
        },
      }}
    />
  );
};

export default Sidebar;
