/**
 * StoryGeek sidebar — thin identity wrapper around the suite `GeekSidebar`.
 *
 * Structure (brand → grouped nav → user chip → Settings → Sign out) belongs to
 * the primitive; this file only supplies the Arcane Codex identity: the gold
 * wordmark, Cinzel labels, the gold inset bar on the active chapter and the
 * gold-tinted avatar.
 *
 * `GeekShell nav={…}` decides whether this panel sits in the permanent 220px
 * column or inside the mobile drawer, so the old always-temporary Drawer, its
 * `mobileOpen` state and the hamburger that drove it are gone from the app.
 */
import { Box, Typography, alpha, useTheme } from '@mui/material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { GeekSidebar, useGeekShell } from '@geeksuite/ui';
import { activeNavId, navSectionsFor } from './navConfig';

/**
 * Brand block — the wordmark that used to live in the top bar. Passed as a
 * node rather than the primitive's `{ monogram, name }` object so the
 * two-tone "Story|Geek" split and the glowing tome survive.
 *
 * `closeNav` is called by hand: the primitive only wires close-on-navigate for
 * the object form of `brand`, so a node brand would otherwise leave the mobile
 * drawer standing open after a tap.
 */
function Brand({ gold }) {
  const { closeNav } = useGeekShell();

  return (
    <Box
      component={RouterLink}
      to="/"
      onClick={closeNav}
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 0.75,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <AutoStoriesIcon
        sx={{
          fontSize: 22,
          color: gold,
          alignSelf: 'center',
          filter: `drop-shadow(0 0 4px ${alpha(gold, 0.3)})`,
        }}
      />
      <Typography
        component="span"
        sx={{
          fontFamily: '"Cinzel Decorative", serif',
          fontWeight: 700,
          fontSize: '1.15rem',
          letterSpacing: '0.05em',
          color: 'text.primary',
        }}
      >
        Story
      </Typography>
      <Typography
        component="span"
        sx={{
          fontFamily: '"Cinzel Decorative", serif',
          fontWeight: 700,
          fontSize: '1.15rem',
          letterSpacing: '0.05em',
          color: gold,
        }}
      >
        Geek
      </Typography>
    </Box>
  );
}

function Sidebar() {
  const theme = useTheme();
  const location = useLocation();
  const gold = theme.palette.codex?.gold || '#c9a84c';


  return (
    <GeekSidebar
      brand={<Brand gold={gold} />}
      sections={navSectionsFor(location.pathname)}
      activeId={activeNavId(location.pathname)}
      sx={{
        bgcolor: 'background.paper',
        // The primitive has no per-section label hook, so reach the section
        // captions here: gold overlines, as the "Chapters" divider header was.
        '& section > .MuiTypography-caption': {
          fontFamily: '"Cinzel", serif',
          color: alpha(gold, 0.6),
        },
      }}
      // A node `brand` lands in a bare Box, so pin it against the flex column
      // the way the footer band already pins itself.
      chromeSx={{ flexShrink: 0 }}
      brandSx={{ borderBottom: `1px solid ${alpha(gold, 0.15)}` }}
      itemSx={{
        mb: 0.5,
        py: 1.25,
        color: 'text.secondary',
        transition: 'background-color 0.2s ease, color 0.2s ease',
        '& .MuiListItemText-primary': {
          fontFamily: '"Cinzel", serif',
          fontSize: '0.8rem',
          letterSpacing: '0.03em',
          color: 'text.primary',
        },
        '&:hover': { backgroundColor: alpha(gold, 0.06) },
        '&.Mui-selected': {
          backgroundColor: alpha(gold, 0.12),
          borderLeft: `3px solid ${gold}`,
          color: gold,
          '& .MuiListItemText-primary': { fontWeight: 600, color: gold },
          '&:hover': { backgroundColor: alpha(gold, 0.18) },
        },
      }}
    />
  );
}

export default Sidebar;
