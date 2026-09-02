/**
 * BuJoGeek mobile tab bar — rebuilt on the suite `GeekBottomNav` primitive.
 *
 * Structure: the four "Journal" nav items plus a "More" tab that opens a
 * bottom sheet for the "Library" items (Collections, Habits, Search,
 * Templates) and Keyboard Shortcuts. The sheet used to duplicate Sign out —
 * that row is removed: account actions live in the sidebar footer and the
 * top-bar account menu now, not here (`GeekBottomNav` would drop a Logout
 * item anyway, but the "More" sheet is bujogeek's own Drawer, not the
 * primitive, so the row had to be removed by hand).
 */
import { useState } from 'react';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { MoreHorizontal, Keyboard } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GeekBottomNav } from '@geeksuite/ui';
import { navSections, activeNavId } from './navConfig';

const primaryItems = navSections[0].items; // Today, Review, Plan, Tags
const moreSheetItems = navSections[1].items; // Collections, Habits, Search, Templates

const MobileTabBar = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const currentId = activeNavId(location.pathname);

  const items = [
    ...primaryItems.map(({ Icon, id, label, to }) => ({
      id,
      label,
      to,
      icon: <Icon size={22} strokeWidth={id === currentId ? 2.2 : 1.8} />,
    })),
    {
      id: 'more',
      label: 'More',
      icon: <MoreHorizontal size={22} strokeWidth={1.8} />,
      onClick: () => setMoreOpen(true),
    },
  ];

  return (
    <>
      <GeekBottomNav items={items} activeId={currentId} />

      {/* More sheet */}
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
            {moreSheetItems.map(({ id, label, to, Icon }) => (
              <ListItem key={id} disablePadding>
                <ListItemButton
                  onClick={() => { navigate(to); setMoreOpen(false); }}
                  sx={{ borderRadius: '8px' }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Icon size={20} />
                  </ListItemIcon>
                  <ListItemText primary={label} primaryTypographyProps={{ fontSize: '0.9375rem' }} />
                </ListItemButton>
              </ListItem>
            ))}
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => {
                  setMoreOpen(false);
                  setTimeout(() => {
                    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
                  }, 200);
                }}
                sx={{ borderRadius: '8px' }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <Keyboard size={20} />
                </ListItemIcon>
                <ListItemText primary="Keyboard Shortcuts" primaryTypographyProps={{ fontSize: '0.9375rem' }} />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
      </Drawer>
    </>
  );
};

export default MobileTabBar;
