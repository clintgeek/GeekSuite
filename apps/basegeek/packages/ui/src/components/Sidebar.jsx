/**
 * baseGeek sidebar — thin identity wrapper around the suite `GeekSidebar`.
 *
 * Structure (brand → grouped nav → user chip → Settings → Sign out) belongs to
 * the primitive; this file supplies only the Signal Box identity: a two-aspect
 * signal head for a mark, the stencil wordmark over a dymo-tape eyebrow, and
 * brass-selected rows.
 *
 * `GeekShell nav={…}` decides whether this panel sits in the permanent 220px
 * column or inside the mobile drawer, so there is no `isMobile` / `mobileOpen`
 * / collapse-rail plumbing here any more.
 */
import { Box, Typography } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { GeekSidebar, useGeekShell } from '@geeksuite/ui';
import { activeNavId, visibleNavSections } from './navConfig';
import { useBaseGeekAuth } from './AuthContext';
import SignalHead from '../signalbox/SignalHead';

/**
 * Brand block. Passed as a node rather than the primitive's
 * `{ monogram, name, tagline }` object because baseGeek's mark is a drawing,
 * not the shared translucent accent chip.
 *
 * The primitive wires `closeNav` for the object form only, so a node brand has
 * to close the mobile drawer itself.
 */
function Brand() {
  const { closeNav } = useGeekShell();

  return (
    <Box
      component={RouterLink}
      to="/"
      onClick={closeNav}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        width: '100%',
        height: '100%',
        minWidth: 0,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <SignalHead size={34} />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          noWrap
          sx={{
            fontFamily: 'fontFamilyPlate',
            fontWeight: 800,
            fontSize: '1.3rem',
            lineHeight: 1,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'text.primary',
          }}
        >
          baseGeek
        </Typography>
        <Box
          component="span"
          sx={(theme) => ({
            display: 'inline-block',
            mt: 0.5,
            px: 0.75,
            borderRadius: '2px',
            bgcolor: theme.palette.box.tape.black,
            color: theme.palette.box.tape.ink,
            fontFamily: theme.typography.fontFamilyMono,
            fontWeight: 700,
            fontSize: '0.75rem',
            lineHeight: 1.5,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          })}
        >
          signal box
        </Box>
      </Box>
    </Box>
  );
}

export default function Sidebar() {
  const location = useLocation();
  // Admin-only rows (DataGeek, UserGeek, AIGeek) are hidden from everyone else;
  // the routes themselves are gated by `RequireAdmin` in App.jsx and by
  // requireAdmin on the API. This only stops the nav offering a dead end.
  const { isAdmin } = useBaseGeekAuth();

  return (
    <GeekSidebar
      brand={<Brand />}
      sections={visibleNavSections(isAdmin)}
      activeId={activeNavId(location.pathname)}
      // Hairline under the brand band, where the old bespoke Divider used to be.
      brandSx={{ borderBottom: (theme) => `1px solid ${theme.palette.divider}` }}
      // Sign out keeps its coral-tinted hover from the bespoke layout; every
      // other row shares `itemSx`, so this is scoped by the primitive's hook.
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
        '& .MuiListItemText-primary': { fontSize: '0.8125rem', fontWeight: 400, letterSpacing: '0.01em' },
        '&:hover': { color: 'text.primary' },
        // The brass inset bar comes from the theme's `.Mui-selected`
        // override; only the ink weighting is decided here.
        '&.Mui-selected': {
          color: 'text.primary',
          '& .MuiListItemIcon-root': { color: 'primary.main' },
          '& .MuiListItemText-primary': { fontWeight: 700 },
        },
      }}
    />
  );
}
