/**
 * baseGeek sidebar — thin identity wrapper around the suite `GeekSidebar`.
 *
 * Structure (brand → grouped nav → user chip → Settings → Sign out) belongs to
 * the primitive; this file supplies only baseGeek's Mission Control identity:
 * the gradient "bg" monogram, the Geist Mono eyebrow, the hairline under the
 * brand band and the dense amber-selected rows.
 *
 * `GeekShell nav={…}` decides whether this panel sits in the permanent 220px
 * column or inside the mobile drawer, so there is no `isMobile` / `mobileOpen`
 * / collapse-rail plumbing here any more.
 */
import { Box, Typography, alpha, useTheme } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { GeekSidebar, useGeekShell } from '@geeksuite/ui';
import { useBaseGeekAuth } from './AuthContext';
import { displayNameFrom, initialsFrom, secondaryFrom } from '../utils/userDisplay';
import { activeNavId, navSections } from './navConfig';

/**
 * Brand block. Passed as a node rather than the primitive's
 * `{ monogram, name, tagline }` object because baseGeek's mark is a gradient
 * tile with a mono eyebrow, not the shared translucent accent chip.
 *
 * The primitive wires `closeNav` for the object form only, so a node brand has
 * to close the mobile drawer itself.
 */
function Brand() {
  const theme = useTheme();
  const { closeNav } = useGeekShell();

  return (
    <Box
      component={RouterLink}
      to="/"
      onClick={closeNav}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        // Fills the primitive's 60px band; padding comes from `brandSx`.
        width: '100%',
        height: '100%',
        minWidth: 0,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: '8px',
          // The mark keeps its bright amber gradient in both modes, so its ink
          // is the fixed `onBrightFill` rather than `primary.contrastText`.
          background: theme.palette.accent.gradient,
          color: theme.palette.accent.onBrightFill,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 700,
          fontFamily: '"Geist Mono", monospace',
        }}
      >
        bg
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          noWrap
          sx={{
            fontWeight: 700,
            fontSize: '0.95rem',
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
            color: 'text.primary',
          }}
        >
          baseGeek
        </Typography>
        <Typography
          noWrap
          sx={{
            display: 'block',
            fontSize: '0.6rem',
            color: 'text.secondary',
            fontFamily: '"Geist Mono", monospace',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          mission control
        </Typography>
      </Box>
    </Box>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useBaseGeekAuth();

  return (
    <GeekSidebar
      brand={<Brand />}
      sections={navSections}
      activeId={activeNavId(location.pathname)}
      footer={{
        // The chip is the primitive's read-only identity block; Account is
        // reached from the top bar account menu (see TopBar.jsx and the
        // primitive gap noted there).
        user: isAuthenticated
          ? {
              name: displayNameFrom(user),
              secondary: secondaryFrom(user),
              initials: initialsFrom(user),
            }
          : undefined,
        settings: { to: '/settings' },
        onSignOut: isAuthenticated ? logout : undefined,
      }}
      // Hairline under the brand band, where the old bespoke Divider used to be.
      brandSx={{ borderBottom: (theme) => `1px solid ${theme.palette.divider}` }}
      // Sign out keeps its coral-tinted hover from the bespoke layout; every
      // other row shares `itemSx`, so this is scoped by the primitive's hook.
      footerSx={{
        '& [data-geek-nav-footer="signout"]:hover': {
          backgroundColor: (theme) => alpha(theme.palette.error.main, 0.08),
        },
      }}
      itemSx={{
        // The app theme's MuiListItemButton override adds `margin: 2px 8px`,
        // which would double up on the primitive's own `List` inset.
        mx: 0,
        mb: 0.25,
        color: 'text.secondary',
        '& .MuiListItemIcon-root': {
          minWidth: 36,
          '& .MuiSvgIcon-root': { fontSize: 20 },
        },
        '& .MuiListItemText-primary': { fontSize: '0.8125rem', fontWeight: 400 },
        '&:hover': { color: 'text.primary' },
        // The amber inset bar and glow come from the theme's `.Mui-selected`
        // override; only the ink weighting is decided here.
        '&.Mui-selected': {
          color: 'text.primary',
          '& .MuiListItemIcon-root': { color: 'primary.main' },
          '& .MuiListItemText-primary': { fontWeight: 600 },
        },
      }}
    />
  );
}
