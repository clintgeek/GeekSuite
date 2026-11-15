/**
 * TodoGeek mobile tab bar — Today, Upcoming, Done, Search on the suite
 * `GeekBottomNav`. There is no "More": nothing else is left to reach
 * (DOCS/SIMPLE_PLAN.md Phase 1).
 */
import { useLocation } from 'react-router-dom';
import { GeekBottomNav } from '@geeksuite/ui';
import { useTheme } from '@mui/material/styles';
import { navItems, activeNavId } from './navConfig';
import { penOf } from '../../theme/pen';
import { scrollMainToTop } from './scrollTop';

const MobileTabBar = () => {
  const location = useLocation();
  const theme = useTheme();
  const p = penOf(theme);
  const currentId = activeNavId(location.pathname);

  const items = navItems.map(({ Icon, id, label, to }) => ({
    id,
    label,
    to,
    icon: <Icon size={22} strokeWidth={id === currentId ? 2.25 : 1.75} />,
  }));

  return (
    <GeekBottomNav
      items={items}
      activeId={currentId}
      // Tapping the tab you are on goes to its top.
      onNavigate={(item) => { if (item.id === currentId) scrollMainToTop(); }}
      sx={{ backgroundColor: p.paper, borderTop: `1px solid ${p.rule}` }}
    />
  );
};

export default MobileTabBar;
