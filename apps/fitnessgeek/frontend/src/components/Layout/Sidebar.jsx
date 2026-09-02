/**
 * FitnessGeek sidebar — thin identity wrapper around the suite `GeekSidebar`.
 *
 * Structure (brand → grouped nav → user chip → Settings → Sign out) belongs
 * to the primitive; this file only supplies FitnessGeek's signature
 * always-dark chrome (`#0C0A09`) and teal (`#2DD4BF`) accents, in both
 * light and dark app modes — identity, not structure.
 *
 * `GeekShell nav={…}` decides whether this panel sits in the permanent 220px
 * column or inside the mobile drawer, so there is no `isMobile` / `onClose`
 * plumbing here.
 */
import { Box, Typography } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { GeekSidebar, geekLayout } from '@geeksuite/ui';
import { activeNavId, navSections } from './navConfig.jsx';

const INK = '#F5F5F4';
const MUTED = '#A8A29E';
const ACCENT = '#2DD4BF';
const CHROME_BG = '#0C0A09';

/**
 * Brand block, passed as a node rather than the primitive's
 * `{ monogram, name }` object so "geek" keeps its teal identity color
 * instead of the shared primary-tinted monogram chip.
 */
const Brand = () => (
  <Box
    component={RouterLink}
    to="/dashboard"
    sx={{
      display: 'flex',
      alignItems: 'center',
      px: 2.5,
      height: geekLayout.topBarHeight,
      textDecoration: 'none',
      color: 'inherit',
    }}
  >
    <Typography
      variant="h5"
      noWrap
      sx={{
        fontWeight: 400,
        color: INK,
        fontSize: '1.375rem',
        letterSpacing: '-0.02em',
        fontFamily: '"DM Serif Display", Georgia, serif',
      }}
    >
      fitness
      <Box component="span" sx={{ fontWeight: 400, color: ACCENT }}>
        geek
      </Box>
    </Typography>
  </Box>
);

const Sidebar = () => {
  const location = useLocation();


  return (
    <GeekSidebar
      brand={<Brand />}
      sections={navSections}
      activeId={activeNavId(location.pathname)}
      sx={{ bgcolor: CHROME_BG }}
      chromeSx={{ flexShrink: 0 }}
      itemSx={{
        color: MUTED,
        transition: 'background-color 0.15s ease, color 0.15s ease',
        '& .MuiListItemText-primary': { fontSize: '0.8125rem' },
        '&:hover': {
          bgcolor: 'rgba(255, 255, 255, 0.04)',
          color: INK,
        },
        '&.Mui-selected': {
          bgcolor: 'rgba(45, 212, 191, 0.08)',
          color: INK,
          boxShadow: `inset 3px 0 0 ${ACCENT}`,
          '& .MuiListItemText-primary': { fontWeight: 600 },
          '&:hover': { bgcolor: 'rgba(45, 212, 191, 0.12)' },
        },
      }}
    />
  );
};

export default Sidebar;
