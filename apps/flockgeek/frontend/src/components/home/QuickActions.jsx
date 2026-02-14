import { Stack, Button } from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import EggIcon from '@mui/icons-material/Egg';
import GroupIcon from '@mui/icons-material/Groups';
import { Link as RouterLink } from 'react-router-dom';

const QuickActions = () => (
  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
    <Button component={RouterLink} to="/egg-log" variant="contained" startIcon={<EggIcon />}>Log eggs</Button>
    <Button component={RouterLink} to="/birds" variant="outlined" startIcon={<AddIcon />}>Add bird</Button>
    <Button component={RouterLink} to="/groups" variant="outlined" startIcon={<GroupIcon />}>Create group</Button>
  </Stack>
);

export default QuickActions;
