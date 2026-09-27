/**
 * StoryGeek sidebar — thin identity wrapper around the suite `GeekSidebar`.
 *
 * Structure (brand → grouped nav → user chip → Settings → Sign out) belongs to
 * the primitive; this file only supplies the Candlelit Table identity: the d20
 * wordmark, small-caps section labels, and the candle-lit active row.
 *
 * `GeekShell nav={…}` decides whether this panel sits in the permanent 220px
 * column or inside the mobile drawer, so the old always-temporary Drawer, its
 * `mobileOpen` state and the hamburger that drove it are gone from the app.
 */
import { Box, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { GeekSidebar, useGeekShell } from '@geeksuite/ui';
import { activeNavId, navSectionsFor } from './navConfig';
import D20 from './primitives/D20';
import { fonts } from '../theme/theme';

/**
 * Brand block — the d20 and the two-tone wordmark. Passed as a node rather
 * than the primitive's `{ monogram, name }` object so the die survives.
 *
 * `closeNav` is called by hand: the primitive only wires close-on-navigate for
 * the object form of `brand`, so a node brand would otherwise leave the mobile
 * drawer standing open after a tap.
 */
function Brand() {
  const theme = useTheme();
  const c = theme.palette.candle;
  const { closeNav } = useGeekShell();

  return (
    <Box
      component={RouterLink}
      to="/"
      onClick={closeNav}
      aria-label="StoryGeek, all tales"
      sx={{ display: 'flex', alignItems: 'center', gap: 2, textDecoration: 'none', color: 'inherit', minHeight: 44 }}
    >
      <D20 size={28} value={20} color={c.accent} fill={alpha(c.accent, 0.1)}
        sx={{ filter: c.mode === 'dark' ? `drop-shadow(0 0 6px ${alpha(c.accent, 0.45)})` : 'none' }} />
      <Typography component="span" sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: '1.2rem', letterSpacing: '0.06em', lineHeight: 1 }}>
        <Box component="span" sx={{ color: 'text.primary' }}>Story</Box>
        <Box component="span" sx={{ color: c.accent }}>Geek</Box>
      </Typography>
    </Box>
  );
}

function Sidebar() {
  const theme = useTheme();
  const c = theme.palette.candle;
  const location = useLocation();

  return (
    <GeekSidebar
      brand={<Brand />}
      sections={navSectionsFor(location.pathname)}
      activeId={activeNavId(location.pathname)}
      sx={{
        bgcolor: 'background.paper',
        // The primitive has no per-section label hook, so reach the section
        // captions here: small-caps amber labels.
        '& section > .MuiTypography-caption': {
          fontFamily: fonts.ui,
          fontWeight: 700,
          letterSpacing: '0.16em',
          color: c.accentLabel,
        },
      }}
      // A node `brand` lands in a bare Box, so pin it against the flex column
      // the way the footer band already pins itself.
      chromeSx={{ flexShrink: 0 }}
      brandSx={{ borderBottom: `1px solid ${c.rule}` }}
      itemSx={{
        mb: 0.5,
        color: 'text.secondary',
        transition: 'background-color 0.2s ease, color 0.2s ease',
        '& .MuiListItemText-primary': {
          fontFamily: fonts.ui,
          fontSize: '0.9375rem',
          color: 'text.primary',
        },
        '@media (hover: hover)': { '&:hover': { backgroundColor: alpha(c.accent, 0.07) } },
        '&.Mui-selected': {
          backgroundColor: alpha(c.accent, 0.12),
          boxShadow: `inset 3px 0 0 ${c.accent}`,
          color: c.accent,
          '& .MuiListItemText-primary': { fontWeight: 700, color: c.accent },
          '@media (hover: hover)': { '&:hover': { backgroundColor: alpha(c.accent, 0.16) } },
        },
      }}
    />
  );
}

export default Sidebar;
