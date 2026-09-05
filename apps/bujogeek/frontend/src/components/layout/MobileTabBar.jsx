/**
 * BuJoGeek mobile tab bar — rebuilt on the suite `GeekBottomNav` primitive.
 *
 * Structure: the four "Journal" nav items plus a "More" tab that opens a
 * bottom sheet for the "Library" items (Collections, Habits, Search,
 * Templates). The sheet used to duplicate Sign out — that row is gone;
 * account actions live in the sidebar footer and the top-bar account menu.
 *
 * Two mobile-pass changes (MOBILE_UI_PLAN.md §4):
 *   - the sheet was the suite's only hand-rolled bottom `Drawer`; it now
 *     rides `GeekSheet`, so it inherits the grab handle, the safe-area
 *     padding, the 92dvh cap and Escape-to-close.
 *   - the "Keyboard Shortcuts" row synthesised a `?` keypress, which does
 *     nothing on a device with no keyboard. It is dropped under
 *     `@media (hover: none)` — i.e. on touch — and kept everywhere else.
 */
import { useState } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
} from '@mui/material';
import { MoreHorizontal, Keyboard } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GeekBottomNav, GeekSheet } from '@geeksuite/ui';
import { navSections, activeNavId } from './navConfig';

const primaryItems = navSections[0].items; // Today, Review, Plan, Tags
const moreSheetItems = navSections[1].items; // Collections, Habits, Search, Templates

const MobileTabBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  // No hover means no pointer means, in practice, no keyboard: the shortcuts
  // row is dead weight there.
  const isTouch = useMediaQuery('(hover: none)');

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
      <GeekSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
        bodySx={{ px: 1 }}
      >
        <Box sx={{ pb: 1 }}>
          <List disablePadding>
            {moreSheetItems.map((item) => (
              <ListItem key={item.id} disablePadding>
                <ListItemButton
                  onClick={() => { navigate(item.to); setMoreOpen(false); }}
                  sx={{ borderRadius: '8px', minHeight: 44 }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <item.Icon size={20} />
                  </ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.9375rem' }} />
                </ListItemButton>
              </ListItem>
            ))}
            {!isTouch && (
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => {
                    setMoreOpen(false);
                    setTimeout(() => {
                      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
                    }, 200);
                  }}
                  sx={{ borderRadius: '8px', minHeight: 44 }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Keyboard size={20} />
                  </ListItemIcon>
                  <ListItemText primary="Keyboard Shortcuts" primaryTypographyProps={{ fontSize: '0.9375rem' }} />
                </ListItemButton>
              </ListItem>
            )}
          </List>
        </Box>
      </GeekSheet>
    </>
  );
};

export default MobileTabBar;
