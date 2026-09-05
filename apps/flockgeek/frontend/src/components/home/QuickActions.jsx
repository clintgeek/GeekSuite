import { Stack, Button } from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import EggIcon from '@mui/icons-material/Egg';
import GroupIcon from '@mui/icons-material/Groups';
import { Link as RouterLink } from 'react-router-dom';

/**
 * Three stacked actions at xs — the right shape, at the wrong height. The
 * mobile grammar's 44px floor is pinned here rather than left to the theme,
 * because a `fullWidth` stacked button is exactly where a shrunken target
 * hurts most (MOBILE_UI_PLAN.md §2).
 */
const actionSx = { minHeight: 44, justifyContent: { xs: 'flex-start', sm: 'center' } };

const QuickActions = () => (
  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
    <Button component={RouterLink} to="/egg-log" variant="contained" startIcon={<EggIcon />} sx={actionSx}>Log eggs</Button>
    <Button component={RouterLink} to="/birds" variant="outlined" startIcon={<AddIcon />} sx={actionSx}>Add bird</Button>
    <Button component={RouterLink} to="/groups" variant="outlined" startIcon={<GroupIcon />} sx={actionSx}>Create group</Button>
  </Stack>
);

export default QuickActions;
